package com.sakurasoul.apartment.document;

import org.springframework.data.jpa.repository.JpaRepository;

/** ไฟล์หนึ่งเป็นของเอกสารได้ไม่เกินหนึ่งฉบับ ตัวกันคือ document_attachment_uk ในฐานข้อมูล */
public interface DocumentRepository extends JpaRepository<Document, Long> {
}
