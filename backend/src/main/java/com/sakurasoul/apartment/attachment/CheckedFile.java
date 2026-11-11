package com.sakurasoul.apartment.attachment;

import com.sakurasoul.apartment.common.FileTooLargeException;
import com.sakurasoul.apartment.common.UnsupportedFileTypeException;

import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;

/**
 * ไฟล์ที่ผ่านการตรวจขนาดและชนิดแล้ว พร้อม SHA-256 (SSK-161)
 * <p>
 * ตรวจขนาดก่อนชนิดตามลำดับในสัญญา ไฟล์ใหญ่ที่ชนิดผิดด้วยจึงได้ 413 ซึ่งบอกสิ่งที่ผู้ใช้ต้องแก้ก่อน
 */
public record CheckedFile(String fileName, FileKind kind, byte[] content, String sha256) {

    /** 5 MB ตามสัญญา (5 x 1024 x 1024 ไบต์) ตรงกับ attachment_size_ck */
    public static final int MAX_BYTES = 5 * 1024 * 1024;

    static final String TOO_LARGE = "The file is larger than 5 MB";

    static final String UNSUPPORTED = "Only PDF, PNG and JPEG files are allowed";

    static CheckedFile of(String originalName, byte[] content) {
        if (content.length > MAX_BYTES) {
            throw new FileTooLargeException(TOO_LARGE);
        }
        FileKind kind = FileSignature.detect(content)
                .orElseThrow(() -> new UnsupportedFileTypeException(UNSUPPORTED));
        return new CheckedFile(SafeFileName.of(originalName, kind), kind, content, sha256Of(content));
    }

    static String sha256Of(byte[] content) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(content));
        } catch (NoSuchAlgorithmException impossible) {
            // ทุก JVM ต้องมี SHA-256 ตามสเปกของ Java
            throw new IllegalStateException(impossible);
        }
    }
}
