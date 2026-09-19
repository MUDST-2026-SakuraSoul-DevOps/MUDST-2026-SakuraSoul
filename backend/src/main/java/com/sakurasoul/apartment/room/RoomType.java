package com.sakurasoul.apartment.room;

/**
 * ชนิดห้อง ค่าที่รับได้ตรงกับ CHECK constraint room_type_ck ใน V11
 * และตรงกับ type RoomType ฝั่งหน้าเว็บ (frontend/src/api/types.ts)
 * <p>
 * ป้ายที่ผู้ใช้เห็นคือ "Single Bedroom" / "Double Bedroom" ซึ่งอยู่ที่
 * frontend/src/domain/room.ts (ROOM_TYPE_LABEL) ฝั่งนี้ส่งแต่รหัสไป
 * เหมือนที่ทำกับ LeaseStatus และ BillingCycle
 */
public enum RoomType {

    SINGLE,
    DOUBLE
}
