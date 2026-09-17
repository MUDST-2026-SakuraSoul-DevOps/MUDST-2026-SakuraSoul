package com.sakurasoul.apartment.room;

import com.sakurasoul.apartment.lease.Lease;

/**
 * สถานะห้องที่ส่งให้หน้าเว็บ ไม่ได้เก็บเป็นคอลัมน์ในตาราง room แต่คำนวณตอนตอบทุกครั้ง
 * <p>
 * เหตุผลที่ไม่เก็บตรง ๆ อยู่ใน docs/api-contract-lease.md ย่อ ๆ คือ US-15 ให้ล็อกห้อง
 * ที่มีผู้เช่าอยู่ได้ พอปลดล็อกแล้วห้องต้องกลับไปเป็น OCCUPIED เอง ถ้าเก็บสถานะเดียว
 * จะจำไม่ได้ว่าก่อนล็อกห้องเป็นอะไร
 */
public enum RoomStatus {

    AVAILABLE,
    OCCUPIED,

    /**
     * ยังไม่มีอะไรคืนค่านี้ ต้องรอธง under_maintenance ซึ่งเป็นงานของ SSK-21 (US-15)
     * ใส่ไว้ตั้งแต่ตอนนี้เพราะหน้าเว็บมีสามค่านี้อยู่แล้ว ตั๋วนั้นจะได้ไม่ต้องแก้ enum
     */
    MAINTENANCE;

    /**
     * ห้องมีสัญญาที่ครอบวันนี้อยู่ไหม เป็นตัวตัดสินสถานะทั้งหมดในตอนนี้
     * <p>
     * SSK-21 ให้มาเพิ่มเงื่อนไข under_maintenance ที่เมธอดนี้ที่เดียว ห้องที่ปิดซ่อม
     * ต้องตอบ MAINTENANCE เสมอถึงจะมีสัญญาค้างอยู่ก็ตาม
     */
    public static RoomStatus of(Lease activeLease) {
        return activeLease == null ? AVAILABLE : OCCUPIED;
    }
}
