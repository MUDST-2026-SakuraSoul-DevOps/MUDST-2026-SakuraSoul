package com.sakurasoul.apartment.room;

import com.sakurasoul.apartment.maintenance.MaintenanceDtos.TicketResponse;
import com.sakurasoul.apartment.maintenance.MaintenanceService;
import com.sakurasoul.apartment.room.RoomDtos.RoomStatusRequest;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/rooms")
public class RoomController {

    private final RoomService roomService;
    private final MaintenanceService maintenanceService;

    public RoomController(RoomService roomService, MaintenanceService maintenanceService) {
        this.roomService = roomService;
        this.maintenanceService = maintenanceService;
    }

    @GetMapping
    public List<RoomSummaryResponse> list() {
        return roomService.listRooms();
    }

    @GetMapping("/{id}")
    public RoomDetailResponse get(@PathVariable Long id) {
        return roomService.getRoom(id);
    }

    /**
     * ประวัติงานซ่อมของห้องนี้ ใบใหม่สุดขึ้นก่อน (US-13-S1)
     * <p>
     * อยู่ใต้ /api/rooms ไม่ใช่ /api/maintenance เพราะสัญญา API เขียน path นี้ไว้ตั้งแต่
     * ก่อนเริ่ม epic งานซ่อม และหน้าเว็บเรียกอยู่แล้ว (fetchRoomMaintenance ใน
     * frontend/src/api/client.ts) ตัวที่ทำงานจริงคือ MaintenanceService ตัวเดียวกับที่
     * MaintenanceController เรียก โค้ดจึงไม่ได้ถูกเขียนซ้ำสองที่ มีแต่ path ที่อยู่คนละใต้
     * <p>
     * ห้องที่ไม่มีอยู่จริงตอบ 404 ส่วนห้องที่มีอยู่แต่ไม่เคยซ่อมตอบลิสต์ว่าง สองอย่างนี้
     * คนละเรื่องกัน ฝั่งหน้าเว็บทนได้ทั้งคู่อยู่แล้ว (ดักไว้ว่า 404 ให้ถือว่าไม่มีรายการ)
     */
    @GetMapping("/{id}/maintenance")
    public List<TicketResponse> maintenance(@PathVariable Long id) {
        return maintenanceService.listForRoom(id);
    }

    /**
     * ล็อกห้องเป็นซ่อมบำรุงหรือปลดล็อกกลับ (US-15)
     * <p>
     * ตอบเป็นก้อนเดียวกับ GET /api/rooms/{id} ตามสัญญา API ห้องที่ยังมีสัญญาอยู่จึงตอบ
     * OCCUPIED กลับมาทันทีที่ปลดล็อก ทั้งที่คำขอส่ง AVAILABLE มา ซึ่งเป็นพฤติกรรมที่
     * US-15-S2 ต้องการ ไม่ใช่ความผิดพลาด
     * <p>
     * ไม่มี @Valid เพราะกฎของช่องนี้ไม่ใช่แค่ "ห้ามว่าง" แต่เป็นรายการค่าที่ตั้งเองได้
     * ซึ่งอยู่ที่ RoomService เพื่อให้เทสระดับ service จับกฎเดียวกันได้โดยไม่ต้องยก MVC
     */
    @PatchMapping("/{id}/status")
    public RoomDetailResponse updateStatus(@PathVariable Long id,
            @RequestBody RoomStatusRequest request) {
        return roomService.updateStatus(id, request.status());
    }
}
