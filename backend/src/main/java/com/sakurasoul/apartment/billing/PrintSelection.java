package com.sakurasoul.apartment.billing;

import com.sakurasoul.apartment.billing.ReceiptDtos.PrintReceiptsRequest;
import com.sakurasoul.apartment.common.Months;

import java.time.YearMonth;
import java.util.Collection;
import java.util.List;
import java.util.Objects;
import java.util.stream.Collectors;

/**
 * คำขอพิมพ์รวมที่ตรวจรูปแบบแล้ว (SSK-169) ยังไม่ได้อ่านฐานข้อมูล ข้อความตามตาราง error ในสัญญา API
 * <p>
 * มีได้แบบเดียวจากสองแบบ เลือกใบเอง (receiptIds) หรือทั้งเดือน (month และ status ถ้ามี) ลำดับการตรวจ
 * <ol>
 *   <li>ไม่ส่งมาเลยหรือส่งทั้งสองแบบ: {@link #CHOOSE_ONE} รายการว่างหรือมีแต่ null ถือว่าไม่ได้ส่ง</li>
 *   <li>เลือกใบเองเกิน 100 ใบ (นับหลังตัด id ซ้ำ): {@link #TOO_MANY}</li>
 *   <li>แบบทั้งเดือน status ก่อน แล้วค่อย month ลำดับเดียวกับ GET /api/receipts</li>
 * </ol>
 * status ที่ส่งมากับ receiptIds ไม่ถูกอ่านและไม่ถูกตรวจ ใบที่เลือกเองคือสิ่งที่ผู้ใช้ต้องการพิมพ์
 * หน้าเว็บที่ส่งค่าตัวกรองติดมาทุกครั้งจะได้ไม่โดน 400 เพราะค่าตัวกรอง
 *
 * @param receiptIds id ที่ไม่ซ้ำและไม่มี null ตามลำดับที่ส่งมา ว่างในแบบทั้งเดือน
 * @param month      null ในแบบเลือกใบเอง
 * @param status     null คือทุกสถานะ ใช้เฉพาะแบบทั้งเดือน
 */
record PrintSelection(List<Long> receiptIds, YearMonth month, ReceiptStatus status) {

    static final int MAX_RECEIPTS = 100;
    static final String CHOOSE_ONE = "Choose either receipts or a month to print";
    static final String TOO_MANY = "Choose at most 100 receipts";
    static final String MONTH_FORMAT = "The billing month must be in YYYY-MM format";

    /** request เป็น null ได้ คือ POST ที่ไม่มี body */
    static PrintSelection of(PrintReceiptsRequest request) {
        List<Long> ids = request == null || request.receiptIds() == null ? List.of()
                : request.receiptIds().stream().filter(Objects::nonNull).distinct().toList();
        boolean hasMonth = request != null && request.month() != null && !request.month().isBlank();
        if (!ids.isEmpty() == hasMonth) {
            throw new IllegalArgumentException(CHOOSE_ONE);
        }
        if (!ids.isEmpty()) {
            if (ids.size() > MAX_RECEIPTS) {
                throw new IllegalArgumentException(TOO_MANY);
            }
            return new PrintSelection(ids, null, null);
        }
        ReceiptStatus status = ReceiptStatus.parseFilter(request.status());
        return new PrintSelection(List.of(), Months.parse(request.month(), MONTH_FORMAT), status);
    }

    boolean byIds() {
        return month == null;
    }

    /** ชื่อไฟล์ตามสัญญา receipts.pdf สำหรับใบที่เลือกเอง หรือ receipts-2026-11.pdf สำหรับทั้งเดือน */
    String fileName() {
        return byIds() ? "receipts.pdf" : "receipts-" + month + ".pdf";
    }

    /** "Receipts not found: 12, 15" บอกทุก id ที่หาไม่เจอ เรียงตามตัวเลข ไม่ใช่แค่ตัวแรก */
    static String notFoundMessage(Collection<Long> missing) {
        return "Receipts not found: " + missing.stream().sorted().map(String::valueOf).collect(Collectors.joining(", "));
    }

    static String noneMessage(YearMonth month) {
        return "No receipts to print for " + month;
    }
}
