package com.sakurasoul.apartment.document;

import com.sakurasoul.apartment.common.Whitespace;

import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.regex.Pattern;

/**
 * ตัวกรองของ GET /api/documents (SSK-172) ทุกตัวไม่บังคับ null คือไม่กรอง
 * <p>
 * roomId กับ tenantId ที่ไม่มีอยู่จริงได้รายการว่าง ไม่ใช่ 404 เพราะเป็นการค้น ไม่ใช่การเปิดของชิ้นหนึ่ง
 *
 * @param from เทียบกับวันที่สแกน รวมวันนั้น
 * @param to   เทียบกับวันที่สแกน รวมวันนั้น
 * @param q    ค้นแบบมีคำนั้นอยู่ ไม่สนตัวพิมพ์ ในคำอธิบาย ชื่อไฟล์ เลขห้อง และชื่อผู้เช่า
 */
record DocumentQuery(DocumentType type, Long roomId, Long tenantId, LocalDate from, LocalDate to, String q) {

    static final String RANGE = "from and to must be YYYY-MM-DD with from not after to";

    private static final Pattern ISO_DATE = Pattern.compile("\\d{4}-\\d{2}-\\d{2}");

    /** ตรวจตามลำดับ ชนิด → from/to */
    static DocumentQuery of(String type, Long roomId, Long tenantId, String from, String to, String q) {
        DocumentType parsedType = type == null || Whitespace.trim(type).isEmpty() ? null : DocumentType.parse(type);
        LocalDate fromDate = date(from);
        LocalDate toDate = date(to);
        if (fromDate != null && toDate != null && fromDate.isAfter(toDate)) {
            throw new IllegalArgumentException(RANGE);
        }
        String text = q == null ? "" : Whitespace.trim(DocumentRules.withoutControls(q));
        return new DocumentQuery(parsedType, roomId, tenantId, fromDate, toDate, text.isEmpty() ? null : text);
    }

    /** q ที่ใส่ใน LIKE โดย % _ และ \ ในคำค้นเป็นตัวอักษรธรรมดา ไม่ใช่ wildcard */
    String likePattern() {
        return "%" + q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%";
    }

    private static LocalDate date(String text) {
        String trimmed = text == null ? "" : Whitespace.trim(text);
        if (trimmed.isEmpty()) {
            return null;
        }
        if (!ISO_DATE.matcher(trimmed).matches()) {
            throw new IllegalArgumentException(RANGE);
        }
        try {
            return LocalDate.parse(trimmed);
        } catch (DateTimeParseException invalid) {
            throw new IllegalArgumentException(RANGE, invalid);
        }
    }
}
