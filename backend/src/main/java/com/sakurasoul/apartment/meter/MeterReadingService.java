package com.sakurasoul.apartment.meter;

import com.sakurasoul.apartment.common.AppTime;
import com.sakurasoul.apartment.common.Months;
import com.sakurasoul.apartment.meter.MeterReadingDtos.MeterImportError;
import com.sakurasoul.apartment.meter.MeterReadingDtos.MeterImportReport;
import com.sakurasoul.apartment.meter.MeterReadingDtos.MeterImportRow;
import com.sakurasoul.apartment.meter.MeterReadingDtos.MeterReadingResponse;
import com.sakurasoul.apartment.room.Room;
import com.sakurasoul.apartment.room.RoomRepository;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.YearMonth;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * หน่วยน้ำไฟรายเดือนของห้อง (SSK-166) ตาม docs/api-contract-phase2-backend.md
 * <p>
 * การนำเข้าตรวจทั้งไฟล์ก่อน (MeterCsv) แล้วบันทึกทุกแถวที่ถูกในคำสั่งเดียวด้วย INSERT ... ON CONFLICT
 * ไม่ใช่บันทึกผ่าน JPA ทีละแถว เหตุผลสองข้อ
 * <ul>
 *   <li>ไฟล์มีได้ถึง 5,000 แถว id แบบ IDENTITY ทำให้ Hibernate ต้องยิง INSERT ทีละแถว ส่วนที่นี่ส่งเป็น batch เดียว</li>
 *   <li>สองการนำเข้าที่ทับห้องกับเดือนเดียวกันพร้อมกันไม่ชน unique constraint จนได้ 409
 *       ฐานข้อมูลตัดสินให้ทีละแถวว่าจะข้ามหรือทับ และตัวเลข imported มาจากจำนวนแถวที่เขียนจริง</li>
 * </ul>
 */
@Service
public class MeterReadingService {

    private static final String INSERT = """
            INSERT INTO meter_reading (room_id, reading_month, electric_units, water_units, source, imported_at)
            VALUES (?, ?, ?, ?, 'CSV', ?)
            ON CONFLICT (room_id, reading_month) DO\s""";

    /** overwrite=true แถวที่มีค่าอยู่แล้วถูกทับทั้งหน่วย ที่มา และเวลานำเข้า */
    private static final String INSERT_OR_REPLACE = INSERT + """
            UPDATE SET electric_units = EXCLUDED.electric_units, water_units = EXCLUDED.water_units,
                       source = EXCLUDED.source, imported_at = EXCLUDED.imported_at""";

    /** overwrite=false แถวที่มีค่าอยู่แล้ว (รวมที่อีกการนำเข้าเพิ่งเขียนไป) ถูกข้าม นับได้ 0 แถว */
    private static final String INSERT_OR_SKIP = INSERT + "NOTHING";

    private final MeterReadingRepository meterReadingRepository;
    private final RoomRepository roomRepository;
    private final JdbcTemplate jdbc;

    public MeterReadingService(MeterReadingRepository meterReadingRepository, RoomRepository roomRepository,
            JdbcTemplate jdbc) {
        this.meterReadingRepository = meterReadingRepository;
        this.roomRepository = roomRepository;
        this.jdbc = jdbc;
    }

    /** ค่าของเดือนนั้น หรือทุกเดือนใหม่ก่อนเก่าเมื่อไม่ส่ง month เดือนเดียวกันเรียงตามผังตึก */
    @Transactional(readOnly = true)
    public List<MeterReadingResponse> list(String month) {
        List<MeterReading> readings = month == null || month.isBlank()
                ? meterReadingRepository.findAllNewestFirst()
                : meterReadingRepository.findInMonth(Months.parse(month, "month must be YYYY-MM").atDay(1));
        return readings.stream().map(MeterReadingResponse::of).toList();
    }

    /**
     * ตรวจไฟล์แล้วตอบรายงาน ถ้า dryRun=false บันทึกทุกแถวที่ถูกใน transaction เดียว แถวผิดไม่บันทึก
     * แถวที่ห้องกับเดือนมีค่าอยู่แล้วถูกข้ามเว้นแต่ overwrite=true ใบเสร็จที่ออกไปแล้วไม่ถูกแตะ
     */
    @Transactional
    public MeterImportReport importCsv(MultipartFile file, boolean dryRun, boolean overwrite) {
        if (file == null) {
            throw new IllegalArgumentException("Please choose a CSV file");
        }
        Map<String, Room> rooms = roomRepository.findAll().stream()
                .collect(Collectors.toMap(Room::getRoomNumber, Function.identity()));
        MeterCsv.Result checked = MeterCsv.check(contentOf(file), rooms.keySet(), YearMonth.from(AppTime.today()));

        Set<RoomMonth> existing = existingAmong(checked.rows(), rooms);
        List<MeterCsv.Row> toSave = checked.rows().stream()
                .filter(row -> overwrite || !existing.contains(RoomMonth.of(row, rooms)))
                .toList();
        int imported = dryRun ? 0 : save(toSave, rooms, overwrite);
        int skipped = checked.rows().size() - (dryRun ? toSave.size() : imported);

        List<MeterImportRow> rows = checked.rows().stream()
                .map(row -> new MeterImportRow(row.line(), row.roomNumber(), row.month().toString(),
                        row.electricUnits(), row.waterUnits(), existing.contains(RoomMonth.of(row, rooms))))
                .toList();
        List<MeterImportError> errors = checked.errors().stream()
                .map(error -> new MeterImportError(error.line(), error.message()))
                .toList();
        return new MeterImportReport(dryRun, rows, errors, imported, skipped);
    }

    /** ห้องกับเดือนที่มีค่าในฐานข้อมูลอยู่แล้ว ถามเฉพาะเดือนที่อยู่ในไฟล์ */
    private Set<RoomMonth> existingAmong(List<MeterCsv.Row> rows, Map<String, Room> rooms) {
        Set<LocalDate> months = rows.stream().map(row -> row.month().atDay(1)).collect(Collectors.toSet());
        if (months.isEmpty()) {
            return Set.of();
        }
        return meterReadingRepository.findByReadingMonthIn(months).stream()
                .map(reading -> new RoomMonth(reading.getRoom().getId(), YearMonth.from(reading.getReadingMonth())))
                .collect(Collectors.toSet());
    }

    /**
     * เขียนทุกแถวเป็น batch เดียว คืนจำนวนแถวที่เขียนจริง
     * pgjdbc ตอบจำนวนแถวต่อคำสั่ง แถวที่ ON CONFLICT DO NOTHING ข้ามได้ 0 ผลรวมจึงเป็นจำนวนที่บันทึกจริง
     */
    private int save(List<MeterCsv.Row> rows, Map<String, Room> rooms, boolean overwrite) {
        if (rows.isEmpty()) {
            return 0;
        }
        // ตัดเหลือมิลลิวินาทีให้ตรงกับรูปแบบ JSON ส่งเป็น OffsetDateTime ให้ driver ไม่ต้องเดาเขตเวลา
        OffsetDateTime importedAt = Instant.now().truncatedTo(ChronoUnit.MILLIS).atOffset(ZoneOffset.UTC);
        List<Object[]> values = rows.stream()
                .map(row -> new Object[] {rooms.get(row.roomNumber()).getId(), row.month().atDay(1),
                        row.electricUnits(), row.waterUnits(), importedAt})
                .toList();
        int[] written = jdbc.batchUpdate(overwrite ? INSERT_OR_REPLACE : INSERT_OR_SKIP, values);
        return Arrays.stream(written).sum();
    }

    private static byte[] contentOf(MultipartFile file) {
        try {
            return file.getBytes();
        } catch (IOException ex) {
            throw new UncheckedIOException("Could not read the uploaded file", ex);
        }
    }

    /** ห้องกับเดือนคู่หนึ่ง คีย์เดียวกับ meter_reading_room_month_uk */
    private record RoomMonth(Long roomId, YearMonth month) {

        static RoomMonth of(MeterCsv.Row row, Map<String, Room> rooms) {
            return new RoomMonth(rooms.get(row.roomNumber()).getId(), row.month());
        }
    }
}
