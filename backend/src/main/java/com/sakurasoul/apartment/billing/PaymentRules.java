package com.sakurasoul.apartment.billing;

import com.sakurasoul.apartment.billing.PaymentDtos.RecordPaymentRequest;
import com.sakurasoul.apartment.common.Money;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.regex.Pattern;

/**
 * ตรวจและแปลงค่าในคำขอรับชำระ (SSK-163) ลำดับและข้อความตามตาราง error ของ POST /api/receipts/{id}/payments ในสัญญา API
 * คือ amount, method, paidOn, reference, note ตามลำดับ ช่องแรกที่ผิดได้ 400
 * <p>
 * ยอดที่เกินยอดต้องจ่ายไม่ได้ตรวจที่นี่ เพราะต้องรู้บัญชีของสัญญา และสัญญาให้ตรวจเป็นข้อสุดท้าย (ดู PaymentService)
 * ความยาวนับเป็นตัวอักษรแบบเดียวกับ VARCHAR ของ PostgreSQL ไม่ใช่หน่วยของ String ใน Java
 */
final class PaymentRules {

    static final String AMOUNT_MESSAGE = "Amount must be greater than 0";
    static final String METHOD_MESSAGE = "Payment method must be CASH, TRANSFER, QR or OTHER";
    static final String DATE_FORMAT_MESSAGE = "The payment date must be in YYYY-MM-DD format";
    static final String FUTURE_DATE_MESSAGE = "The payment date cannot be in the future";
    static final String REFERENCE_MESSAGE = "The reference must be 100 characters or fewer";
    static final String NOTE_MESSAGE = "The note must be 500 characters or fewer";
    static final String PAY_TEXT_MESSAGE = "The payment method must be 50 characters or fewer";

    /** payment.reference VARCHAR(100) ใน V21 */
    private static final int MAX_REFERENCE = 100;
    /** payment.note VARCHAR(500) ใน V21 */
    private static final int MAX_NOTE = 500;
    /** receipt.payment_method VARCHAR(50) ใน V9 ข้อความของ /pay แบบเดิมไปอยู่ที่นั่นเมื่อใบถูกตัดครบ */
    private static final int MAX_PAY_TEXT = 50;

    /** LocalDate.parse รับปีที่มีเครื่องหมายบวกหรือเกินสี่หลักด้วย สัญญากำหนดรูปแบบเดียว */
    private static final Pattern ISO_DATE = Pattern.compile("\\d{4}-\\d{2}-\\d{2}");

    private PaymentRules() {
    }

    /** ค่าที่ผ่านการตรวจแล้ว ยอดปัดสองตำแหน่ง ข้อความตัดช่องว่างหัวท้าย ว่างล้วนเป็น null */
    record Valid(BigDecimal amount, LocalDate paidOn, PaymentMethod method, String reference, String note) {
    }

    /**
     * @param today วันนี้ตามเวลาไทย paidOn ที่ไม่ส่งมาคือวันนี้ และห้ามหลังวันนี้
     * @throws IllegalArgumentException ข้อความของช่องแรกที่ผิด
     */
    static Valid check(RecordPaymentRequest request, LocalDate today) {
        // ปัดก่อนตรวจตามสัญญา 0.004 จึงเป็น 0.00 และไม่ผ่าน
        BigDecimal amount = request.amount() == null ? null : Money.round(request.amount());
        if (amount == null || amount.signum() <= 0) {
            throw new IllegalArgumentException(AMOUNT_MESSAGE);
        }
        PaymentMethod method = method(request.method());
        LocalDate paidOn = paidOn(request.paidOn(), today);
        String reference = limited(request.reference(), MAX_REFERENCE, REFERENCE_MESSAGE);
        String note = limited(request.note(), MAX_NOTE, NOTE_MESSAGE);
        return new Valid(amount, paidOn, method, reference, note);
    }

    /**
     * ข้อความช่องทางที่ส่งมากับ POST /api/receipts/{id}/pay แบบเดิม ตัดช่องว่าง ว่างล้วนเป็น null
     * ข้อความนี้ไปอยู่ใน payment_method ของใบที่ถูกตัดครบ จึงยาวได้ไม่เกินช่องนั้น
     */
    static String payInFullText(String text) {
        return limited(text, MAX_PAY_TEXT, PAY_TEXT_MESSAGE);
    }

    /** ตัวพิมพ์ต้องตรง แบบเดียวกับตัวกรอง status ของใบเสร็จ */
    private static PaymentMethod method(String text) {
        if (text == null || text.isBlank()) {
            throw new IllegalArgumentException(METHOD_MESSAGE);
        }
        try {
            return PaymentMethod.valueOf(text.strip());
        } catch (IllegalArgumentException unknown) {
            throw new IllegalArgumentException(METHOD_MESSAGE, unknown);
        }
    }

    private static LocalDate paidOn(String text, LocalDate today) {
        if (text == null || text.isBlank()) {
            return today;
        }
        String trimmed = text.strip();
        LocalDate paidOn;
        try {
            if (!ISO_DATE.matcher(trimmed).matches()) {
                throw new IllegalArgumentException(DATE_FORMAT_MESSAGE);
            }
            // ISO_LOCAL_DATE แบบเคร่ง วันที่ไม่มีจริงอย่าง 2026-02-30 ถือว่าผิดรูปแบบ
            paidOn = LocalDate.parse(trimmed);
        } catch (DateTimeParseException notADate) {
            throw new IllegalArgumentException(DATE_FORMAT_MESSAGE, notADate);
        }
        if (paidOn.isAfter(today)) {
            throw new IllegalArgumentException(FUTURE_DATE_MESSAGE);
        }
        return paidOn;
    }

    private static String limited(String text, int maxCharacters, String message) {
        if (text == null || text.isBlank()) {
            return null;
        }
        String trimmed = text.strip();
        if (trimmed.codePointCount(0, trimmed.length()) > maxCharacters) {
            throw new IllegalArgumentException(message);
        }
        return trimmed;
    }
}
