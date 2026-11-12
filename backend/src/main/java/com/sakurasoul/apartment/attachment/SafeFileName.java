package com.sakurasoul.apartment.attachment;

import java.text.Normalizer;

/**
 * ทำความสะอาดชื่อไฟล์ที่เบราว์เซอร์ส่งมา (SSK-161) ก่อนเก็บและก่อนใส่ใน Content-Disposition ตอนดาวน์โหลด
 * <ol>
 *   <li>ตัด path ที่ติดมา เหลือส่วนหลัง / หรือ \ ตัวสุดท้าย ({@code C:\fakepath\slip.jpg}, {@code ../../etc/passwd})</li>
 *   <li>ตัดอักขระควบคุมและอักขระกลับทิศ (bidi) ที่ใช้หลอกให้ "gpj.exe" ดูเหมือน "exe.jpg"</li>
 *   <li>ชื่อที่เหลือว่าง เป็น . หรือ .. เปลี่ยนเป็น {@code file}</li>
 *   <li>ยาวไม่เกิน 150 ตัว (นับเป็นตัวอักษร ไม่ใช่ char ของ Java) ตัดที่ชื่อก่อนนามสกุล นามสกุลจึงยังอยู่</li>
 * </ol>
 * ทำ NFC ก่อนทุกขั้น ชื่อไทยจาก macOS ที่แยกสระกับวรรณยุกต์ออกจากกันจึงได้ชื่อเดียวกับที่พิมพ์บน Windows
 * <p>
 * {@link #of(String, FileKind)} เติมนามสกุลจริงต่อท้ายชื่อที่นามสกุลไม่ตรงกับเนื้อไฟล์ ({@code run.bat} ที่เป็น PDF
 * ได้ {@code run.bat.pdf}) เบราว์เซอร์ใช้ชื่อนี้ตอนบันทึกไฟล์ลงเครื่อง ถ้าคงชื่อเดิม ไฟล์ที่ขึ้นต้นเป็น PDF
 * แต่ข้างในเป็นคำสั่ง จะถูกบันทึกเป็น .bat แล้วเปิดด้วยการดับเบิลคลิกได้
 */
public final class SafeFileName {

    static final int MAX_LENGTH = 150;

    static final String FALLBACK = "file";

    /** นามสกุลยาวกว่านี้ไม่ถือว่าเป็นนามสกุล ตัดรวมไปกับชื่อ */
    private static final int MAX_EXTENSION = 10;

    private SafeFileName() {
    }

    /** ชื่อที่ทำความสะอาดแล้วและลงท้ายด้วยนามสกุลของชนิดจริงเสมอ */
    public static String of(String original, FileKind kind) {
        String name = of(original);
        return kind.matchesNameOf(name) ? name : shorten(name + kind.extension());
    }

    public static String of(String original) {
        if (original == null) {
            return FALLBACK;
        }
        String name = Normalizer.normalize(original, Normalizer.Form.NFC);
        name = name.substring(Math.max(name.lastIndexOf('/'), name.lastIndexOf('\\')) + 1);
        name = name.codePoints()
                .filter(codePoint -> !Character.isISOControl(codePoint) && !isBidiControl(codePoint))
                .collect(StringBuilder::new, StringBuilder::appendCodePoint, StringBuilder::append)
                .toString()
                .strip();
        if (name.isEmpty() || name.equals(".") || name.equals("..")) {
            return FALLBACK;
        }
        return shorten(name);
    }

    private static String shorten(String name) {
        if (name.codePointCount(0, name.length()) <= MAX_LENGTH) {
            return name;
        }
        int dot = name.lastIndexOf('.');
        String extension = dot > 0 && name.length() - dot <= MAX_EXTENSION + 1 ? name.substring(dot) : "";
        String stem = name.substring(0, name.length() - extension.length());
        int keep = MAX_LENGTH - extension.codePointCount(0, extension.length());
        return stem.substring(0, stem.offsetByCodePoints(0, keep)) + extension;
    }

    private static boolean isBidiControl(int codePoint) {
        return codePoint == 0x200E || codePoint == 0x200F
                || (codePoint >= 0x202A && codePoint <= 0x202E)
                || (codePoint >= 0x2066 && codePoint <= 0x2069);
    }
}
