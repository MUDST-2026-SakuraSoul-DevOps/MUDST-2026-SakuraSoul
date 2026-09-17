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
 * ยังไม่มี openMaintenanceCount กับ openMaintenanceTitle ที่สัญญา API เขียนไว้
 * สองตัวนั้นเป็นของ epic งานซ่อม (CR-05) หน้าเว็บถอยไปใช้ค่าปริยายได้อยู่แล้ว
 */
public record RoomSummaryResponse(
        Long id,
        String roomNumber,
        int floor,
        BigDecimal baseRent,
        RoomStatus status,
        LeaseBrief currentLease) {

    /** activeLease เป็น null ได้ แปลว่าไม่มีสัญญาที่ครอบวันนี้ */
    public static RoomSummaryResponse of(Room room, Lease activeLease) {
        return new RoomSummaryResponse(room.getId(), room.getRoomNumber(), room.getFloor(),
                room.getBaseRent(), RoomStatus.of(activeLease),
                activeLease == null ? null : LeaseBrief.of(activeLease));
    }
}
