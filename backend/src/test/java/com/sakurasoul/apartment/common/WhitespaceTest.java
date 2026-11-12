package com.sakurasoul.apartment.common;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/** ตัดช่องว่างชุดเดียวกับ trim ของ JavaScript (ไฟล์ CSV ที่ก๊อปมาจาก Excel หรือหน้าเว็บ) */
class WhitespaceTest {

    @Test
    @DisplayName("ตัด NBSP, BOM, tab, ขึ้นบรรทัด และช่องว่างแบบอื่นในหมวด Zs หัวท้าย ช่องว่างกลางข้อความไม่ถูกแตะ")
    void trimsTheSameSetAsJavaScript() {
        assertThat(Whitespace.trim(" 101 ")).isEqualTo("101");
        assertThat(Whitespace.trim("﻿2026-11\r\n")).isEqualTo("2026-11");
        assertThat(Whitespace.trim("\t  98.5 　")).isEqualTo("98.5");
        assertThat(Whitespace.trim("Room 101")).isEqualTo("Room 101");
        assertThat(Whitespace.trim("   ")).isEmpty();
        assertThat(Whitespace.trim("")).isEmpty();
        // String.trim() ของ Java ไม่ตัด NBSP นี่คือเหตุผลที่ต้องมีคลาสนี้
        assertThat("101 ".trim()).isEqualTo("101 ");
    }

    /** String.strip() ตัดตัวคั่นข้อมูลด้วยเพราะ Character.isWhitespace นับ แต่ JavaScript ไม่ตัด สองฝั่งจึงต้องเห็นเหมือนกัน */
    @Test
    @DisplayName("ตัวคั่นข้อมูล U+001C ถึง U+001F ไม่ใช่ช่องว่างของ JavaScript จึงไม่ถูกตัด")
    void informationSeparatorsAreKept() {
        assertThat(Whitespace.trim("\u001C101\u001F")).isEqualTo("\u001C101\u001F");
    }
}
