package com.sakurasoul.apartment.attachment;

import java.time.Instant;

/**
 * ไฟล์แนบหนึ่งไฟล์ตามสัญญา API (SSK-161) ไม่มีตัวไฟล์ เปิดไฟล์ผ่าน contentUrl
 * id ออกโดย server หน้าเว็บต้องใช้ค่านี้ ห้ามตั้งเอง
 */
public record AttachmentResponse(
        Long id,
        OwnerType ownerType,
        long ownerId,
        String fileName,
        String contentType,
        long sizeBytes,
        String sha256,
        Instant uploadedAt,
        String uploadedBy,
        String contentUrl) {

    public static AttachmentResponse of(Attachment attachment) {
        OwnerRef owner = attachment.owner();
        return new AttachmentResponse(attachment.getId(), owner.type(), owner.id(), attachment.getFileName(),
                attachment.getContentType(), attachment.getSizeBytes(), attachment.getSha256(),
                attachment.getUploadedAt(), attachment.getUploadedBy(), contentUrl(attachment.getId()));
    }

    public static String contentUrl(long attachmentId) {
        return "/api/attachments/" + attachmentId + "/content";
    }
}
