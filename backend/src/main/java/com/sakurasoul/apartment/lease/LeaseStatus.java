package com.sakurasoul.apartment.lease;

/**
 * สถานะสัญญา ตรงกับ CHECK constraint lease_status_ck ใน V3
 * <p>
 * ไม่มีสถานะ "ลบแล้ว" เพราะประวัติสัญญาเป็นข้อมูลที่หอพักต้องเก็บ การเลิกสัญญา
 * จึงเป็นการเปลี่ยนสถานะเป็น ENDED ไม่ใช่ลบแถวทิ้ง (ดู docs/api-contract-lease.md)
 */
public enum LeaseStatus {

    ACTIVE,
    ENDED
}
