package com.sakurasoul.apartment.maintenance;

import com.sakurasoul.apartment.maintenance.ReminderDtos.ReminderActiveRequest;
import com.sakurasoul.apartment.maintenance.ReminderDtos.ReminderRequest;
import com.sakurasoul.apartment.maintenance.ReminderDtos.ReminderResponse;
import com.sakurasoul.apartment.maintenance.ReminderDtos.RunDueResponse;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * endpoint ของการแจ้งเตือนซ่อมบำรุงตามรอบ (US-14) ตาม docs/api-contract-maintenance.md
 * <p>
 * ไม่มี DELETE ใช้ PATCH ปิดสวิตช์แทน เหตุผลอยู่ใน ReminderService.setActive
 */
@RestController
@RequestMapping("/api/reminders")
public class ReminderController {

    private final ReminderService reminderService;

    public ReminderController(ReminderService reminderService) {
        this.reminderService = reminderService;
    }

    @GetMapping
    public List<ReminderResponse> list() {
        return reminderService.list();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ReminderResponse create(@Valid @RequestBody ReminderRequest request) {
        return reminderService.create(request);
    }

    @PutMapping("/{id}")
    public ReminderResponse update(@PathVariable Long id, @Valid @RequestBody ReminderRequest request) {
        return reminderService.update(id, request);
    }

    @PatchMapping("/{id}/active")
    public ReminderResponse setActive(@PathVariable Long id,
            @RequestBody ReminderActiveRequest request) {
        return reminderService.setActive(id, request.active());
    }

    /**
     * สั่งให้ระบบไล่ใบที่ถึงกำหนดเดี๋ยวนี้ โดยไม่ต้องรอรอบแปดโมงเช้าของ ReminderScheduler
     * <p>
     * มีไว้สองเหตุผล หนึ่งคือแอดมินที่เพิ่งตั้งใบย้อนหลังอยากให้ใบแจ้งซ่อมโผล่เดี๋ยวนี้
     * สองคือเทสระดับ HTTP ต้องยืนยันพฤติกรรมของ US-14-S2 ได้โดยไม่ต้องรอเวลาจริง
     * <p>
     * เป็น POST เพราะเรียกแล้วข้อมูลเปลี่ยน (มีใบแจ้งซ่อมเกิดขึ้นและวันครบกำหนดถูกเลื่อน)
     * เรียกซ้ำในวันเดียวกันปลอดภัย ครั้งที่สองจะได้ createdTickets เป็น 0 เพราะทุกใบถูก
     * เลื่อนให้พ้นวันนี้ไปแล้ว (ดู MaintenanceReminder.advancePast)
     */
    @PostMapping("/run-due")
    public RunDueResponse runDue() {
        return new RunDueResponse(reminderService.runDue(reminderService.today()));
    }
}
