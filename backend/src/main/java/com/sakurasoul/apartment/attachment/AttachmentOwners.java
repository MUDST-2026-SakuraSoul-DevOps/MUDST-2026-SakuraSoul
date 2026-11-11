package com.sakurasoul.apartment.attachment;

import com.sakurasoul.apartment.common.NotFoundException;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

/**
 * ตรวจว่าเจ้าของของไฟล์มีอยู่จริง (SSK-161) ตอบ 404 ตามสัญญา เช่น "No lease with id 999"
 * <p>
 * ถามตารางของเจ้าของตรง ๆ แทนการ inject repository สี่ตัวจากสี่ package ชื่อตารางมาจาก OwnerType ซึ่งเป็นค่าคงที่ในโค้ด
 * ไม่ได้มาจากผู้ใช้ ส่วน id ส่งเป็นพารามิเตอร์
 * <p>
 * อ่านแบบ FOR KEY SHARE ล็อกแถวเจ้าของไว้จนจบ transaction ของการอัปโหลด ใบแจ้งซ่อมที่ถูกลบพร้อมกันจะรอให้อัปโหลดเสร็จ
 * แล้วไฟล์ถูกลบตามไปด้วย ON DELETE CASCADE ถ้าไม่ล็อก การลบที่แทรกเข้ามาทำให้ INSERT ชน foreign key แล้วได้ 409 กลาง ๆ
 * แทน 404 ล็อกแบบนี้ไม่กันการแก้ช่องอื่นของแถวเจ้าของ (FOR KEY SHARE กันแค่การลบและการแก้คีย์)
 */
@Component
class AttachmentOwners {

    private final JdbcClient jdbc;

    AttachmentOwners(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /** มีอยู่จริงไหม ใช้กับการอ่านรายการ (transaction แบบอ่านอย่างเดียวล็อกแถวไม่ได้) */
    void requireExists(OwnerRef owner) {
        check(owner, "");
    }

    /** มีอยู่จริงแล้วล็อกแถวไว้จนจบ transaction ของการอัปโหลด */
    void requireExistsAndHold(OwnerRef owner) {
        check(owner, " FOR KEY SHARE");
    }

    private void check(OwnerRef owner, String lock) {
        boolean exists = jdbc.sql("SELECT 1 FROM " + owner.type().table() + " WHERE id = :id" + lock)
                .param("id", owner.id())
                .query(Integer.class)
                .optional()
                .isPresent();
        if (!exists) {
            throw new NotFoundException(owner.type().label(), owner.id());
        }
    }
}
