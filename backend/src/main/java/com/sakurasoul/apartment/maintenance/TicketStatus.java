package com.sakurasoul.apartment.maintenance;

/**
 * สถานะของใบแจ้งซ่อม ตรงกับ MaintenanceStatus ใน frontend/src/api/types.ts
 * <p>
 * ฝั่งหน้าเว็บมีป้ายสามแบบของตัวเองอยู่ก่อนแล้ว (In Progress / Pending / Wait for Assign
 * ใน frontend/src/domain/maintenanceBoard.ts) ซึ่งไม่ตรงกับสามค่านี้ ตารางเทียบว่าป้าย
 * ไหนแปลงเป็นค่าไหนอยู่ใน docs/api-contract-maintenance.md หัวข้อ
 * "สิ่งที่หน้าเว็บต้องเปลี่ยน" ฝั่ง backend ยึดสามค่านี้เป็นหลักเพราะเป็นชุดที่สัญญา API
 * เขียนไว้ตั้งแต่ก่อนเริ่มทำ epic นี้
 */
public enum TicketStatus {

    OPEN,
    IN_PROGRESS,
    DONE;

    /**
     * แปลงค่าที่ผู้ใช้ส่งมาเป็นสถานะ ค่าที่ไม่รู้จักเป็น IllegalArgumentException
     * ซึ่ง ApiExceptionHandler แปลงเป็น 400 พร้อมข้อความไทยทั้งประโยค
     * <p>
     * ที่รับเป็น String แล้วแปลงเอง ไม่ได้ประกาศช่องใน DTO เป็น enum ตรง ๆ เพราะถ้าเป็น
     * enum ค่าที่สะกดผิดจะไปตกที่ handler ของ Jackson แล้วได้ข้อความว่า "ช่อง status
     * มีรูปแบบไม่ถูกต้อง" ซึ่งไม่ได้บอกผู้ใช้ว่าค่าที่ใช้ได้มีอะไรบ้าง
     */
    public static TicketStatus parse(String value) {
        for (TicketStatus status : values()) {
            if (status.name().equals(value)) {
                return status;
            }
        }
        throw new IllegalArgumentException("สถานะต้องเป็น OPEN, IN_PROGRESS หรือ DONE");
    }

    /** ปิดงานไปแล้วหรือยัง ใช้ตัดสินว่าใบนี้ยังนับเป็นงานค้างของห้องอยู่ไหม */
    public boolean isClosed() {
        return this == DONE;
    }
}
