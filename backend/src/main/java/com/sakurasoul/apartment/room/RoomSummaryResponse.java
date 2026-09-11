package com.sakurasoul.apartment.room;

import com.sakurasoul.apartment.lease.Lease;
import com.sakurasoul.apartment.lease.LeaseDtos.LeaseBrief;

import java.math.BigDecimal;

/**
 * หนึ่งช่องบนหน้าผังห้อง
 * <p>
 * status กับ currentLease เพิ่มเข้ามาตอน US-04 เพื่อให้การ์ดห้องบอกได้เองว่าห้องไหน
 * มีคนอยู่ โดยหน้าเว็บไม่ต้องยิงถามสัญญาซ้ำอีกรอบ ฟิลด์เดิมสี่ตัวห้ามตัดทิ้ง
 * <p>
 * openMaintenanceCount กับ openMaintenanceTitle มีครบตามสัญญา API แล้ว แต่ยังเป็น
 * ค่าว่างตายตัว (0 กับ null) เพราะตารางใบแจ้งซ่อมเป็นของ epic งานซ่อม (CR-05) ซึ่งยังไม่มี
 * ส่งมาเป็นค่าว่างตั้งแต่ตอนนี้เพื่อให้รูปร่าง JSON ตรงกับที่หน้าเว็บรออยู่ พอ CR-05 ขึ้น
 * ค่อยมาเติมค่าจริงที่ RoomService ที่เดียว หน้าเว็บไม่ต้องแก้ตาม
 */
public record RoomSummaryResponse(
        Long id,
        String roomNumber,
        int floor,
        BigDecimal baseRent,
        RoomStatus status,
        LeaseBrief currentLease,
        int openMaintenanceCount,
        String openMaintenanceTitle) {

    /** activeLease เป็น null ได้ แปลว่าไม่มีสัญญาที่ครอบวันนี้ */
    public static RoomSummaryResponse of(Room room, Lease activeLease) {
        return new RoomSummaryResponse(room.getId(), room.getRoomNumber(), room.getFloor(),
                room.getBaseRent(), RoomStatus.of(activeLease, room.isUnderMaintenance()),
                activeLease == null ? null : LeaseBrief.of(activeLease),
                // ที่ยึดเป็น 0 กับ null ไว้ก่อน ดูเหตุผลใน javadoc ของ record
                0, null);
    }
}
