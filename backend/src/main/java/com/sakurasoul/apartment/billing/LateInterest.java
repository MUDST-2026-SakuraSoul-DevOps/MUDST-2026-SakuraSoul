package com.sakurasoul.apartment.billing;

import com.sakurasoul.apartment.common.Money;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.List;

/**
 * ดอกเบี้ยค้างชำระที่คิดตอนออกบิลใหม่ (SSK-164) เป็น logic ล้วน ไม่แตะฐานข้อมูลและไม่อ่านนาฬิกา
 * <p>
 * ดอกเบี้ยแบบง่ายรายเดือน คิดจากต้นเงินคงเหลือของใบก่อนหน้าที่เลยกำหนดแล้ว ดอกเบี้ยที่ค้างจากเดือนก่อนไม่ถูกเอามาคิดซ้ำ
 * ต้นเงินของทุกใบรวมกันก่อนแล้วปัดครั้งเดียว เพราะบรรทัดบนบิลมีฐานเดียว ("1.50% of ฿8,100.00")
 * ตัวเลขที่ผู้เช่ากดเครื่องคิดเลขตามจึงต้องได้เท่ากัน
 */
public final class LateInterest {

    private LateInterest() {
    }

    /**
     * วันที่ใช้ตัดสินว่าใบก่อนหน้าเลยกำหนดหรือยัง: วันที่มาก่อนระหว่างวันออกบิล (เวลาไทย) กับวันสุดท้ายของเดือนที่เรียกเก็บ
     * (ตัดสิน 10 พ.ย.)
     * <p>
     * บิลที่ออกหลังสิ้นเดือน ซึ่งเป็นกรณีปกติ ได้ตัวเลขเดิมทุกครั้งไม่ว่าจะกดออกวันไหน
     * ส่วนบิลที่ออกต้นเดือน (ฟอร์มตั้งเดือนปัจจุบันเป็นค่าเริ่มต้น) ไม่คิดดอกเบี้ยกับใบที่ยังไม่ครบกำหนด
     * ตามสัญญาที่ว่าผู้เช่าที่จ่ายทันก่อนครบกำหนดไม่เสียดอกเบี้ย
     */
    public static LocalDate referenceDate(YearMonth billingMonth, LocalDate issueDate) {
        LocalDate monthEnd = billingMonth.atEndOfMonth();
        return issueDate.isBefore(monthEnd) ? issueDate : monthEnd;
    }

    /**
     * ผลรวมต้นเงินคงเหลือของใบที่เลยกำหนดแล้ว คือวันอ้างอิงอยู่หลัง dueDate + graceDays (เลยแบบเคร่ง ครบกำหนดวันเดียวกันยังไม่นับ)
     */
    public static BigDecimal overduePrincipal(List<Candidate> earlier, int graceDays, LocalDate referenceDate) {
        return earlier.stream()
                .filter(candidate -> referenceDate.isAfter(candidate.dueDate().plusDays(graceDays)))
                .map(Candidate::principalDue)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    /**
     * ต้นเงิน x อัตราต่อเดือน / 100 ปัดครึ่งขึ้นสองตำแหน่ง (Money.round) สูตรเดียวกับ receipt_interest_ck ใน V21
     */
    public static BigDecimal of(BigDecimal principal, BigDecimal percentPerMonth) {
        return Money.round(principal.multiply(percentPerMonth).movePointLeft(2));
    }

    /** ใบก่อนหน้าหนึ่งใบ ต้นเงินที่ยังค้างกับวันครบกำหนดของมัน */
    public record Candidate(BigDecimal principalDue, LocalDate dueDate) {
    }
}
