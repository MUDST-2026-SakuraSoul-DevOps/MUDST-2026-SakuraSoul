package com.sakurasoul.apartment.attachment;

import java.util.Locale;

/**
 * ชนิดไฟล์ที่ที่เก็บไฟล์กลางรับ (SSK-161) ตรงกับ CHECK constraint attachment_content_type_ck (V23)
 * <p>
 * ชนิดตัดสินจากเนื้อไฟล์ ({@link FileSignature}) ไม่ใช่นามสกุลหรือ Content-Type ที่เบราว์เซอร์ส่งมา
 */
public enum FileKind {

    PDF("application/pdf", ".pdf"),
    PNG("image/png", ".png"),
    JPEG("image/jpeg", ".jpg", ".jpeg");

    private final String contentType;
    private final String[] extensions;

    FileKind(String contentType, String... extensions) {
        this.contentType = contentType;
        this.extensions = extensions;
    }

    /** นามสกุลหลักที่เติมให้ชื่อไฟล์ที่นามสกุลไม่ตรงกับเนื้อไฟล์ */
    String extension() {
        return extensions[0];
    }

    /** ชื่อนี้ลงท้ายด้วยนามสกุลของชนิดนี้ไหม ไม่สนตัวพิมพ์ */
    boolean matchesNameOf(String fileName) {
        String lower = fileName.toLowerCase(Locale.ROOT);
        for (String extension : extensions) {
            if (lower.endsWith(extension)) {
                return true;
            }
        }
        return false;
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
