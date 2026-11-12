package com.sakurasoul.apartment.billing;

import com.sakurasoul.apartment.lease.Lease;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.Optional;

/**
 * หนี้ค้างของสัญญาหนึ่งใบ (SSK-163) หนึ่งแถวของ GET /api/debts ตามสัญญา API หัวข้อ "หนี้ค้าง"
 * <p>
 * มาจากใบล่าสุดของสัญญาอย่างเดียว ใบที่ถูกยกยอดไปแล้วจึงไม่ถูกนับซ้ำ เพราะยอดของมันอยู่ในใบล่าสุดแล้ว
 * เลขห้องมาจากสำเนาในสัญญา ชื่อผู้เช่าเป็นชื่อปัจจุบัน แบบเดียวกับใบเสร็จ
 */
public record DebtResponse(
        Long leaseId,
        String roomNumber,
        String tenantName,
        Long receiptId,
        String receiptNo,
        /* "YYYY-MM" ของใบล่าสุด */
        String billingMonth,
        BigDecimal balanceDue,
        /* วันครบกำหนดของใบเก่าสุดที่ยังค้าง ความหมายเดียวกับในใบเสร็จ */
        LocalDate oldestUnpaidDueDate,
        /* จำนวนวันที่เลยวันนั้นมาแล้วตามเวลาไทย ยังไม่ถึงกำหนดเป็น 0 วันผ่อนผันมีผลกับดอกเบี้ยเท่านั้น ไม่มีผลที่นี่ */
        long daysOverdue,
        /* "0-30", "31-60" หรือ "61+" */
        String bucket) {

    /** หนี้ของสัญญานี้ ณ วันนี้ ไม่มียอดต้องจ่ายคือไม่มีแถว */
    static Optional<DebtResponse> of(Lease lease, LeaseAccount account, LocalDate today) {
        if (account.balanceDue().signum() <= 0) {
            return Optional.empty();
        }
        Receipt latest = account.latest().orElseThrow();
        // ยอดที่ต้องจ่ายมากกว่าศูนย์แปลว่ามีใบที่ยังค้างเสมอ (ข้อที่ LeaseAccount.assertBalanced ตรวจ)
        LocalDate oldestUnpaidDueDate = account.oldestUnpaidDueDate().orElseThrow();
        long daysOverdue = Math.max(0, ChronoUnit.DAYS.between(oldestUnpaidDueDate, today));
        return Optional.of(new DebtResponse(lease.getId(), lease.getRoomSnapshot().getRoomNumber(),
                lease.getTenant().getFullName(), latest.getId(), latest.getReceiptNo(), latest.billingMonthText(),
                account.balanceDue(), oldestUnpaidDueDate, daysOverdue, bucket(daysOverdue)));
    }

    /** ช่วงอายุหนี้ตามสัญญา 0 ถึง 30 วัน 31 ถึง 60 วัน และมากกว่านั้น */
    static String bucket(long daysOverdue) {
        if (daysOverdue <= 30) {
            return "0-30";
        }
        return daysOverdue <= 60 ? "31-60" : "61+";
    }
}
