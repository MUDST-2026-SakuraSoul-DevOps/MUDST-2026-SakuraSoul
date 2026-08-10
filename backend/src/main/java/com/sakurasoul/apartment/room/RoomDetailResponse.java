package com.sakurasoul.apartment.room;

import java.math.BigDecimal;

public record RoomDetailResponse(
        Long id,
        String roomNumber,
        int floor,
        BigDecimal baseRent,
        String note) {

    public static RoomDetailResponse of(Room room) {
        return new RoomDetailResponse(room.getId(), room.getRoomNumber(), room.getFloor(),
                room.getBaseRent(), room.getNote());
    }
}
