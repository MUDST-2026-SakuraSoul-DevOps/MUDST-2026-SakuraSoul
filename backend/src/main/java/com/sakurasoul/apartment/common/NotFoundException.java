package com.sakurasoul.apartment.common;

public class NotFoundException extends RuntimeException {

    /** เคสปกติ หาของตาม id ไม่เจอ ได้ข้อความว่า "No unit with id 7" */
    public NotFoundException(String what, Object id) {
        super("No " + what + " with id " + id);
    }

    /**
     * เคสที่ id ไม่ได้ช่วยให้ผู้ใช้เข้าใจอะไรเลย เช่น ตารางที่มีแถวเดียวซึ่ง id เป็น 1
     * ตายตัว ข้อความ "No apartment config with id 1" อ่านแล้วงงว่า id 1 คืออะไร
     * กรณีแบบนี้ให้ผู้เรียกเขียนข้อความเต็มมาเองว่าเกิดอะไรขึ้นและต้องไปดูตรงไหนต่อ
     */
    public NotFoundException(String message) {
        super(message);
    }
}
