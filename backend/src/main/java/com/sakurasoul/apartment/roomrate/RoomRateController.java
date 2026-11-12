package com.sakurasoul.apartment.roomrate;

import com.sakurasoul.apartment.roomrate.RoomRateDtos.RoomRateRequest;
import com.sakurasoul.apartment.roomrate.RoomRateDtos.RoomRateResponse;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * อัตราต่อห้องตามช่วงเวลา (SSK-162)
 * <p>
 * ไม่มี PUT กับ DELETE เพราะตารางเพิ่มอย่างเดียว ไม่ใส่ @Valid เพราะ RoomRateRules เป็นคนตอบข้อความ 400
 */
@RestController
public class RoomRateController {

    private final RoomRateService roomRateService;

    public RoomRateController(RoomRateService roomRateService) {
        this.roomRateService = roomRateService;
    }

    @GetMapping("/api/rooms/{id}/rates")
    public List<RoomRateResponse> history(@PathVariable Long id) {
        return roomRateService.history(id);
    }

    @PostMapping("/api/rooms/{id}/rates")
    @ResponseStatus(HttpStatus.CREATED)
    public RoomRateResponse add(@PathVariable Long id, @RequestBody RoomRateRequest request) {
        return roomRateService.add(id, request);
    }

    @GetMapping("/api/room-rates")
    public List<RoomRateResponse> startingFrom(@RequestParam(required = false) String from) {
        return roomRateService.startingFrom(from);
    }
}
