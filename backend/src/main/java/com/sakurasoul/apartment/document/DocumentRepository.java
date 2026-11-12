package com.sakurasoul.apartment.document;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface DocumentRepository extends JpaRepository<Document, Long> {

    /** เอกสารของไฟล์นี้ ไฟล์หนึ่งเป็นของเอกสารได้ไม่เกินหนึ่งฉบับ (document_attachment_uk) */
    boolean existsByAttachmentId(Long attachmentId);

    Optional<Document> findByAttachmentId(Long attachmentId);
}
