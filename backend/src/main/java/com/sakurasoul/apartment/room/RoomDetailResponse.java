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
 * <p>
 * roomType เพิ่มเข้ามาใน V11 (SSK-127) วางไว้ต่อจาก floor ให้ลำดับตรงกับ RoomSummary
 * ฝั่งหน้าเว็บ ก่อนหน้านี้ client.ts เติมค่า 'SINGLE' ให้เองเพราะ backend ไม่ได้ส่งมา
 * ซึ่งทำให้ห้องจริงทุกห้องกลายเป็น Single เมื่อปิด backend จำลอง
 * <p>
 * ตั้งแต่ V12 (SSK-127) `baseRent` ไม่ได้อ่านจากคอลัมน์ในตาราง room อีกแล้ว แต่เป็นค่าเช่า
 * ของชนิดห้องที่ RoomService หามาให้ ชื่อฟิลด์ใน JSON คงเดิมโดยตั้งใจ เพื่อให้สัญญากับหน้าเว็บ
 * ไม่ขยับในรอบนี้ ฝั่งหน้าเว็บจะมาเปลี่ยนเป็นอ่านจาก roomType ตอนรื้อฟอร์มสัญญา
 */
public record RoomDetailResponse(
        Long id,
        String roomNumber,
        int floor,
        RoomType roomType,
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
    public static RoomDetailResponse of(Room room, BigDecimal baseRent, Lease activeLease,
            OpenMaintenance openMaintenance) {
        return new RoomDetailResponse(room.getId(), room.getRoomNumber(), room.getFloor(),
                room.getRoomType(), baseRent,
                RoomStatus.of(activeLease, room.isUnderMaintenance()),
                activeLease == null ? null : LeaseBrief.of(activeLease),
                OpenMaintenance.countOf(openMaintenance), OpenMaintenance.titleOf(openMaintenance),
                room.getNote());
    }
}
