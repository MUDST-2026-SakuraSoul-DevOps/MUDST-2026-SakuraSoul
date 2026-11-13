package com.sakurasoul.apartment.promptpay;

import com.sakurasoul.apartment.common.Money;

import java.math.BigDecimal;

/**
 * ข้อความใน QR ของ PromptPay ตามมาตรฐาน Thai QR Payment (EMV QR แบบร้านค้าแสดง) พร้อมจำนวนเงิน (SSK-168)
 * <p>
 * ลำดับช่องตายตัว และตรงกับตัวอย่างในสัญญา API กับ generatePromptPayPayload ของหน้าเว็บทุกไบต์
 * <pre>
 * 00 รุ่นของรูปแบบ           01
 * 01 ชนิด QR                12 (มีจำนวนเงิน ใช้ได้ครั้งเดียวต่อยอด ฝั่งนี้ไม่ออก QR แบบไม่มียอด)
 * 29 ผู้รับ                   00 = A000000677010111 (PromptPay) แล้ว 01 = เบอร์มือถือ หรือ 02 = เลขประจำตัว
 * 53 สกุลเงิน                764 (บาท)
 * 54 จำนวนเงิน               ทศนิยมสองตำแหน่ง ใช้จุด ไม่มีจุลภาค เช่น 3000.00
 * 58 ประเทศ                 TH
 * 63 CRC                    CRC-16/CCITT-FALSE ของทุกตัวอักษรก่อนหน้า รวม "6304" ด้วย
 * </pre>
 * สร้างในเครื่องทั้งหมด ไม่เรียกบริการภายนอก ตามข้อกำหนดของวิชา
 */
public final class PromptPayPayload {

    static final String AMOUNT_MESSAGE = "QR amount must be greater than 0";
    static final String TOO_LARGE_MESSAGE = "QR amount must be at most 99999999.99";

    /** ใบเสร็จเก็บเงินเป็น NUMERIC(10,2) ยอดที่มาจากใบจึงไม่เกินค่านี้ */
    private static final BigDecimal MAX_AMOUNT = new BigDecimal("99999999.99");

    private static final String PROMPTPAY_AID = "A000000677010111";

    private PromptPayPayload() {
    }

    /**
     * ยอดต้องมากกว่า 0 ผู้เรียกขอเฉพาะใบที่ยังมียอดต้องจ่าย ยอดที่ผิดจึงเป็นบั๊กของโค้ด
     * ข้อความ error เป็นค่าคงที่ ไม่มีเลข PromptPay
     */
    public static String of(PromptPayId id, BigDecimal amount) {
        if (amount == null || Money.round(amount).signum() <= 0) {
            throw new IllegalArgumentException(AMOUNT_MESSAGE);
        }
        if (Money.round(amount).compareTo(MAX_AMOUNT) > 0) {
            throw new IllegalArgumentException(TOO_LARGE_MESSAGE);
        }
        String withoutCrc = tlv("00", "01")
                + tlv("01", "12")
                + tlv("29", tlv("00", PROMPTPAY_AID) + tlv(id.kind().subTag(), id.target()))
                + tlv("53", "764")
                + tlv("54", amountText(amount))
                + tlv("58", "TH")
                + "6304";
        return withoutCrc + Crc16Ccitt.hex(withoutCrc);
    }

    /** สองตำแหน่งเสมอ ไม่มีจุลภาคและไม่เป็นรูปวิทยาศาสตร์ BigDecimal ที่สร้างจาก "3E+3" ก็ได้ 3000.00 */
    static String amountText(BigDecimal amount) {
        return Money.round(amount).toPlainString();
    }

    /** ช่องหนึ่งช่อง: เลขช่องสองหลัก ความยาวสองหลัก แล้วตามด้วยค่า */
    static String tlv(String tag, String value) {
        if (value.length() > 99) {
            throw new IllegalArgumentException("A QR field holds at most 99 characters");
        }
        return tag + String.format("%02d", value.length()) + value;
    }
}
