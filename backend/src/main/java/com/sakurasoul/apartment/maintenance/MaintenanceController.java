package com.sakurasoul.apartment.maintenance;

import com.sakurasoul.apartment.maintenance.MaintenanceDtos.CreateTicketRequest;
import com.sakurasoul.apartment.maintenance.MaintenanceDtos.SupplyUsageRequest;
import com.sakurasoul.apartment.maintenance.MaintenanceDtos.TicketResponse;
import com.sakurasoul.apartment.maintenance.MaintenanceDtos.UpdateTicketRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * endpoint ของใบแจ้งซ่อมตาม docs/api-contract-maintenance.md (US-12, US-13)
 * <p>
 * ประวัติของห้องเดียวไม่ได้อยู่ที่นี่ แต่อยู่ที่ GET /api/rooms/{id}/maintenance ใน
 * RoomController เพราะสัญญา API เขียนไว้แบบนั้นตั้งแต่ก่อนเริ่ม epic นี้ และหน้าเว็บ
 * เรียก path นั้นอยู่แล้ว (fetchRoomMaintenance ใน frontend/src/api/client.ts)
 * ตัวที่ทำงานจริงเป็น MaintenanceService ตัวเดียวกัน
 * <p>
 * ไม่มี endpoint ลบใบทิ้ง ประวัติงานซ่อมเป็นข้อมูลที่หอพักต้องเก็บ ใบที่เปิดผิดให้ปิดเป็น
 * DONE แทน หลักการเดียวกับสัญญาเช่าที่ไม่มีการลบถาวร
 */
@RestController
@RequestMapping("/api/maintenance")
public class MaintenanceController {

    private final MaintenanceService maintenanceService;

    public MaintenanceController(MaintenanceService maintenanceService) {
        this.maintenanceService = maintenanceService;
    }

    /**
     * status รับเป็น String แล้วให้ service แปลงเอง เพื่อให้ค่าที่สะกดผิดได้ 400 พร้อม
     * ข้อความไทยชุดเดียวกับตอน PATCH ถ้าประกาศเป็น enum ตรงนี้ Spring จะตอบข้อความ
     * อังกฤษของตัวเองแทน ซึ่งคนละแบบกับที่สัญญา API เขียนไว้
     */
    @GetMapping
    public List<TicketResponse> list(
            @RequestParam(required = false) String status,
            @RequestParam(required = false) Long roomId) {
        return maintenanceService.list(status, roomId);
    }

    @GetMapping("/{id}")
    public TicketResponse get(@PathVariable Long id) {
        return maintenanceService.get(id);
    }

    /** บันทึกงานซ่อมใหม่ ตอบ 201 พร้อมใบที่บันทึกแล้ว ของที่เบิกถูกตัดสต็อกไปด้วย (US-12-S1) */
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public TicketResponse create(@Valid @RequestBody CreateTicketRequest request) {
        return maintenanceService.create(request);
    }

    /** แก้ทีละช่อง ช่องที่ไม่ส่งมาแปลว่าไม่แก้ ตอบ 200 พร้อมใบที่แก้แล้ว */
    @PatchMapping("/{id}")
    public TicketResponse update(@PathVariable Long id, @Valid @RequestBody UpdateTicketRequest request) {
        return maintenanceService.update(id, request);
    }

    /** เบิกของเพิ่มให้ใบที่เปิดไว้แล้ว ตอบ 200 พร้อมใบที่มีรายการของครบแล้ว */
    @PostMapping("/{id}/supplies")
    public TicketResponse addSupply(@PathVariable Long id,
            @Valid @RequestBody SupplyUsageRequest request) {
        return maintenanceService.addSupply(id, request);
    }
}
