package com.sakurasoul.apartment.common.csv;

import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;

import java.nio.charset.StandardCharsets;

/**
 * ไฟล์ CSV หนึ่งไฟล์พร้อมชื่อที่ผู้ใช้เห็นตอนดาวน์โหลด (SSK-170) คู่กับ pdf.PdfDocument
 */
public record CsvFile(String fileName, byte[] content) {

    private static final MediaType TEXT_CSV_UTF8 = new MediaType("text", "csv", StandardCharsets.UTF_8);

    /**
     * ตอบเป็นไฟล์แนบ
     * <p>
     * ตั้ง Content-Type ไว้ในคำตอบเอง endpoint ที่ใช้จึงไม่ต้องประกาศ produces ถ้าประกาศ คำขอจาก fetch ของหน้าเว็บ
     * ซึ่งส่ง Accept: application/json ทุกครั้ง (send ใน client.ts) จะได้ 406 แม้แต่ตอนที่ควรได้ 400 พร้อมข้อความ
     * ดูเรื่องเดียวกันที่ ReceiptController.print (SSK-169)
     */
    public ResponseEntity<byte[]> asAttachment() {
        return ResponseEntity.ok()
                .contentType(TEXT_CSV_UTF8)
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        ContentDisposition.attachment().filename(fileName).build().toString())
                .body(content);
    }
}
