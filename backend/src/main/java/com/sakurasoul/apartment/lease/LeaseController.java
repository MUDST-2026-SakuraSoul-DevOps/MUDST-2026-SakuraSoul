package com.sakurasoul.apartment.lease;

import com.sakurasoul.apartment.lease.LeaseDtos.LeaseRequest;
import com.sakurasoul.apartment.lease.LeaseDtos.LeaseResponse;
import com.sakurasoul.apartment.lease.LeaseDtos.TerminateLeaseRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
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
 */
@RestController
@RequestMapping("/api/leases")
public class LeaseController {

    private final LeaseService leaseService;

    public LeaseController(LeaseService leaseService) {
        this.leaseService = leaseService;
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
}
