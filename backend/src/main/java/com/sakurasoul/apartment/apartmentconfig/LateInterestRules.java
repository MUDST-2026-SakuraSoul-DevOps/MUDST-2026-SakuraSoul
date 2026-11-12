package com.sakurasoul.apartment.apartmentconfig;

import com.sakurasoul.apartment.apartmentconfig.ApartmentConfigDtos.LateInterestRequest;

import java.math.BigDecimal;

/**
 * ตรวจดอกเบี้ยค้างชำระกับวันผ่อนผันก่อนบันทึก (SSK-164) ข้อความตามสัญญา API ใน docs/api-contract-payments-phase2.md
 * <p>
 * ไม่ส่งช่องไหนมาถือว่าผิด ไม่ใช่คงค่าเดิม เพราะ endpoint นี้ตั้งสองค่านี้คู่กันเสมอ
 * ตรวจค่าดิบที่ส่งมา ไม่ใช่ค่าหลังปัด 100.001 จึงเกินร้อย ส่วนค่าที่ผ่านแล้วถูกปัดสองตำแหน่งก่อนเก็บ
 * <p>
 * ฐานข้อมูลกันช่วงค่าอีกชั้นด้วย apartment_config_late_interest_ck กับ apartment_config_grace_days_ck ใน V21
 */
final class LateInterestRules {

    static final String PERCENT_MESSAGE = "Late interest must be between 0 and 100 percent per month";
    static final String GRACE_DAYS_MESSAGE = "Grace days must be a whole number from 0 to 31";

    private static final BigDecimal MAX_PERCENT = new BigDecimal("100");
    private static final BigDecimal MAX_GRACE_DAYS = new BigDecimal("31");

    private LateInterestRules() {
    }

    /** คืนข้อความของช่องแรกที่ผิด (อัตราก่อนวันผ่อนผัน ตามลำดับในฟอร์ม) หรือ null เมื่อถูกทั้งสองช่อง */
    static String validate(LateInterestRequest request) {
        if (!isBetween(request.lateInterestPercentPerMonth(), MAX_PERCENT)) {
            return PERCENT_MESSAGE;
        }
        BigDecimal graceDays = request.graceDays();
        if (!isBetween(graceDays, MAX_GRACE_DAYS) || !isWholeNumber(graceDays)) {
            return GRACE_DAYS_MESSAGE;
        }
        return null;
    }

    private static boolean isBetween(BigDecimal value, BigDecimal max) {
        return value != null && value.signum() >= 0 && value.compareTo(max) <= 0;
    }

    /** 2.0 นับเป็นจำนวนเต็ม 1.5 ไม่นับ */
    private static boolean isWholeNumber(BigDecimal value) {
        return value.stripTrailingZeros().scale() <= 0;
    }
}
