package com.sakurasoul.apartment.common;

/**
 * ตัดช่องว่างหัวท้ายชุดเดียวกับ String.prototype.trim ของ JavaScript
 * <p>
 * ข้อมูลที่แอดมินก๊อปจาก Excel หรือจากหน้าเว็บมักมี NBSP (U+00A0) ติดมา String.trim() ของ Java ตัดแค่ตัวอักษร
 * ที่รหัสไม่เกิน U+0020 ส่วน String.strip() ก็ไม่ตัด NBSP เพราะ Character.isWhitespace ไม่นับมันเป็นช่องว่าง
 * ถ้าใช้สองตัวนั้น ไฟล์เดียวกันจะผ่านการตรวจของหน้าเว็บแต่ฝั่งนี้ได้ "Unit 101 does not exist" ทั้งที่เลขห้องบนจอดูถูกทุกตัว
 * <p>
 * ชุดที่ตัดตาม ECMAScript: TAB, VT, FF, BOM (U+FEFF), ทุกตัวในหมวด Zs (ช่องว่างทุกแบบรวม NBSP)
 * และตัวขึ้นบรรทัด (LF, CR, U+2028, U+2029) ช่องว่างกลางข้อความไม่ถูกแตะ
 */
public final class Whitespace {

    private Whitespace() {
    }

    public static String trim(String text) {
        int start = 0;
        int end = text.length();
        while (start < end && isJavaScriptWhitespace(text.charAt(start))) {
            start++;
        }
        while (end > start && isJavaScriptWhitespace(text.charAt(end - 1))) {
            end--;
        }
        return text.substring(start, end);
    }

    private static boolean isJavaScriptWhitespace(char c) {
        return c == '\t' || c == '\n' || c == '\u000B' || c == '\f' || c == '\r'
                || c == '﻿' || c == ' ' || c == ' '
                || Character.getType(c) == Character.SPACE_SEPARATOR;
    }
}
