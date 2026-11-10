package com.sakurasoul.apartment.roomrate;

import com.sakurasoul.apartment.apartmentconfig.ApartmentConfigRules;
import com.sakurasoul.apartment.common.Months;
import com.sakurasoul.apartment.roomrate.RoomRateDtos.RoomRateRequest;

import java.math.BigDecimal;

/**
 * ตรวจอัตราต่อห้องก่อนบันทึก (SSK-162) เป็นฝาแฝดของ validateRoomRate ใน frontend/src/domain/roomRate.ts
 * <p>
 * ลำดับการตรวจ เพดาน และข้อความต้องตรงกันทุกตัวอักษร หน้าเว็บเตือนด้วยกฎฝั่งโน้นก่อนกดส่ง ฝั่งนี้เป็นตาข่ายชั้นสุดท้าย
 * อัตราสี่ตัวใช้กฎของ Apartment Config เหมือนที่ฝั่งหน้าเว็บเรียก validateApartmentConfig ต่อ
 * <p>
 * ช่องโน้ตเป็นกฎของฝั่งนี้อย่างเดียว เพราะหน้าเว็บไม่ได้จำกัดความยาว แต่คอลัมน์เก็บได้ 200 ตัว
 */
final class RoomRateRules {

    static final String MONTH_MESSAGE = "Please choose the month the rate starts (YYYY-MM)";

    /** กันพิมพ์ผิดเหมือนอัตราทั้งอาคาร ค่าเช่าห้องที่นี่ราว 3,500 ถึง 4,500 เพดานล้านเผื่อไว้มากแล้ว */
    private static final BigDecimal MAX_MONTHLY_RENT = new BigDecimal("1000000");

    private static final int MAX_NOTE_LENGTH = 200;

    private RoomRateRules() {
    }

    /** คืนข้อความเตือนช่องแรกที่ผิด หรือ null เมื่อกรอกถูกทุกช่อง */
    static String validate(RoomRateRequest request) {
        if (!Months.isValid(request.effectiveFrom())) {
            return MONTH_MESSAGE;
        }
        BigDecimal rent = request.monthlyRent();
        if (rent == null) {
            return "Monthly rent must be a number";
        }
        if (rent.signum() < 0) {
            return "Monthly rent cannot be negative";
        }
        if (rent.compareTo(MAX_MONTHLY_RENT) > 0) {
            return "Monthly rent is too high";
        }
        String rates = ApartmentConfigRules.validateRates(request.electricRatePerUnit(),
                request.waterRatePerUnit(), request.commonAreaFee(), request.internetFee());
        if (rates != null) {
            return rates;
        }
        if (request.note() != null && request.note().trim().length() > MAX_NOTE_LENGTH) {
            return "The note must be 200 characters or fewer";
        }
        return null;
    }
}
