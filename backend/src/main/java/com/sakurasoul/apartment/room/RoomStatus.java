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

    /** ห้องที่ธง under_maintenance ในตาราง room ถูกตั้งไว้ (US-15) */
    MAINTENANCE;

    /**
     * รวมสองแหล่งที่ตัดสินสถานะห้องเข้าด้วยกันที่เมธอดเดียว คือธงซ่อมบำรุงกับสัญญา
     * ที่ครอบวันนี้ ทุก response ของห้องต้องผ่านทางนี้ สถานะจะได้ไม่แตกกันระหว่าง endpoint
     * <p>
     * ธงชนะสัญญาเสมอ ตามที่สัญญา API เขียนไว้ว่าห้องที่ปิดซ่อมให้ตอบ MAINTENANCE
     * ถึงจะมีสัญญาค้างอยู่ก็ตาม ส่วนสัญญายังอยู่ครบ พอปลดธงห้องจึงกลับไปเป็น OCCUPIED เอง
     */
    public static RoomStatus of(Lease activeLease, boolean underMaintenance) {
        if (underMaintenance) {
            return MAINTENANCE;
        }
        return activeLease == null ? AVAILABLE : OCCUPIED;
    }
}
