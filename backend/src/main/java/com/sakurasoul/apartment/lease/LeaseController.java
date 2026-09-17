package com.sakurasoul.apartment.lease;

import com.sakurasoul.apartment.lease.LeaseDtos.LeaseRequest;
import com.sakurasoul.apartment.lease.LeaseDtos.LeaseResponse;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * endpoint ของสัญญาเช่าตาม docs/api-contract-lease.md
 * <p>
 * ตั๋วนี้ (SSK-10 / US-04) ทำแค่ดูรายการกับสร้างสัญญา ส่วน PUT กับ terminate
 * เป็นของ SSK-12 (US-06) จึงยังไม่มีที่นี่
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
}
