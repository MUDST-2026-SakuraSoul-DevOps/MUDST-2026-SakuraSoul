package com.sakurasoul.apartment.extracharge;

import java.math.BigDecimal;
import java.time.YearMonth;

/**
 * ค่าของค่าใช้จ่ายพิเศษหนึ่งรายการที่ตรวจแล้ว พร้อมเก็บลง RoomExtraCharge ได้ทันที ดู ExtraChargeRules.parse
 * <p>
 * endMonth เป็น null ได้ แปลว่าไม่มีเดือนสุดท้าย ค่าครั้งเดียว (ONE_TIME) เป็น null เสมอ
 */
public record ExtraChargeTerms(
        String label,
        BigDecimal amount,
        ChargeRecurrence recurrence,
        YearMonth startMonth,
        YearMonth endMonth) {
}
