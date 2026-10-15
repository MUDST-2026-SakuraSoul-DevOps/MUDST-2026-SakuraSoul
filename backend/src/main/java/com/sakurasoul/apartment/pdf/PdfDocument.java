package com.sakurasoul.apartment.pdf;

import org.springframework.http.ContentDisposition;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;

/**
 * ไฟล์ PDF หนึ่งไฟล์พร้อมชื่อไฟล์ที่ผู้ใช้จะเห็นตอนกดดาวน์โหลด
 *
 * <p>มีเมธอด {@link #asAttachment()} ติดมาด้วย ทั้งที่เป็นเรื่องของชั้น HTTP เพราะ
 * endpoint ที่ตอบ PDF มีสองที่คนละ package (ใบเสร็จอยู่ billing สัญญาอยู่ lease)
 * ถ้าปล่อยให้แต่ละ controller ประกอบ header เอง วันหนึ่งสองที่จะตั้ง header ไม่เหมือนกัน
 * แล้วเบราว์เซอร์จะเปิดไฟล์หนึ่งในแท็บแต่ดาวน์โหลดอีกไฟล์หนึ่ง โดยไม่มีเทสตัวไหนจับได้
 */
public record PdfDocument(String fileName, byte[] content) {

    /**
     * ตอบเป็นไฟล์แนบ ไม่ใช่เปิดในแท็บ
     * <p>
     * ตั้ง attachment ตามที่สัญญา API เขียนไว้ เพราะปุ่มที่หน้าเว็บกดคือ Download
     * ถ้าเป็น inline เบราว์เซอร์จะเปิด viewer ของตัวเองแทนที่จะบันทึกไฟล์ ซึ่งไม่ใช่
     * สิ่งที่ปุ่มนั้นบอกว่าจะทำ
     */
    public ResponseEntity<byte[]> asAttachment() {
        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_PDF)
                .header(org.springframework.http.HttpHeaders.CONTENT_DISPOSITION,
                        ContentDisposition.attachment().filename(fileName).build().toString())
                .body(content);
    }
}
