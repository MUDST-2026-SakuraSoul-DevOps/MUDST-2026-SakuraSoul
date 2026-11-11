package com.sakurasoul.apartment.attachment;

import com.sakurasoul.apartment.common.NotFoundException;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

/**
 * ตรวจว่าเจ้าของของไฟล์มีอยู่จริง (SSK-161) ตอบ 404 ตามสัญญา เช่น "No lease with id 999"
 * <p>
 * ถามตารางของเจ้าของตรง ๆ แทนการ inject repository สี่ตัวจากสี่ package ชื่อตารางมาจาก OwnerType ซึ่งเป็นค่าคงที่ในโค้ด
 * ไม่ได้มาจากผู้ใช้ ส่วน id ส่งเป็นพารามิเตอร์ foreign key ของ V23 เป็นด่านสุดท้ายถ้าเจ้าของถูกลบระหว่างทาง
 */
@Component
class AttachmentOwners {

    private final JdbcClient jdbc;

    AttachmentOwners(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    void requireExists(OwnerRef owner) {
        boolean exists = jdbc.sql("SELECT EXISTS (SELECT 1 FROM " + owner.type().table() + " WHERE id = :id)")
                .param("id", owner.id())
                .query(Boolean.class)
                .single();
        if (!exists) {
            throw new NotFoundException(owner.type().label(), owner.id());
        }
    }
}
