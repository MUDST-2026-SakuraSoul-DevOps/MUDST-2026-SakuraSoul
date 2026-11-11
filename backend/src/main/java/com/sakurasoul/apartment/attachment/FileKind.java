package com.sakurasoul.apartment.attachment;

/**
 * ชนิดไฟล์ที่ที่เก็บไฟล์กลางรับ (SSK-161) ตรงกับ CHECK constraint attachment_content_type_ck (V23)
 * <p>
 * ชนิดตัดสินจากเนื้อไฟล์ ({@link FileSignature}) ไม่ใช่นามสกุลหรือ Content-Type ที่เบราว์เซอร์ส่งมา
 */
public enum FileKind {

    PDF("application/pdf"),
    PNG("image/png"),
    JPEG("image/jpeg");

    private final String contentType;

    FileKind(String contentType) {
        this.contentType = contentType;
    }

    /** ค่าที่เก็บในคอลัมน์ content_type และส่งเป็น Content-Type ตอนดาวน์โหลด */
    public String contentType() {
        return contentType;
    }

    /** ค่าที่อ่านกลับจากฐานข้อมูล ค่าอื่นคือข้อมูลเสียหรือบั๊ก (constraint กันไว้แล้ว) */
    public static FileKind ofContentType(String contentType) {
        for (FileKind kind : values()) {
            if (kind.contentType.equals(contentType)) {
                return kind;
            }
        }
        throw new IllegalStateException("Unknown stored content type " + contentType);
    }
}
