package com.sakurasoul.apartment.billing;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;

/** รูปร่าง request กับ response ของการชำระ (SSK-163) ตกลงไว้ใน docs/api-contract-payments-phase2.md */
public final class PaymentDtos {

    private PaymentDtos() {
    }

    /**
     * body ของ POST /api/receipts/{id}/payments
     * <p>
     * ไม่ใช้ bean validation เพราะสัญญากำหนดให้ตอบ 404 และ 409 ก่อนค่าในคำขอ ซึ่ง @Valid ทำงานก่อนถึง service
     * paidOn กับ method เป็นข้อความแล้วแปลงเองใน PaymentRules ถ้าประกาศเป็น LocalDate หรือ enum ค่าที่อ่านไม่ออก
     * จะได้ข้อความกลางของ Jackson แทนข้อความในสัญญา วิธีเดียวกับ billingMonth ของใบเสร็จ
     */
    public record RecordPaymentRequest(
            BigDecimal amount,
            /* "YYYY-MM-DD" ไม่ส่งมาคือวันนี้ตามเวลาไทย */
            String paidOn,
            /* CASH, TRANSFER, QR หรือ OTHER */
            String method,
            String reference,
            String note) {
    }

    /**
     * การชำระหนึ่งก้อนที่บันทึกบนบิล รูปเดียวกันทั้งใน payments ของใบเสร็จและ GET /api/receipts/{id}/payments
     * voidedAt ไม่เป็น null คือถูกยกเลิกแล้ว
     */
    public record PaymentResponse(
            Long id,
            BigDecimal amount,
            LocalDate paidOn,
            PaymentMethod method,
            String reference,
            String note,
            Instant recordedAt,
            Instant voidedAt) {

        static PaymentResponse of(Payment payment) {
            return new PaymentResponse(payment.getId(), payment.getAmount(), payment.getPaidOn(), payment.getMethod(),
                    payment.getReference(), payment.getNote(), payment.getRecordedAt(), payment.getVoidedAt());
        }
    }
}
