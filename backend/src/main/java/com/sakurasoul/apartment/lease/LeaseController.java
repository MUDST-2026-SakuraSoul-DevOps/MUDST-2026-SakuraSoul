package com.sakurasoul.apartment.lease;

import com.sakurasoul.apartment.lease.LeaseDtos.LeaseRequest;
import com.sakurasoul.apartment.lease.LeaseDtos.LeaseResponse;
import com.sakurasoul.apartment.lease.LeaseDtos.TerminateLeaseRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * endpoint ของสัญญาเช่าตาม docs/api-contract-lease.md
 * <p>
 * ครบสี่ตัวที่หน้าเว็บเรียกแล้ว คือดูรายการกับสร้างสัญญา (SSK-10 / US-04) และแก้สัญญา
 * กับปิดสัญญา (SSK-12 / US-06) ที่เหลือของตาราง lease คือ endpoint ลบถาวรซึ่งตกลงกันแล้ว
 * ว่าจะไม่ทำ ประวัติสัญญาเป็นข้อมูลที่หอพักต้องเก็บ ใช้ปิดสัญญาแทนทั้งหมด
 * <p>
 * มีตัวที่ห้าเพิ่มมาคือเอกสารสัญญาเป็น PDF (SSK-17 / US-11) ซึ่งเป็นเรื่องของสัญญาใบเดิม
 * ไม่ใช่ทรัพยากรใหม่ จึงอยู่ใต้ /api/leases/{id} ไม่ได้แยกไปเป็น /api/contracts
 * รายละเอียดอยู่ใน docs/api-contract-billing.md
 */
@RestController
@RequestMapping("/api/leases")
public class LeaseController {

    private final LeaseService leaseService;
    private final LeaseContractPdfService leaseContractPdfService;

    public LeaseController(LeaseService leaseService, LeaseContractPdfService leaseContractPdfService) {
        this.leaseService = leaseService;
        this.leaseContractPdfService = leaseContractPdfService;
    }

    @GetMapping
    public List<LeaseResponse> list(
            @RequestParam(required = false) LeaseStatus status,
            @RequestParam(required = false) Long roomId,
            @RequestParam(required = false) Long tenantId) {
        return leaseService.list(status, roomId, tenantId);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public LeaseResponse create(@Valid @RequestBody LeaseRequest request) {
        return leaseService.create(request);
    }

    /** แก้สัญญาทั้งก้อน body ชุดเดียวกับตอนสร้าง ตอบ 200 พร้อมสัญญาที่แก้แล้ว (US-06) */
    @PutMapping("/{id}")
    public LeaseResponse update(@PathVariable Long id, @Valid @RequestBody LeaseRequest request) {
        return leaseService.update(id, request);
    }

    /**
     * ปิดสัญญา ตอบ 200 พร้อมสัญญาที่สถานะเป็น ENDED แล้ว (US-06-S1)
     * <p>
     * เป็น POST ไม่ใช่ DELETE เพราะไม่ได้ลบสัญญาทิ้ง แค่เปลี่ยนสถานะกับวันสิ้นสุด
     * ประวัติสัญญายังอยู่ครบและยังดึงกลับมาดูได้ที่ GET /api/leases?status=ENDED
     */
    @PostMapping("/{id}/terminate")
    public LeaseResponse terminate(@PathVariable Long id,
            @Valid @RequestBody TerminateLeaseRequest request) {
        return leaseService.terminate(id, request.endDate());
    }

    /**
     * เอกสารสัญญาเช่าเป็น PDF ไว้พิมพ์ให้ทั้งสองฝ่ายเซ็น (US-11) ตอบเป็นไฟล์แนบ
     * <p>
     * path ลงท้ายด้วย .pdf ได้เพราะ Spring 6 ขึ้นไปเลิกทำ suffix pattern matching แล้ว
     * ".pdf" จึงเป็นแค่ตัวอักษรในชื่อ path ไม่ได้ถูกตีความเป็นนามสกุลไฟล์ที่ต้องตัดทิ้ง
     * ที่เขียนแบบนี้เพราะปุ่มฝั่งหน้าเว็บลิงก์ตรงมาที่ URL นี้ ผู้ใช้ที่ก๊อป URL ไปเปิดเอง
     * จะได้เห็นจากตัว URL เลยว่าปลายทางเป็นไฟล์อะไร
     */
    @GetMapping(value = "/{id}/contract.pdf", produces = MediaType.APPLICATION_PDF_VALUE)
    public ResponseEntity<byte[]> contractPdf(@PathVariable Long id) {
        return leaseContractPdfService.render(id).asAttachment();
    }
}
