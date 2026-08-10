package com.sakurasoul.apartment.room;

import java.math.BigDecimal;

/** หนึ่งช่องบนหน้าผังห้อง */
public record RoomSummaryResponse(
        Long id,
        String roomNumber,
        int floor,
        BigDecimal baseRent) {

    public static RoomSummaryResponse of(Room room) {
        return new RoomSummaryResponse(room.getId(), room.getRoomNumber(), room.getFloor(),
                room.getBaseRent());
    }
}
