package com.sakurasoul.apartment.maintenance;

/**
 * ใบแจ้งซ่อมใบนี้เกิดขึ้นได้ยังไง
 * <p>
 * มีไว้ให้แอดมินแยกออกว่าใบไหนตัวเองเป็นคนเปิด (MANUAL) กับใบไหนระบบสร้างให้เองจาก
 * การแจ้งเตือนตามรอบของ US-14 (RECURRING) ถ้าไม่แยก พอเปิดหน้า Maintenance Log
 * มาแล้วเจอใบที่ไม่มีใครจำได้ว่าเปิด จะไล่ไม่ถูกว่ามาจากไหน
 */
public enum TicketSource {

    MANUAL,
    RECURRING
}
