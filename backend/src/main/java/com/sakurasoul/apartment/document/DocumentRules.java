package com.sakurasoul.apartment.document;

import com.sakurasoul.apartment.attachment.OwnerRef;
import com.sakurasoul.apartment.attachment.OwnerType;
import com.sakurasoul.apartment.common.Whitespace;

import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;

/**
 * ตรวจค่าในฟอร์มอัปโหลดเอกสารสแกน (SSK-172) ตามลำดับ ตัวแรกที่ผิดโยน IllegalArgumentException ข้อความตามสัญญา API
 * ชนิด → วันที่สแกน (รูปแบบ แล้วไม่เป็นวันในอนาคต) → เจ้าของหนึ่งช่องพอดี → คำอธิบาย
 * <p>
 * ไฟล์ตรวจก่อนทุกข้อนี้ (ไม่มีไฟล์ได้ 400) ส่วนเจ้าของที่ไม่มีจริง ขนาด และชนิดไฟล์ตรวจทีหลังที่ AttachmentService.store
 */
final class DocumentRules {

    static final String SCAN_DATE = "Please choose the scan date (YYYY-MM-DD)";
    static final String FUTURE = "The scan date cannot be in the future";
    static final String ONE_OWNER = "Choose one lease, ticket or receipt for this document";
    static final String DESCRIPTION = "The description must be 200 characters or fewer";

    /** ตรงกับ document.description VARCHAR(200) ซึ่ง PostgreSQL นับเป็นตัวอักษร ไม่ใช่ char ของ Java */
    static final int MAX_DESCRIPTION = 200;

    /** วันที่สแกนก่อนนี้คือพิมพ์ผิด (เช่นปี 0000 ซึ่ง PostgreSQL เก็บเป็นปีก่อนคริสตกาล) */
    static final LocalDate EARLIEST_SCAN = LocalDate.of(1900, 1, 1);

    private static final Pattern ISO_DATE = Pattern.compile("\\d{4}-\\d{2}-\\d{2}");

    private DocumentRules() {
    }

    /** @param description ว่างหรือมีแต่ช่องว่างถือว่าไม่ได้ใส่ */
    record NewDocument(DocumentType type, LocalDate scanDate, String description, OwnerRef owner) {
    }

    static NewDocument check(String type, String scanDate, String description, String leaseId, String ticketId,
            String receiptId, LocalDate today) {
        DocumentType parsedType = DocumentType.parse(type);
        LocalDate parsedDate = scanDate(scanDate);
        if (parsedDate.isAfter(today)) {
            throw new IllegalArgumentException(FUTURE);
        }
        OwnerRef owner = owner(leaseId, ticketId, receiptId);
        String trimmed = description == null ? "" : Whitespace.trim(withoutControls(description));
        if (trimmed.codePointCount(0, trimmed.length()) > MAX_DESCRIPTION) {
            throw new IllegalArgumentException(DESCRIPTION);
        }
        return new NewDocument(parsedType, parsedDate, trimmed.isEmpty() ? null : trimmed, owner);
    }

    /**
     * ตัดอักขระควบคุม (รวม NUL ที่ PostgreSQL ไม่รับในข้อความ) ออกจากข้อความที่ผู้ใช้พิมพ์
     * ถ้าปล่อยไว้ ฐานข้อมูลปฏิเสธแล้วผู้ใช้ได้ 409 กลาง ๆ ที่ไม่บอกว่าผิดตรงไหน
     */
    static String withoutControls(String text) {
        return text.codePoints()
                .filter(codePoint -> !Character.isISOControl(codePoint))
                .collect(StringBuilder::new, StringBuilder::appendCodePoint, StringBuilder::append)
                .toString();
    }

    /** YYYY-MM-DD แบบเข้มงวด 2026-02-30 ไม่ผ่าน ก่อนปี 1900 ไม่ผ่าน */
    private static LocalDate scanDate(String text) {
        String trimmed = text == null ? "" : Whitespace.trim(text);
        if (!ISO_DATE.matcher(trimmed).matches()) {
            throw new IllegalArgumentException(SCAN_DATE);
        }
        LocalDate date;
        try {
            date = LocalDate.parse(trimmed);
        } catch (DateTimeParseException invalid) {
            throw new IllegalArgumentException(SCAN_DATE, invalid);
        }
        if (date.isBefore(EARLIEST_SCAN)) {
            throw new IllegalArgumentException(SCAN_DATE);
        }
        return date;
    }

    /** เจ้าของหนึ่งช่องพอดีจากสามช่อง ช่องว่างถือว่าไม่ได้ส่ง ค่าที่ไม่ใช่จำนวนเต็มบวกได้ข้อความเดียวกัน */
    private static OwnerRef owner(String leaseId, String ticketId, String receiptId) {
        List<OwnerRef> owners = new ArrayList<>();
        addIfPresent(owners, OwnerType.LEASE, leaseId);
        addIfPresent(owners, OwnerType.MAINTENANCE_TICKET, ticketId);
        addIfPresent(owners, OwnerType.RECEIPT, receiptId);
        if (owners.size() != 1) {
            throw new IllegalArgumentException(ONE_OWNER);
        }
        return owners.getFirst();
    }

    private static void addIfPresent(List<OwnerRef> owners, OwnerType type, String id) {
        if (id != null && !Whitespace.trim(id).isEmpty()) {
            owners.add(new OwnerRef(type, OwnerRef.positiveId(id, ONE_OWNER)));
        }
    }
}
