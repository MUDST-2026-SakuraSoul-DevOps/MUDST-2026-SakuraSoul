package com.sakurasoul.apartment.attachment;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

/**
 * เก็บตัวไฟล์เป็น bytea ในตาราง attachment_content (V23)
 * <p>
 * ใช้ JdbcClient ไม่ใช่ entity เพราะ Hibernate เก็บสำเนาค่าของทุก entity ไว้เทียบตอน flush
 * ไฟล์ 5 MB จึงกินหน่วยความจำสองเท่าตลอด transaction โดยไม่ได้อะไร ตัวไฟล์เขียนครั้งเดียวและไม่เคยแก้
 * <p>
 * ไม่ทำ streaming เพราะไฟล์ไม่เกิน 5 MB และผู้ใช้เป็นแอดมินไม่กี่คน การอ่านทั้งไฟล์ทีเดียวง่ายและพอ
 */
@Component
class DatabaseAttachmentStore implements AttachmentStore {

    private final JdbcClient jdbc;

    DatabaseAttachmentStore(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public void put(long attachmentId, byte[] content) {
        jdbc.sql("INSERT INTO attachment_content (attachment_id, data) VALUES (:id, :data)")
                .param("id", attachmentId)
                .param("data", content)
                .update();
    }

    @Override
    public byte[] get(long attachmentId) {
        return jdbc.sql("SELECT data FROM attachment_content WHERE attachment_id = :id")
                .param("id", attachmentId)
                .query(byte[].class)
                .optional()
                .orElseThrow(() -> new IllegalStateException("Attachment " + attachmentId + " has no content"));
    }
}
