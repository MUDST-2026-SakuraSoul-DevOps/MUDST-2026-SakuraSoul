package com.sakurasoul.apartment.extracharge;

import com.sakurasoul.apartment.common.Months;
import com.sakurasoul.apartment.extracharge.ExtraChargeDtos.ExtraChargeRequest;

import java.math.BigDecimal;
import java.time.YearMonth;
import java.util.Arrays;

/**
 * ตรวจค่าใช้จ่ายพิเศษก่อนบันทึก (SSK-165) เป็นฝาแฝดของ validateExtraCharge ใน frontend/src/domain/extraCharge.ts
 * <p>
 * ลำดับการตรวจ เพดาน และข้อความต้องตรงกันทุกตัวอักษร หน้าเว็บเตือนด้วยกฎฝั่งโน้นก่อนกดส่ง ฝั่งนี้เป็นตาข่ายชั้นสุดท้าย
 * ต่างจาก RoomRateRules ตรงที่คืนค่าที่แปลงแล้วแทนข้อความ ผู้เรียกจะได้ไม่ต้องแปลงเดือนกับความถี่ซ้ำอีกรอบ
 */
final class ExtraChargeRules {

    private static final int MAX_LABEL_LENGTH = 80;

    /** เพดานเดียวกับหน้าเว็บ กันพิมพ์ศูนย์เกิน ค่าใช้จ่ายพิเศษจริงของหออยู่ในหลักร้อย */
    private static final BigDecimal MAX_AMOUNT = new BigDecimal("1000000");

    private ExtraChargeRules() {
    }

    /**
     * ตรวจตามลำดับ ชื่อ → ยอด → ความถี่ → เดือนแรก → เดือนสุดท้าย ช่องแรกที่ผิดโยน IllegalArgumentException
     * พร้อมข้อความของช่องนั้น ซึ่ง ApiExceptionHandler แปลงเป็น 400
     * <p>
     * ผ่านแล้วได้ค่าที่พร้อมเก็บ ชื่อตัดช่องว่างหัวท้าย เดือนสุดท้ายที่ว่างเป็น null
     * ค่าครั้งเดียวทิ้งเดือนสุดท้ายเสมอแบบเดียวกับ backend จำลอง แต่ยังตรวจรูปแบบก่อนทิ้ง เพราะหน้าเว็บก็ตรวจ
     */
    static ExtraChargeTerms parse(ExtraChargeRequest request) {
        String label = request.label() == null ? "" : request.label().trim();
        if (label.isEmpty()) {
            throw new IllegalArgumentException("Please describe the charge");
        }
        if (label.length() > MAX_LABEL_LENGTH) {
            throw new IllegalArgumentException("The description must be 80 characters or fewer");
        }

        BigDecimal amount = request.amount();
        if (amount == null) {
            throw new IllegalArgumentException("Amount must be a number");
        }
        if (amount.signum() < 0) {
            throw new IllegalArgumentException("Amount cannot be negative");
        }
        if (amount.compareTo(MAX_AMOUNT) > 0) {
            throw new IllegalArgumentException("Amount is too high");
        }

        ChargeRecurrence recurrence = Arrays.stream(ChargeRecurrence.values())
                .filter(value -> value.name().equals(request.recurrence()))
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException("Frequency must be ONE_TIME or MONTHLY"));

        YearMonth startMonth = Months.parse(request.startMonth(), "Please choose the first month to charge (YYYY-MM)");
        YearMonth endMonth = null;
        if (request.endMonth() != null && !request.endMonth().isBlank()) {
            endMonth = Months.parse(request.endMonth(), "The last month must be YYYY-MM");
            if (endMonth.isBefore(startMonth)) {
                throw new IllegalArgumentException("The last month cannot be before the first month");
            }
        }

        return new ExtraChargeTerms(label, amount, recurrence, startMonth,
                recurrence == ChargeRecurrence.MONTHLY ? endMonth : null);
    }
}
