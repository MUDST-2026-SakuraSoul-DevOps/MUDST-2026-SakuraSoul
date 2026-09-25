package com.sakurasoul.apartment.billingschedule;

import com.sakurasoul.apartment.billingschedule.BillingScheduleDtos.BillingScheduleRequest;
import com.sakurasoul.apartment.billingschedule.BillingScheduleDtos.BillingScheduleResponse;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * ค่าตั้งเวลาเตือนใบค้างรายเดือน (SSK-143) ตาม docs/api-contract-billing.md
 * <p>
 * ไม่มี POST กับ DELETE เพราะตารางมีแถวเดียวที่ migration ใส่ไว้ให้แล้ว และไม่มี endpoint สั่งรันรอบเดี๋ยวนี้
 * โดยตั้งใจ ถ้ามี มันต้องจองเดือนนั้นไปด้วยจนรอบจริงไม่ออก หรือไม่ก็ต้องข้ามด่านกันส่งซ้ำ
 * การส่งเดี๋ยวนี้ใช้ POST /api/receipts/send อยู่แล้ว
 */
@RestController
@RequestMapping("/api/billing-schedule")
public class BillingScheduleController {

    private final BillingScheduleService billingScheduleService;

    public BillingScheduleController(BillingScheduleService billingScheduleService) {
        this.billingScheduleService = billingScheduleService;
    }

    @GetMapping
    public BillingScheduleResponse get() {
        return billingScheduleService.get();
    }

    @PutMapping
    public BillingScheduleResponse update(@RequestBody BillingScheduleRequest request) {
        return billingScheduleService.update(request);
    }
}
