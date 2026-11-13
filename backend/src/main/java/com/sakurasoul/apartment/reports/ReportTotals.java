package com.sakurasoul.apartment.reports;

import com.sakurasoul.apartment.common.Money;

import java.math.BigDecimal;

/**
 * ตัวเลขสิบสามช่องของรายงานสรุป (SSK-170) ของใบเดียว ของแถว หรือของทั้งรายงาน
 * <p>
 * billed = rent + electricAmount + waterAmount + commonAreaFee + internetFee + extraCharges + lateInterest
 * และ outstanding = billed - received จริงทุกระดับ เพราะแต่ละใบจริง (ReceiptFigures ตรวจ) และการบวกรักษาสมการไว้
 */
public record ReportTotals(
        int receiptCount,
        BigDecimal rent,
        BigDecimal electricUnits,
        BigDecimal electricAmount,
        BigDecimal waterUnits,
        BigDecimal waterAmount,
        BigDecimal commonAreaFee,
        BigDecimal internetFee,
        BigDecimal extraCharges,
        BigDecimal lateInterest,
        BigDecimal billed,
        BigDecimal received,
        BigDecimal outstanding) {

    private static final BigDecimal NONE = BigDecimal.ZERO.setScale(Money.SCALE);

    /** รายงานที่ไม่มีใบเลยตอบ 0.00 ทุกช่อง ไม่ใช่ 0 เพื่อให้รูปแบบตัวเลขเหมือนรายงานที่มีใบ */
    public static final ReportTotals ZERO =
            new ReportTotals(0, NONE, NONE, NONE, NONE, NONE, NONE, NONE, NONE, NONE, NONE, NONE, NONE);

    public ReportTotals plus(ReportTotals other) {
        return new ReportTotals(
                receiptCount + other.receiptCount,
                rent.add(other.rent),
                electricUnits.add(other.electricUnits),
                electricAmount.add(other.electricAmount),
                waterUnits.add(other.waterUnits),
                waterAmount.add(other.waterAmount),
                commonAreaFee.add(other.commonAreaFee),
                internetFee.add(other.internetFee),
                extraCharges.add(other.extraCharges),
                lateInterest.add(other.lateInterest),
                billed.add(other.billed),
                received.add(other.received),
                outstanding.add(other.outstanding));
    }

    /** ผลรวมเจ็ดช่องที่ประกอบเป็น billed */
    BigDecimal parts() {
        return rent.add(electricAmount).add(waterAmount).add(commonAreaFee).add(internetFee).add(extraCharges)
                .add(lateInterest);
    }
}
