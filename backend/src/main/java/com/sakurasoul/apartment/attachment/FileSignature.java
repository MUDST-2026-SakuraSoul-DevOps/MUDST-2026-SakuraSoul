package com.sakurasoul.apartment.attachment;

import java.util.Optional;

/**
 * ตรวจชนิดไฟล์จากไบต์แรกของเนื้อไฟล์ (magic bytes) ตามสัญญา API (SSK-161)
 * <p>
 * ไม่เชื่อนามสกุลหรือ Content-Type ที่เบราว์เซอร์ส่งมา เพราะผู้ใช้เปลี่ยนชื่อไฟล์ .exe เป็น .png ได้
 * ตรวจที่ตำแหน่ง 0 เท่านั้น ไฟล์ที่ซ่อนลายเซ็นไว้กลางไฟล์จึงไม่ผ่าน
 * <ul>
 *   <li>PDF: {@code %PDF-}</li>
 *   <li>PNG: {@code 89 50 4E 47 0D 0A 1A 0A}</li>
 *   <li>JPEG: {@code FF D8 FF}</li>
 * </ul>
 * ลายเซ็นบอกแค่ว่าไฟล์ขึ้นต้นถูก ไม่ได้รับรองว่าทั้งไฟล์ถูกต้อง ไฟล์ส่งกลับไปพร้อม nosniff และชนิดที่ตรวจได้
 * เบราว์เซอร์จึงไม่รันไฟล์เป็นอย่างอื่น
 */
public final class FileSignature {

    private static final byte[] PDF = {'%', 'P', 'D', 'F', '-'};
    private static final byte[] PNG = {(byte) 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A};
    private static final byte[] JPEG = {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF};

    private FileSignature() {
    }

    public static Optional<FileKind> detect(byte[] content) {
        if (startsWith(content, PDF)) {
            return Optional.of(FileKind.PDF);
        }
        if (startsWith(content, PNG)) {
            return Optional.of(FileKind.PNG);
        }
        if (startsWith(content, JPEG)) {
            return Optional.of(FileKind.JPEG);
        }
        return Optional.empty();
    }

    private static boolean startsWith(byte[] content, byte[] signature) {
        if (content.length < signature.length) {
            return false;
        }
        for (int i = 0; i < signature.length; i++) {
            if (content[i] != signature[i]) {
                return false;
            }
        }
        return true;
    }
}
