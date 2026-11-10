package com.sakurasoul.apartment.roomrate;

import com.sakurasoul.apartment.billing.ReceiptRepository;
import com.sakurasoul.apartment.common.ConflictException;
import com.sakurasoul.apartment.common.Months;
import com.sakurasoul.apartment.common.NotFoundException;
import com.sakurasoul.apartment.room.Room;
import com.sakurasoul.apartment.room.RoomRepository;
import com.sakurasoul.apartment.roomrate.RoomRateDtos.RoomRateRequest;
import com.sakurasoul.apartment.roomrate.RoomRateDtos.RoomRateResponse;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.temporal.ChronoUnit;
import java.util.List;

/**
 * อัตราต่อห้องตามช่วงเวลา (SSK-162) ตาม docs/api-contract-lease.md หัวข้อ "อัตราต่อห้องตามช่วงเวลา"
 * <p>
 * ตารางเพิ่มอย่างเดียว service นี้จึงมีแค่อ่านกับเพิ่ม การใช้อัตราตอนทำสัญญาอยู่ที่ LeaseService.create
 * ส่วน baseRent ของรายการห้องอยู่ที่ RoomService ทั้งสองที่ถามผ่าน RoomRateRepository.inEffect ด้วยกฎเดียวกัน
 */
@Service
public class RoomRateService {

    private final RoomRateRepository roomRateRepository;
    private final RoomRepository roomRepository;
    private final ReceiptRepository receiptRepository;

    public RoomRateService(RoomRateRepository roomRateRepository, RoomRepository roomRepository,
            ReceiptRepository receiptRepository) {
        this.roomRateRepository = roomRateRepository;
        this.roomRepository = roomRepository;
        this.receiptRepository = receiptRepository;
    }

    /** ประวัติอัตราของห้อง ใหม่ก่อนเก่า ห้องที่ยังไม่เคยตั้งได้รายการว่าง */
    @Transactional(readOnly = true)
    public List<RoomRateResponse> history(Long roomId) {
        if (!roomRepository.existsById(roomId)) {
            throw new NotFoundException("unit", roomId);
        }
        return roomRateRepository.findByRoomIdOrderByEffectiveFromDesc(roomId).stream()
                .map(RoomRateResponse::of)
                .toList();
    }

    /** อัตราของทุกห้องที่เริ่มตั้งแต่เดือน from เก่าก่อนใหม่ ไม่ส่ง from ได้ทั้งหมด */
    @Transactional(readOnly = true)
    public List<RoomRateResponse> startingFrom(String from) {
        List<RoomRate> rates = from == null || from.isBlank()
                ? roomRateRepository.findAllByOrderByEffectiveFromAscRoomIdAsc()
                : roomRateRepository.findByEffectiveFromGreaterThanEqualOrderByEffectiveFromAscRoomIdAsc(
                        Months.parse(from, "from must be YYYY-MM").atDay(1));
        return rates.stream().map(RoomRateResponse::of).toList();
    }

    /**
     * ตั้งอัตราใหม่ให้ห้องหนึ่ง ลำดับการตรวจเหมือน backend จำลองฝั่งหน้าเว็บ (mockApi.ts)
     * คือห้องไม่มี 404 → ค่าผิด 400 → ย้อนหลังทับบิลที่ออกแล้ว 409 → เดือนซ้ำ 409
     * <p>
     * <b>ห้ามตั้งย้อนหลังทับเดือนที่ห้องนี้ออกบิลไปแล้ว</b> ถึงอัตราใหม่จะมีผลกับสัญญาใหม่เท่านั้นก็ตาม
     * บิลของเดือนนั้นจะดูเหมือนคิดผิดอัตราตอนเปิดดูประวัติคู่กัน (เกณฑ์ตรวจในการ์ด SSK-162)
     * <p>
     * ล็อกแถวห้องก่อนเช็ค ให้สองคำขอที่ตั้งเดือนเดียวกันพร้อมกันเข้าทำงานทีละคำขอ คำขอที่สองจึงได้ 409
     * ที่บอกเดือนแทนที่จะไปชน room_rate_room_month_uk ตอนบันทึก ล็อกเดียวกับที่ LeaseService.create ใช้
     * ทำสัญญากับตั้งอัตราของห้องเดียวกันพร้อมกันจึงไม่แย่งกันอ่านอัตราที่ยังบันทึกไม่เสร็จ
     */
    @Transactional
    public RoomRateResponse add(Long roomId, RoomRateRequest request) {
        Room room = roomRepository.findByIdForUpdate(roomId)
                .orElseThrow(() -> new NotFoundException("unit", roomId));

        String invalid = RoomRateRules.validate(request);
        if (invalid != null) {
            throw new IllegalArgumentException(invalid);
        }

        YearMonth month = Months.parse(request.effectiveFrom(), RoomRateRules.MONTH_MESSAGE);
        LocalDate firstDay = month.atDay(1);
        if (receiptRepository.existsByLeaseRoomIdAndBillingMonthGreaterThanEqual(roomId, firstDay)) {
            throw new ConflictException("A bill for " + month
                    + " or later has already been issued for this unit. Choose a later month.");
        }
        if (roomRateRepository.existsByRoomIdAndEffectiveFrom(roomId, firstDay)) {
            throw new ConflictException("A rate starting " + month + " already exists for this unit");
        }

        // ตัดเวลาเหลือมิลลิวินาที ให้ค่าที่ตอบกลับตรงกับรูปแบบ JSON และค่าที่อ่านจากฐานทีหลัง
        RoomRate rate = new RoomRate(room, month, request.monthlyRent(), request.electricRatePerUnit(),
                request.waterRatePerUnit(), request.commonAreaFee(), request.internetFee(),
                trimToNull(request.note()), Instant.now().truncatedTo(ChronoUnit.MILLIS));
        return RoomRateResponse.of(roomRateRepository.saveAndFlush(rate));
    }

    private static String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
