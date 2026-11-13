package com.sakurasoul.apartment.common;

/**
 * ช่องว่างชุดเดียวกับ JavaScript: ตัดหัวท้ายแบบ String.prototype.trim และยุบช่องว่างซ้ำแบบ /\s+/g
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

    /**
     * ยุบช่องว่างที่ติดกันหลายตัวให้เหลือช่องว่างธรรมดาตัวเดียว ได้ผลเดียวกับ {@code text.replace(/\s+/g, ' ')} ของ JavaScript
     * <p>
     * ใช้คู่กับ trim เมื่อต้องเทียบข้อความให้ได้ผลเดียวกับหน้าเว็บทุกตัวอักษร เช่นการค้นชื่อผู้เช่า (SSK-174)
     * ถ้าใช้ {@code replaceAll("\\s+", " ")} ของ Java ชื่อที่มี NBSP คั่นจะค้นเจอบนหน้าเว็บแต่ไม่เจอที่นี่
     * เพราะ \s ของ Java ไม่นับ NBSP กับช่องว่างแบบอื่นในหมวด Zs ส่วน \s ของ JavaScript เป็นชุดเดียวกับที่ trim ตัด
     * จึงใช้ตัวตรวจตัวเดียวกัน
     */
    public static String collapse(String text) {
        StringBuilder out = new StringBuilder(text.length());
        boolean inRun = false;
        for (int i = 0; i < text.length(); i++) {
            char c = text.charAt(i);
            if (isJavaScriptWhitespace(c)) {
                if (!inRun) {
                    out.append(' ');
                    inRun = true;
                }
            } else {
                out.append(c);
                inRun = false;
            }
        }
        return out.toString();
    }

    private static boolean isJavaScriptWhitespace(char c) {
        return c == '\t' || c == '\n' || c == '\u000B' || c == '\f' || c == '\r'
                || c == '﻿' || c == ' ' || c == ' '
                || Character.getType(c) == Character.SPACE_SEPARATOR;
    }
}
