package com.sakurasoul.apartment.billing;

import com.sakurasoul.apartment.billing.PaymentDtos.PaymentResponse;
import com.sakurasoul.apartment.billing.PaymentDtos.RecordPaymentRequest;
import com.sakurasoul.apartment.billing.ReceiptDtos.ReceiptResponse;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * การรับชำระ (SSK-163) ตาม docs/api-contract-payments-phase2.md
 * <p>
 * POST /api/receipts/{id}/pay แบบเดิมยังอยู่ที่ ReceiptController ไม่ย้ายมา แต่ทำงานผ่าน PaymentService เส้นทางเดียวกัน
 * ไม่ใส่ @Valid ที่ body เพราะสัญญาให้ตอบ 404 และ 409 ก่อนค่าในคำขอ ดู PaymentDtos.RecordPaymentRequest
 */
@RestController
@RequestMapping("/api")
public class PaymentController {

    private final PaymentService paymentService;

    public PaymentController(PaymentService paymentService) {
        this.paymentService = paymentService;
    }

    /** รับชำระบนใบล่าสุดของสัญญา จ่ายบางส่วนได้ ตอบ 201 เป็นบิลนี้หลังตัดยอด */
    @PostMapping("/receipts/{id}/payments")
    @ResponseStatus(HttpStatus.CREATED)
    public ReceiptResponse record(@PathVariable Long id, @RequestBody RecordPaymentRequest request) {
        return paymentService.record(id, request);
    }

    @GetMapping("/receipts/{id}/payments")
    public List<PaymentResponse> paymentsOn(@PathVariable Long id) {
        return paymentService.paymentsOn(id);
    }
}
