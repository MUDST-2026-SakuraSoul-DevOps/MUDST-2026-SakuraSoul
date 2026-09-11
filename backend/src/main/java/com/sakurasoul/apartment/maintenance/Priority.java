package com.sakurasoul.apartment.maintenance;

/**
 * ระดับความสำคัญของงานซ่อมและของการแจ้งเตือนตามรอบ
 * <p>
 * ชุดค่าเดียวกับ TaskPriority ฝั่งหน้าเว็บ (Low / Medium / High / Urgent) แต่เก็บเป็น
 * ตัวพิมพ์ใหญ่ให้เข้าชุดกับ enum ตัวอื่นของ API นี้ (LeaseStatus, BillingCycle, RoomStatus)
 * หน้าเว็บแปลงกลับเป็นป้ายที่ผู้ใช้เห็นเอง
 */
public enum Priority {

    LOW,
    MEDIUM,
    HIGH,
    URGENT;

    /** ไม่ส่งมาถือว่าปกติ ตรงกับค่า DEFAULT 'MEDIUM' ของคอลัมน์ใน V8 */
    public static Priority parseOrDefault(String value) {
        return value == null ? MEDIUM : parse(value);
    }

    /** ค่าที่ไม่รู้จักเป็น 400 พร้อมข้อความที่บอกครบว่าค่าที่ใช้ได้มีอะไรบ้าง */
    public static Priority parse(String value) {
        for (Priority priority : values()) {
            if (priority.name().equals(value)) {
                return priority;
            }
        }
        throw new IllegalArgumentException("ระดับความสำคัญต้องเป็น LOW, MEDIUM, HIGH หรือ URGENT");
    }
}
