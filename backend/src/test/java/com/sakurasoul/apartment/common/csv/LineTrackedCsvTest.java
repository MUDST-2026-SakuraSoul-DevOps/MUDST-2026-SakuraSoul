package com.sakurasoul.apartment.common.csv;

import com.sakurasoul.apartment.common.csv.LineTrackedCsv.Row;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * เลขบรรทัดต้องตรงกับที่ผู้ใช้เปิดเจอในโปรแกรมตาราง และกับ readCsv ฝั่งหน้าเว็บ (frontend/src/domain/meterCsv.ts)
 * ทุกเคสเทียบผลกับสิ่งที่ readCsv ตอบสำหรับข้อความเดียวกัน
 */
class LineTrackedCsvTest {

    @Test
    @DisplayName("นับหัวตารางเป็นบรรทัด 1 ขึ้นบรรทัดแบบ LF, CRLF และ CR นับเหมือนกัน")
    void linesAreCountedFromOneForEveryLineEnding() {
        List<Row> expected = List.of(
                new Row(1, List.of("h1", "h2")), new Row(2, List.of("a", "b")), new Row(3, List.of("c", "d")));

        assertThat(LineTrackedCsv.read("h1,h2\na,b\nc,d")).isEqualTo(expected);
        assertThat(LineTrackedCsv.read("h1,h2\r\na,b\r\nc,d\r\n")).isEqualTo(expected);
        assertThat(LineTrackedCsv.read("h1,h2\ra,b\rc,d\r")).isEqualTo(expected);
    }

    @Test
    @DisplayName("บรรทัดว่าง บรรทัดที่มีแต่ช่องว่าง และบรรทัดที่มีแต่จุลภาคถูกข้าม แต่ยังนับเลขบรรทัด")
    void blankLinesAreSkippedButStillCounted() {
        assertThat(LineTrackedCsv.read("h1,h2\n\n   \n,,,\nc,d\n\n"))
                .containsExactly(new Row(1, List.of("h1", "h2")), new Row(5, List.of("c", "d")));
    }

    @Test
    @DisplayName("ค่าในเครื่องหมายคำพูดมีจุลภาค เครื่องหมายคำพูดซ้อน และช่องว่างได้ ช่องว่างรอบค่าที่ไม่มีเครื่องหมายคำพูดถูกตัด")
    void quotedValuesKeepCommasQuotesAndSpaces() {
        assertThat(LineTrackedCsv.read("\"Room, 101\",\"say \"\"hi\"\"\",\" padded \", spaced "))
                .containsExactly(new Row(1, List.of("Room, 101", "say \"hi\"", " padded ", "spaced")));
    }

    /** ไฟล์ที่แก้มือมักมีช่องว่างหลังจุลภาค หน้าเว็บเปิดเครื่องหมายคำพูดได้ทุกตำแหน่งจึงอ่านค่านี้ได้ ฝั่งนี้ต้องอ่านได้เหมือนกัน */
    @Test
    @DisplayName("ช่องว่างก่อนเปิดเครื่องหมายคำพูดไม่ทำให้เครื่องหมายคำพูดกลายเป็นตัวอักษร จุลภาคข้างในไม่แบ่งช่อง")
    void spacesBeforeAnOpeningQuoteAreSkipped() {
        assertThat(LineTrackedCsv.read("101, \"2026,11\",1"))
                .containsExactly(new Row(1, List.of("101", "2026,11", "1")));
    }

    @Test
    @DisplayName("ขึ้นบรรทัดใหม่ในเครื่องหมายคำพูดกินหลายบรรทัด แถวถัดไปได้เลขบรรทัดจริงของไฟล์")
    void multiLineValuesShiftTheFollowingLines() {
        assertThat(LineTrackedCsv.read("h\n\"multi\nline\",x\nnext,y"))
                .containsExactly(
                        new Row(1, List.of("h")),
                        new Row(2, List.of("multi\nline", "x")),
                        new Row(4, List.of("next", "y")));
    }

    @Test
    @DisplayName("ตัวอักษรหลังปิดเครื่องหมายคำพูดต่อเข้าค่านั้น ไม่ใช่ error เหมือนหน้าเว็บ")
    void trailingCharactersAfterAClosingQuoteAreKept() {
        assertThat(LineTrackedCsv.read("\"ab\"c,d")).containsExactly(new Row(1, List.of("abc", "d")));
    }

    @Test
    @DisplayName("เครื่องหมายคำพูดที่ไม่ปิดจนจบไฟล์ได้ข้อความเดียวกับหน้าเว็บ")
    void anUnclosedQuoteIsRejected() {
        assertThatThrownBy(() -> LineTrackedCsv.read("h1,h2\n101,\"2026-11\n102,2026-11"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("The file has a quote that is never closed. Check the file and try again.");
    }

    @Test
    @DisplayName("ไฟล์ UTF-8 ที่มี BOM จาก Excel อ่านได้ BOM ไม่ติดไปกับช่องแรก ภาษาไทยอ่านได้")
    void utf8WithByteOrderMarkIsRead() {
        byte[] content = "﻿ห้อง,เดือน\n101,2026-11".getBytes(StandardCharsets.UTF_8);

        assertThat(LineTrackedCsv.readUtf8(content))
                .containsExactly(new Row(1, List.of("ห้อง", "เดือน")), new Row(2, List.of("101", "2026-11")));
    }

    @Test
    @DisplayName("ไฟล์ที่ไม่ใช่ UTF-8 เช่นภาษาไทยที่เซฟเป็น TIS-620 ถูกปฏิเสธทั้งไฟล์ ไม่เดาตัวอักษร")
    void nonUtf8TextIsRejected() {
        byte[] tis620 = "ห้อง,เดือน\n101,2026-11".getBytes(Charset.forName("TIS-620"));

        assertThatThrownBy(() -> LineTrackedCsv.readUtf8(tis620))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("The file must be UTF-8 text");
    }

    @Test
    @DisplayName("ไฟล์ว่างหรือมีแต่บรรทัดว่างได้รายการเปล่า")
    void emptyFilesHaveNoRows() {
        assertThat(LineTrackedCsv.readUtf8(new byte[0])).isEmpty();
        assertThat(LineTrackedCsv.read("\n\n \n")).isEmpty();
    }
}
