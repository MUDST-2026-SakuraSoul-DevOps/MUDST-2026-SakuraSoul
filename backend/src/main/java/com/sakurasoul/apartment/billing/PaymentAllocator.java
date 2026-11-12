package com.sakurasoul.apartment.billing;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;

/**
 * ตัดเงินหนึ่งก้อนเข้ายอดค้างของสัญญาหนึ่งใบ (SSK-163) เป็น logic ล้วน ไม่แตะฐานข้อมูล
 * <p>
 * ใบเก่าสุดก่อน (FIFO) ภายในใบเดียวกันตัดดอกเบี้ยก่อนแล้วค่อยต้นเงิน ตามลำดับเริ่มต้นใน ป.พ.พ. มาตรา 329
 * (ตัดสิน 10 พ.ย.) ต้นเงินที่ยังค้างจึงเป็นฐานของดอกเบี้ยรอบถัดไปตามจริง
 * <p>
 * ข้างในมีแค่ min บวก ลบ ของเลขสองตำแหน่ง ไม่มีการคูณ หาร หรือปัด เงินจึงไม่หายแม้แต่สตางค์เดียว
 * ผลรวมของทุกส่วนที่ตัดเท่ากับเงินที่รับเป๊ะ
 */
public final class PaymentAllocator {

    private PaymentAllocator() {
    }

    /**
     * @param amount      เงินที่รับ มากกว่า 0 สองตำแหน่ง ไม่เกินผลรวมยอดค้าง ผู้เรียกตรวจกับข้อความของผู้ใช้มาแล้ว
     * @param oldestFirst ยอดค้างของแต่ละใบ เรียงจากเดือนเก่าสุด
     * @return ส่วนที่ตัดเข้าแต่ละใบตามลำดับที่ส่งเข้ามา ใบที่ไม่ได้อะไรไม่อยู่ในผล
     */
    public static List<Allocation> allocate(BigDecimal amount, List<Due> oldestFirst) {
        if (amount == null || amount.signum() <= 0) {
            throw new IllegalArgumentException("The amount to allocate must be greater than 0");
        }
        BigDecimal totalDue = oldestFirst.stream().map(Due::total).reduce(BigDecimal.ZERO, BigDecimal::add);
        if (amount.compareTo(totalDue) > 0) {
            throw new IllegalArgumentException("Cannot allocate " + amount + " when only " + totalDue + " is due");
        }

        List<Allocation> allocations = new ArrayList<>();
        BigDecimal left = amount;
        for (Due due : oldestFirst) {
            if (left.signum() == 0) {
                break;
            }
            BigDecimal interest = left.min(due.interestDue());
            left = left.subtract(interest);
            BigDecimal principal = left.min(due.principalDue());
            left = left.subtract(principal);
            if (interest.signum() > 0 || principal.signum() > 0) {
                allocations.add(new Allocation(due.receiptId(), interest, principal));
            }
        }
        return allocations;
    }

    /** ยอดที่ยังค้างของใบหนึ่ง ไม่ติดลบ */
    public record Due(Long receiptId, BigDecimal interestDue, BigDecimal principalDue) {

        BigDecimal total() {
            return interestDue.add(principalDue);
        }
    }

    /** ส่วนของเงินก้อนนี้ที่ตัดเข้าใบหนึ่ง */
    public record Allocation(Long receiptId, BigDecimal interestAmount, BigDecimal principalAmount) {

        public BigDecimal total() {
            return interestAmount.add(principalAmount);
        }
    }
}
