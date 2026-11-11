package com.sakurasoul.apartment.document;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.LocalDate;

/**
 * เอกสารสแกน (SSK-172) คือไฟล์หนึ่งไฟล์ในที่เก็บกลางพร้อมชนิด คำอธิบาย และวันที่สแกน
 * <p>
 * เจ้าของกับ soft delete อยู่ที่ไฟล์ (attachment) ที่เดียว เอกสารจึงไม่มีทางถูกลบโดยที่ไฟล์ยังอยู่หรือกลับกัน
 * ทุกช่องแก้ไม่ได้หลังสร้าง ในเฟสนี้ไม่มีการแก้เอกสาร
 */
@Entity
@Table(name = "document")
public class Document {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "attachment_id", nullable = false, updatable = false)
    private Long attachmentId;

    @Enumerated(EnumType.STRING)
    @Column(name = "document_type", nullable = false, length = 20, updatable = false)
    private DocumentType type;

    @Column(name = "description", length = 200, updatable = false)
    private String description;

    @Column(name = "scan_date", nullable = false, updatable = false)
    private LocalDate scanDate;

    protected Document() {
    }

    static Document of(long attachmentId, DocumentType type, String description, LocalDate scanDate) {
        Document document = new Document();
        document.attachmentId = attachmentId;
        document.type = type;
        document.description = description;
        document.scanDate = scanDate;
        return document;
    }

    public Long getId() {
        return id;
    }

    public Long getAttachmentId() {
        return attachmentId;
    }

    public DocumentType getType() {
        return type;
    }

    public String getDescription() {
        return description;
    }

    public LocalDate getScanDate() {
        return scanDate;
    }
}
