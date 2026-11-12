package com.sakurasoul.apartment.lease;

import com.sakurasoul.apartment.common.Money;
import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;

import java.math.BigDecimal;

/**
 * อัตราดอกเบี้ยค้างชำระต่อเดือนกับวันผ่อนผันที่ล็อกไว้ในสัญญาตอนเซ็น (SSK-164)
 * <p>
 * คัดลอกจาก apartment_config ตอนสร้างสัญญา (LeaseService.create) แก้ค่าตั้งทีหลังไม่กระทบสัญญาเดิม
 * หลักเดียวกับ LeaseCharges ที่ล็อกอัตราค่าน้ำไฟ สัญญาที่ทำก่อน Phase 2 เป็น 0 ทั้งคู่ (ค่าตั้งต้นของ V21) คือไม่คิดดอกเบี้ย
 * <p>
 * ไม่มีทางแก้สองค่านี้หลังเซ็น LeaseRequest ไม่มีสองช่องนี้และ Lease.update ไม่รับค่าเงิน
 */
@Embeddable
public class LeaseLateTerms {

    /** 0.00 ถึง 100.00 บังคับด้วย lease_late_interest_ck ใน V21 */
    @Column(name = "late_interest_percent_per_month", nullable = false, precision = 5, scale = 2)
    private BigDecimal percentPerMonth;

    /** 0 ถึง 31 วันหลังวันครบกำหนดที่ยังไม่คิดดอกเบี้ย บังคับด้วย lease_grace_days_ck ใน V21 */
    @Column(name = "grace_days", nullable = false)
    private short graceDays;

    protected LeaseLateTerms() {
    }

    private LeaseLateTerms(BigDecimal percentPerMonth, short graceDays) {
        this.percentPerMonth = percentPerMonth;
        this.graceDays = graceDays;
    }

    /** ไม่คิดดอกเบี้ย ค่าของทุกสัญญาที่สร้างตรง ๆ โดยไม่ผ่าน LeaseService (เทส) */
    public static LeaseLateTerms none() {
        return new LeaseLateTerms(Money.round(BigDecimal.ZERO), (short) 0);
    }

    /** ผู้เรียกตรวจช่วงค่ามาแล้ว (ค่าตั้งผ่าน LateInterestRules) ฐานข้อมูลกันซ้ำอีกชั้น */
    public static LeaseLateTerms of(BigDecimal percentPerMonth, int graceDays) {
        return new LeaseLateTerms(Money.round(percentPerMonth), (short) graceDays);
    }

    public BigDecimal getPercentPerMonth() {
        return percentPerMonth;
    }

    public int getGraceDays() {
        return graceDays;
    }
}
