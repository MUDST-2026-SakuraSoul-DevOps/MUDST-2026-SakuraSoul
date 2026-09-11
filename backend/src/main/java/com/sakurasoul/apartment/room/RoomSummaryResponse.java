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
 * openMaintenanceCount กับ openMaintenanceTitle มีค่าจริงแล้วตั้งแต่ CR-05 (ตาราง
 * maintenance_ticket ใน V8) เคยเป็นค่าว่างตายตัว 0 กับ null อยู่ช่วงหนึ่งเพื่อให้รูปร่าง
 * JSON ครบตามสัญญา API ตั้งแต่ก่อนมีตาราง ตอนนี้ RoomService เป็นคนคิดค่าให้แล้ว
 * หน้าเว็บไม่ต้องแก้อะไรเลยตามที่ตั้งใจไว้แต่แรก
 * <p>
 * count คือจำนวนใบที่สถานะยังไม่ใช่ DONE ส่วน title คือชื่อเรื่องของใบที่เก่าที่สุดในกลุ่มนั้น
 * (เฟรม Dashboard ใน Figma โชว์ข้อความแทนตัวเลข) เป็น null เมื่อไม่มีใบค้าง
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

    /**
     * activeLease เป็น null ได้ แปลว่าไม่มีสัญญาที่ครอบวันนี้
     * openMaintenance เป็น null ได้ แปลว่าห้องนี้ไม่มีใบแจ้งซ่อมค้างอยู่
     */
    public static RoomSummaryResponse of(Room room, Lease activeLease, OpenMaintenance openMaintenance) {
        return new RoomSummaryResponse(room.getId(), room.getRoomNumber(), room.getFloor(),
                room.getBaseRent(), RoomStatus.of(activeLease, room.isUnderMaintenance()),
                activeLease == null ? null : LeaseBrief.of(activeLease),
                OpenMaintenance.countOf(openMaintenance), OpenMaintenance.titleOf(openMaintenance));
    }
}
