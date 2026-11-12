package com.sakurasoul.apartment.document;

import com.sakurasoul.apartment.attachment.OwnerType;

import java.time.Instant;
import java.time.LocalDate;

/**
 * เอกสารสแกนหนึ่งฉบับตามสัญญา API (SSK-172)
 * <p>
 * id คือเลขของเอกสาร attachmentId คือเลขของไฟล์ในที่เก็บกลาง สองเลขนี้คนละตัวกัน
 * ลบหรืออ้างถึงเอกสารใช้ id เปิดไฟล์ใช้ contentUrl
 */
public record DocumentResponse(
        Long id,
        DocumentType type,
        String description,
        LocalDate scanDate,
        Owner owner,
        String fileName,
        String contentType,
        long sizeBytes,
        String sha256,
        Instant uploadedAt,
        String uploadedBy,
        long attachmentId,
        String contentUrl) {

    /**
     * เจ้าของพร้อมห้องและผู้เช่า หน้าเว็บไม่ต้องเก็บห้องหรือชื่อเป็นข้อความเอง
     * <p>
     * เลขห้องของสัญญาและใบเสร็จมาจากสำเนาในสัญญา (SSK-180) เลขที่พิมพ์บนเอกสารฉบับนั้น ใบแจ้งซ่อมใช้ห้องปัจจุบัน
     * ชื่อผู้เช่าเป็นชื่อปัจจุบันแบบเดียวกับใบเสร็จ ใบแจ้งซ่อมไม่มีผู้เช่าผูกอยู่ tenantId กับ tenantName จึงเป็น null
     *
     * @param kind LEASE, MAINTENANCE_TICKET หรือ RECEIPT
     */
    public record Owner(OwnerType kind, long id, long roomId, String roomNumber, Long tenantId, String tenantName) {
    }
}
