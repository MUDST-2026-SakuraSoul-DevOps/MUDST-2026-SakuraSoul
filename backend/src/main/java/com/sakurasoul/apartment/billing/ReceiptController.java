package com.sakurasoul.apartment.billing;

import com.sakurasoul.apartment.billing.ReceiptDtos.CreateReceiptRequest;
import com.sakurasoul.apartment.billing.ReceiptDtos.PayReceiptRequest;
import com.sakurasoul.apartment.billing.ReceiptDtos.ReceiptResponse;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * endpoint ของใบเสร็จตาม docs/api-contract-billing.md (US-10 / SSK-16)
 * <p>
 * ไม่มี endpoint ลบใบเสร็จโดยตั้งใจ ใบเสร็จที่ออกไปแล้วเป็นเอกสารทางบัญชี
 * ถ้าออกผิดต้องออกใบใหม่หรือใบลดหนี้ ไม่ใช่ลบของเดิมทิ้งให้เลขที่หายไปจากลำดับ
 * เหตุผลเดียวกับที่สัญญาเช่าไม่มี endpoint ลบ
 */
@RestController
@RequestMapping("/api/receipts")
public class ReceiptController {

    private final ReceiptService receiptService;
    private final ReceiptPdfService receiptPdfService;

    public ReceiptController(ReceiptService receiptService, ReceiptPdfService receiptPdfService) {
        this.receiptService = receiptService;
        this.receiptPdfService = receiptPdfService;
    }

    /** รายการใบเสร็จ ใบใหม่สุดขึ้นก่อน กรองด้วย leaseId, status และ month (YYYY-MM) ได้ */
    @GetMapping
    public List<ReceiptResponse> list(
            @RequestParam(required = false) Long leaseId,
            @RequestParam(required = false) ReceiptStatus status,
            @RequestParam(required = false) String month) {
        return receiptService.list(leaseId, status, month);
    }

    @GetMapping("/{id}")
    public ReceiptResponse detail(@PathVariable Long id) {
        return receiptService.detail(id);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ReceiptResponse create(@Valid @RequestBody CreateReceiptRequest request) {
        return receiptService.create(request);
    }

    /**
     * บันทึกว่าชำระแล้ว ตอบ 200 พร้อมใบเสร็จที่สถานะเป็น PAID
     * <p>
     * body ไม่บังคับ (required = false) เพราะช่องทางการจ่ายมีช่องเดียวและไม่บังคับอยู่แล้ว
     * ปุ่มที่หน้าเว็บกดจึงยิงมาโดยไม่มี body ได้เลย ถ้าบังคับ คำขอที่ไม่มี body จะได้ 400
     * ซึ่งอ่านไม่ออกว่าต้องไปแก้อะไร
     * <p>
     * เป็น POST ไม่ใช่ PATCH เพราะสิ่งที่สั่งคือเหตุการณ์ "รับชำระเงิน" ไม่ใช่การแก้ฟิลด์
     * รูปแบบเดียวกับ POST /api/leases/{id}/terminate
     */
    @PostMapping("/{id}/pay")
    public ReceiptResponse pay(@PathVariable Long id,
            @RequestBody(required = false) PayReceiptRequest request) {
        return receiptService.pay(id, request == null ? null : request.paymentMethod());
    }

    /**
     * ไฟล์ใบเสร็จเป็น PDF ตอบเป็นไฟล์แนบชื่อเดียวกับเลขที่ใบเสร็จ
     * <p>
     * ระบุ produces ไว้ด้วย ทั้งที่ ResponseEntity ตั้ง content type เองแล้ว เพื่อให้
     * ชนิดของคำตอบเป็นส่วนหนึ่งของสัญญาที่อ่านเห็นได้จากตัว handler
     * <p>
     * เส้นทาง error ยังตอบเป็น ProblemDetail JSON ได้ตามปกติ เพราะ DispatcherServlet
     * ล้าง producible media type ทิ้งก่อนส่งต่อให้ตัวจัดการ exception ทำงาน
     * (เทส 404 ของ endpoint นี้ใน ReceiptApiTest ยืนยันข้อนี้ไว้)
     */
    @GetMapping(value = "/{id}/pdf", produces = MediaType.APPLICATION_PDF_VALUE)
    public ResponseEntity<byte[]> pdf(@PathVariable Long id) {
        return receiptPdfService.render(id).asAttachment();
    }
}
