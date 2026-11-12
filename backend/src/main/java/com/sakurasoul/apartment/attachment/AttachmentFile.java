package com.sakurasoul.apartment.attachment;

import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;

import java.nio.charset.StandardCharsets;

/**
 * ตัวไฟล์ที่ส่งกลับตอนดาวน์โหลด (SSK-161) header ตามสัญญา API
 * <ul>
 *   <li>Content-Type ตามชนิดที่ตรวจจากเนื้อไฟล์ตอนอัปโหลด ไม่ใช่ที่เบราว์เซอร์บอกมา</li>
 *   <li>X-Content-Type-Options: nosniff กันเบราว์เซอร์เดาชนิดเองแล้วรันไฟล์เป็นอย่างอื่น
 *       Spring Security ใส่ให้อยู่แล้ว ตั้งเองอีกที endpoint นี้จึงไม่พึ่งค่าตั้งของ security</li>
 *   <li>Content-Disposition: inline ทั้งสามชนิด ให้เปิดดูในแท็บได้ ชื่อไทยส่งแบบ filename*=UTF-8''... (RFC 5987)</li>
 *   <li>Cache-Control: private, no-store เพราะเป็นเอกสารส่วนบุคคล เช่นสแกนบัตรประชาชน</li>
 * </ul>
 */
record AttachmentFile(String fileName, FileKind kind, byte[] content) {

    ResponseEntity<byte[]> asInline() {
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(kind.contentType()))
                .contentLength(content.length)
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        ContentDisposition.inline().filename(fileName, StandardCharsets.UTF_8).build().toString())
                .header("X-Content-Type-Options", "nosniff")
                .header(HttpHeaders.CACHE_CONTROL, "private, no-store")
                .body(content);
    }
}
