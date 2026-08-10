package com.sakurasoul.apartment.room;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
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
}
