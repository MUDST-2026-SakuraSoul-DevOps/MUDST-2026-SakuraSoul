package com.sakurasoul.apartment.room;

import com.sakurasoul.apartment.lease.Lease;
import com.sakurasoul.apartment.lease.LeaseDtos.LeaseBrief;

import java.math.BigDecimal;

public record RoomDetailResponse(
        Long id,
        String roomNumber,
        int floor,
        BigDecimal baseRent,
        RoomStatus status,
        LeaseBrief currentLease,
        String note) {

    /** activeLease เป็น null ได้ แปลว่าไม่มีสัญญาที่ครอบวันนี้ */
    public static RoomDetailResponse of(Room room, Lease activeLease) {
        return new RoomDetailResponse(room.getId(), room.getRoomNumber(), room.getFloor(),
                room.getBaseRent(), RoomStatus.of(activeLease),
                activeLease == null ? null : LeaseBrief.of(activeLease), room.getNote());
    }
}
