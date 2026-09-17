package com.sakurasoul.apartment.room;

import com.sakurasoul.apartment.lease.Lease;
import com.sakurasoul.apartment.lease.LeaseDtos.LeaseBrief;

import java.math.BigDecimal;

/**
 * ห้องหนึ่งห้องแบบเต็ม เหมือน {@link RoomSummaryResponse} แต่มี note เพิ่มมาท้ายสุด
 * <p>
 * เป็นก้อนเดียวกับที่ PATCH /api/rooms/{id}/status ตอบกลับ ตามที่สัญญา API กำหนด
 * หน้าเว็บจะได้เอา response ของการล็อกห้องไปวางแทนของเดิมได้เลยโดยไม่ต้องโหลดซ้ำ
 * <p>
 * openMaintenanceCount กับ openMaintenanceTitle มีค่าจริงแล้วตั้งแต่ CR-05
 * ดูคำอธิบายเต็มที่ {@link RoomSummaryResponse}
 */
public record RoomDetailResponse(
        Long id,
        String roomNumber,
        int floor,
        BigDecimal baseRent,
        RoomStatus status,
        LeaseBrief currentLease,
        int openMaintenanceCount,
        String openMaintenanceTitle,
        String note) {

    /**
     * activeLease เป็น null ได้ แปลว่าไม่มีสัญญาที่ครอบวันนี้
     * openMaintenance เป็น null ได้ แปลว่าห้องนี้ไม่มีใบแจ้งซ่อมค้างอยู่
     */
    public static RoomDetailResponse of(Room room, Lease activeLease, OpenMaintenance openMaintenance) {
        return new RoomDetailResponse(room.getId(), room.getRoomNumber(), room.getFloor(),
                room.getBaseRent(), RoomStatus.of(activeLease, room.isUnderMaintenance()),
                activeLease == null ? null : LeaseBrief.of(activeLease),
                OpenMaintenance.countOf(openMaintenance), OpenMaintenance.titleOf(openMaintenance),
                room.getNote());
    }
}
