package com.sakurasoul.apartment.meter;

import com.fasterxml.jackson.annotation.JsonFormat;
import com.sakurasoul.apartment.common.Months;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

/** รูปร่าง JSON ของค่ามิเตอร์ ตรงกับ MeterReading / MeterImportReport ใน frontend/src/api/types.ts */
public final class MeterReadingDtos {

    private MeterReadingDtos() {
    }

    public record MeterReadingResponse(
            Long id,
            Long roomId,
            String roomNumber,
            /** "YYYY-MM" */
            String month,
            /** kWh */
            BigDecimal electricUnits,
            /** m³ */
            BigDecimal waterUnits,
            MeterReadingSource source,
            @JsonFormat(shape = JsonFormat.Shape.STRING,
                    pattern = "yyyy-MM-dd'T'HH:mm:ss.SSSX", timezone = "UTC")
            Instant importedAt) {

        static MeterReadingResponse of(MeterReading reading) {
            return new MeterReadingResponse(reading.getId(), reading.getRoom().getId(),
                    reading.getRoom().getRoomNumber(), Months.format(reading.getReadingMonth()),
                    reading.getElectricUnits(), reading.getWaterUnits(), reading.getSource(), reading.getImportedAt());
        }
    }

    /** แถวที่ถูกต้องหนึ่งแถวของไฟล์ line นับหัวตารางเป็นบรรทัด 1 */
    public record MeterImportRow(
            int line,
            String roomNumber,
            String month,
            BigDecimal electricUnits,
            BigDecimal waterUnits,
            /** ห้องกับเดือนนี้มีค่าอยู่แล้ว ถูกข้ามเว้นแต่ส่ง overwrite=true */
            boolean alreadyExists) {
    }

    public record MeterImportError(int line, String message) {
    }

    /**
     * ผลตรวจหรือผลนำเข้า ก้อนเดียวกันทั้ง dryRun=true และ false
     * imported คือแถวที่บันทึกจริง (dry run เป็น 0) skipped คือแถวที่ถูกต้องแต่ไม่ได้บันทึกเพราะมีค่าเดิมและไม่ได้ขอให้ทับ
     */
    public record MeterImportReport(
            boolean dryRun,
            List<MeterImportRow> rows,
            List<MeterImportError> errors,
            int imported,
            int skipped) {
    }
}
