package com.sakurasoul.apartment.common;

import java.time.LocalDate;
import java.time.YearMonth;
import java.util.regex.Pattern;

/**
 * เดือนในรูป "YYYY-MM" ที่ API กับหน้าเว็บใช้ตรงกันทุกที่ เช่น billingMonth ของใบเสร็จ
 * และ effectiveFrom ของอัตราต่อห้อง (SSK-162)
 * <p>
 * ตรวจรูปแบบด้วย regex เดียวกับ MONTH_PATTERN ฝั่งหน้าเว็บ (frontend/src/domain/roomRate.ts) ก่อนส่งต่อให้
 * YearMonth.parse เพราะ YearMonth.parse ยอมรับรูปที่หน้าเว็บไม่รับ เช่นปีที่มีเครื่องหมายนำหน้า "+12026-01"
 * ต่างกันข้อเดียวคือฝั่งนี้ตัดช่องว่างหัวท้ายก่อนตรวจ (กฎเดิมของ billingMonth ใบเสร็จ) " 2026-11 " จึงผ่าน
 * ส่วนหน้าเว็บส่งค่าจาก input type="month" ที่ไม่มีช่องว่างอยู่แล้ว
 * <p>
 * ข้อความ error เป็นของผู้เรียก เพราะแต่ละ endpoint ตกลงข้อความ 400 ของตัวเองไว้ในสัญญา API คนละประโยค
 */
public final class Months {

    private static final Pattern YEAR_MONTH = Pattern.compile("\\d{4}-(0[1-9]|1[0-2])");

    private Months() {
    }

    /** เป็นเดือนรูปแบบ "YYYY-MM" หรือเปล่า ใช้ในคลาสกฎที่คืนข้อความแทนการโยน exception */
    public static boolean isValid(String text) {
        return text != null && YEAR_MONTH.matcher(text.trim()).matches();
    }

    /**
     * แปลง "YYYY-MM" เป็นเดือน ช่องว่างหัวท้ายตัดทิ้งก่อน รูปแบบผิดหรือไม่ส่งมาโยน IllegalArgumentException
     * พร้อมข้อความที่ส่งมา ซึ่ง ApiExceptionHandler แปลงเป็น 400
     */
    public static YearMonth parse(String text, String message) {
        if (!isValid(text)) {
            throw new IllegalArgumentException(message);
        }
        return YearMonth.parse(text.trim());
    }

    /** เดือนของวันที่นั้นในรูป "YYYY-MM" ใช้กับคอลัมน์ที่เก็บเดือนเป็นวันที่ 1 */
    public static String format(LocalDate dayInMonth) {
        return YearMonth.from(dayInMonth).toString();
    }
}
