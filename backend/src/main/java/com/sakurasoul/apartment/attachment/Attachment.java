package com.sakurasoul.apartment.attachment;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;

/**
 * ข้อมูลของไฟล์หนึ่งไฟล์ในที่เก็บกลาง (SSK-161) ไม่มีตัวไฟล์ ตัวไฟล์อยู่ที่ AttachmentStore
 * <p>
 * entity นี้ไม่มีช่องไบต์โดยตั้งใจ การอ่านรายการไฟล์จึงไม่มีทางลากไบต์ 5 MB ต่อไฟล์ขึ้นมาด้วย
 * และไม่มีสำเนาไบต์ค้างใน persistence context ให้ Hibernate เทียบตอน flush
 * <p>
 * เจ้าของเป็นคอลัมน์แยกตามชนิด (V23) ตั้งได้ช่องเดียว ช่องอื่นเป็น null ฐานข้อมูลตรวจซ้ำด้วย attachment_one_owner_ck
 * แอปลบไฟล์แบบ soft delete เท่านั้นผ่าน AttachmentRepository.markDeleted การลบจริงเกิดจาก ON DELETE CASCADE ตอนลบเจ้าของ
 */
@Entity
@Table(name = "attachment")
public class Attachment {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "lease_id", updatable = false)
    private Long leaseId;

    @Column(name = "ticket_id", updatable = false)
    private Long ticketId;

    @Column(name = "receipt_id", updatable = false)
    private Long receiptId;

    @Column(name = "payment_id", updatable = false)
    private Long paymentId;

    @Column(name = "file_name", nullable = false, length = 150, updatable = false)
    private String fileName;

    @Column(name = "content_type", nullable = false, length = 20, updatable = false)
    private String contentType;

    @Column(name = "size_bytes", nullable = false, updatable = false)
    private long sizeBytes;

    @Column(name = "sha256", nullable = false, length = 64, updatable = false)
    private String sha256;

    @Column(name = "uploaded_at", nullable = false, updatable = false)
    private Instant uploadedAt;

    @Column(name = "uploaded_by", nullable = false, length = 50, updatable = false)
    private String uploadedBy;

    @Column(name = "deleted_at", updatable = false)
    private Instant deletedAt;

    @Column(name = "deleted_by", length = 50, updatable = false)
    private String deletedBy;

    protected Attachment() {
    }

    static Attachment create(OwnerRef owner, CheckedFile file, String uploadedBy, Instant uploadedAt) {
        Attachment attachment = new Attachment();
        switch (owner.type()) {
            case LEASE -> attachment.leaseId = owner.id();
            case MAINTENANCE_TICKET -> attachment.ticketId = owner.id();
            case RECEIPT -> attachment.receiptId = owner.id();
            case PAYMENT -> attachment.paymentId = owner.id();
        }
        attachment.fileName = file.fileName();
        attachment.contentType = file.kind().contentType();
        attachment.sizeBytes = file.content().length;
        attachment.sha256 = file.sha256();
        attachment.uploadedBy = uploadedBy;
        attachment.uploadedAt = uploadedAt;
        return attachment;
    }

    public OwnerRef owner() {
        if (leaseId != null) {
            return new OwnerRef(OwnerType.LEASE, leaseId);
        }
        if (ticketId != null) {
            return new OwnerRef(OwnerType.MAINTENANCE_TICKET, ticketId);
        }
        if (receiptId != null) {
            return new OwnerRef(OwnerType.RECEIPT, receiptId);
        }
        if (paymentId != null) {
            return new OwnerRef(OwnerType.PAYMENT, paymentId);
        }
        throw new IllegalStateException("Attachment " + id + " has no owner");
    }

    public boolean isDeleted() {
        return deletedAt != null;
    }

    public FileKind kind() {
        return FileKind.ofContentType(contentType);
    }

    public Long getId() {
        return id;
    }

    public String getFileName() {
        return fileName;
    }

    public String getContentType() {
        return contentType;
    }

    public long getSizeBytes() {
        return sizeBytes;
    }

    public String getSha256() {
        return sha256;
    }

    public Instant getUploadedAt() {
        return uploadedAt;
    }

    public String getUploadedBy() {
        return uploadedBy;
    }

    public Instant getDeletedAt() {
        return deletedAt;
    }

    public String getDeletedBy() {
        return deletedBy;
    }
}
