package com.sakurasoul.apartment.billing;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;

/** รูปร่าง request กับ response ของการชำระ (SSK-163) ตกลงไว้ใน docs/api-contract-payments-phase2.md */
public final class PaymentDtos {

    private PaymentDtos() {
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
