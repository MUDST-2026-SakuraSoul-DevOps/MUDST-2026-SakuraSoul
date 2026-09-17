package com.sakurasoul.apartment.room;

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

    public RoomController(RoomService roomService) {
        this.roomService = roomService;
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
