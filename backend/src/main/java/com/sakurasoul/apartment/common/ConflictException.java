package com.sakurasoul.apartment.common;

/**
 * คำขอถูกต้องตามรูปแบบ แต่ชนกับข้อมูลที่มีอยู่แล้ว เช่น สร้างสัญญาทับช่วงวันที่ของสัญญาเดิม
 * <p>
 * ข้อความที่ใส่มาจะถูกส่งไปที่ฟิลด์ detail ของ ProblemDetail ตรง ๆ และหน้าเว็บเอาไปโชว์
 * ให้ผู้ใช้เห็นทั้งประโยค จึงต้องเขียนให้อ่านรู้เรื่องและบอกได้ว่าไปชนกับอะไร
 */
public class ConflictException extends RuntimeException {

    public ConflictException(String message) {
        super(message);
    }
}
