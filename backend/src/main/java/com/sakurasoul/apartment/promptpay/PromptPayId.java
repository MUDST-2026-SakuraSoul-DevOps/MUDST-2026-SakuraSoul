package com.sakurasoul.apartment.promptpay;

import com.sakurasoul.apartment.common.Whitespace;

import java.util.regex.Pattern;

/**
 * ปลายทาง PromptPay หนึ่งเลข คือเบอร์มือถือ 10 หลักที่ขึ้นต้นด้วย 0 หรือเลขประจำตัว 13 หลัก (บัตรประชาชนหรือผู้เสียภาษี) (SSK-168)
 * <p>
 * เลขนี้เป็นข้อมูลส่วนตัวของเจ้าของหอ toString จึงบอกแค่ชนิด และข้อความ error ไม่มีเลขที่ส่งมา
 * log ที่เผลอพิมพ์ object นี้หรือ exception จากการตรวจจึงไม่มีเลขหลุดออกไป
 * <p>
 * รับขีดคั่นได้ (081-234-5678) เพราะคนไทยเขียนเบอร์แบบนั้น แต่ไม่รับเว้นวรรคกลางเลขตามสัญญา API
 * เก็บและตอบกลับเป็นตัวเลขล้วน เพราะเป็นค่าที่เข้า QR ไม่ได้มีไว้ให้คนอ่าน
 * <p>
 * เป็น class ที่ constructor เป็น private ไม่ใช่ record เพราะ record มี constructor สาธารณะอีกทาง
 * ที่สร้างค่าได้โดยไม่ผ่าน {@link #parse(String)}
 */
public final class PromptPayId {

    public static final String INVALID_MESSAGE = "PromptPay ID must be a 10-digit phone number or a 13-digit ID";

    /** [0-9] ไม่ใช่ \d ให้ชัดว่าตัวเลขเต็มความกว้างแบบที่พิมพ์จากแป้นภาษาอื่นไม่ผ่าน */
    private static final Pattern MOBILE_DIGITS = Pattern.compile("0[0-9]{9}");
    private static final Pattern ID_DIGITS = Pattern.compile("[0-9]{13}");

    /** ชนิดของเลข กำหนดช่องย่อยใน tag 29 ของ payload */
    public enum Kind {
        MOBILE("01"),
        /** รวมเลขประจำตัวผู้เสียภาษี 13 หลักด้วย PromptPay ใช้ช่องย่อยเดียวกัน */
        NATIONAL_ID("02");

        private final String subTag;

        Kind(String subTag) {
            this.subTag = subTag;
        }

        public String subTag() {
            return subTag;
        }
    }

    private final Kind kind;
    private final String digits;

    private PromptPayId(Kind kind, String digits) {
        this.kind = kind;
        this.digits = digits;
    }

    /** ตัดช่องว่างหัวท้ายและขีดออกก่อนตรวจ ค่าอื่นที่ไม่ใช่สองรูปแบบนี้ (มีเว้นวรรคกลาง, +66…, ตัวอักษร) ได้ {@link #INVALID_MESSAGE} */
    public static PromptPayId parse(String raw) {
        if (raw == null) {
            throw new IllegalArgumentException(INVALID_MESSAGE);
        }
        String digits = Whitespace.trim(raw).replace("-", "");
        if (MOBILE_DIGITS.matcher(digits).matches()) {
            return new PromptPayId(Kind.MOBILE, digits);
        }
        if (ID_DIGITS.matcher(digits).matches()) {
            return new PromptPayId(Kind.NATIONAL_ID, digits);
        }
        throw new IllegalArgumentException(INVALID_MESSAGE);
    }

    public Kind kind() {
        return kind;
    }

    /** ตัวเลขล้วน ใช้เก็บลงฐานข้อมูลและตอบในช่อง promptPayId เท่านั้น ห้ามต่อลงข้อความ log */
    public String digits() {
        return digits;
    }

    /**
     * เลขปลายทางในรูปที่ payload ต้องการ เบอร์มือถือเปลี่ยน 0 ตัวแรกเป็นรหัสประเทศ 0066 (0812345678 → 0066812345678)
     * เลขประจำตัวใช้ตามเดิม ทั้งสองแบบยาว 13 หลัก
     */
    public String target() {
        return kind == Kind.MOBILE ? "0066" + digits.substring(1) : digits;
    }

    @Override
    public boolean equals(Object other) {
        return other instanceof PromptPayId id && digits.equals(id.digits);
    }

    @Override
    public int hashCode() {
        return digits.hashCode();
    }

    /** บอกแค่ชนิด ไม่บอกเลข */
    @Override
    public String toString() {
        return "PromptPayId[" + kind + "]";
    }
}
