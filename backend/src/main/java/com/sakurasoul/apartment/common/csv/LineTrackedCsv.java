package com.sakurasoul.apartment.common.csv;

import org.apache.commons.csv.CSVFormat;
import org.apache.commons.csv.CSVParser;
import org.apache.commons.csv.CSVRecord;

import java.io.IOException;
import java.io.StringReader;
import java.io.UncheckedIOException;
import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;

/**
 * อ่านไฟล์ CSV ที่ผู้ใช้อัปโหลด แล้วบอกว่าแต่ละแถวเริ่มที่บรรทัดไหนของไฟล์ (SSK-166)
 * <p>
 * ข้อความ error รายแถวต้องบอกเลขบรรทัดที่ผู้ใช้เปิดเจอในโปรแกรมตาราง นับหัวตารางเป็นบรรทัด 1 ตรงกับ readCsv
 * ใน frontend/src/domain/meterCsv.ts ซึ่ง commons-csv ไม่ได้ให้มาตรง ๆ คลาสนี้จึงเติมให้
 * <ul>
 *   <li>บรรทัดว่างไม่ถูกตัดทิ้งตั้งแต่ตอน parse (ignoreEmptyLines = false) ไม่งั้นเลขบรรทัดหลังจากนั้นจะเลื่อน
 *       แล้วค่อยข้ามแถวที่ทุกช่องว่างเองตรงนี้ รวมแถวที่มีแต่จุลภาคอย่าง ",,," แบบเดียวกับหน้าเว็บ</li>
 *   <li>เลขบรรทัดของแถว = จำนวนการขึ้นบรรทัดที่อ่านผ่านไปแล้วก่อนเริ่มแถวนั้น + 1 นับรวมการขึ้นบรรทัดในเครื่องหมายคำพูดด้วย
 *       แถวที่มีค่าหลายบรรทัดจึงไม่ทำให้แถวถัดไปเพี้ยน</li>
 *   <li>ตัวอักษรต่อท้ายหลังปิดเครื่องหมายคำพูด (เช่น "ab"c) ต่อเข้าค่านั้นเลย (trailingData) เหมือนหน้าเว็บ
 *       error ของการ parse ที่เหลือจึงมีแบบเดียวคือเครื่องหมายคำพูดที่ไม่ปิดจนจบไฟล์</li>
 * </ul>
 * ไม่ตัดช่องว่างในแต่ละช่องให้ ผู้เรียกตัดเองตามกฎของไฟล์นั้น
 */
public final class LineTrackedCsv {

    /** แถวที่ไม่ว่างหนึ่งแถว line คือบรรทัดที่แถวเริ่มในไฟล์ นับบรรทัดแรกเป็น 1 */
    public record Row(int line, List<String> cells) {
    }

    private static final CSVFormat FORMAT = CSVFormat.RFC4180.builder()
            .setIgnoreEmptyLines(false)
            .setTrailingData(true)
            .get();

    private static final char BYTE_ORDER_MARK = '﻿';

    private LineTrackedCsv() {
    }

    /**
     * ถอดไบต์ของไฟล์เป็นข้อความ UTF-8 แบบเข้มงวด แล้วอ่านเป็นแถว ตัด BOM หน้าไฟล์ทิ้ง (Excel ใส่มาเวลาเซฟเป็น CSV UTF-8)
     * <p>
     * ไฟล์ที่ไม่ใช่ UTF-8 (เช่น เซฟจาก Excel แบบ ANSI ภาษาไทยเป็น TIS-620) ปฏิเสธทั้งไฟล์ ไม่เดาให้
     * ถ้าถอดแบบยอมทุกไบต์ เลขห้องหรือเดือนที่มีตัวอักษรเพี้ยนจะกลายเป็น error รายแถวที่อ่านไม่รู้เรื่อง
     * <p>
     * ปัญหาระดับไฟล์โยน IllegalArgumentException พร้อมข้อความให้ผู้ใช้อ่าน ซึ่ง ApiExceptionHandler แปลงเป็น 400
     */
    public static List<Row> readUtf8(byte[] content) {
        String text = decodeUtf8(content);
        if (!text.isEmpty() && text.charAt(0) == BYTE_ORDER_MARK) {
            text = text.substring(1);
        }
        return read(text);
    }

    /** อ่านข้อความที่ถอดแล้วเป็นแถว ข้ามแถวที่ทุกช่องว่างหรือมีแต่ช่องว่าง */
    public static List<Row> read(String text) {
        List<Row> rows = new ArrayList<>();
        try (CSVParser parser = FORMAT.parse(new StringReader(text))) {
            Iterator<CSVRecord> records = parser.iterator();
            while (true) {
                // ต้องอ่านเลขบรรทัดก่อน hasNext() เพราะ hasNext() อ่านแถวถัดไปล่วงหน้าแล้วนับบรรทัดของแถวนั้นไปด้วย
                long linesBefore = parser.getCurrentLineNumber();
                if (!records.hasNext()) {
                    break;
                }
                List<String> cells = records.next().toList();
                if (cells.stream().anyMatch(cell -> !cell.isBlank())) {
                    rows.add(new Row(Math.toIntExact(linesBefore + 1), cells));
                }
            }
        } catch (IOException | UncheckedIOException ex) {
            throw new IllegalArgumentException("The file has a quote that is never closed. Check the file and try again.");
        }
        return rows;
    }

    private static String decodeUtf8(byte[] content) {
        try {
            return StandardCharsets.UTF_8.newDecoder()
                    .onMalformedInput(CodingErrorAction.REPORT)
                    .onUnmappableCharacter(CodingErrorAction.REPORT)
                    .decode(ByteBuffer.wrap(content))
                    .toString();
        } catch (CharacterCodingException ex) {
            throw new IllegalArgumentException("The file must be UTF-8 text");
        }
    }
}
