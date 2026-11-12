package com.sakurasoul.apartment.common;

/** ไฟล์ใหญ่เกินเพดานของ endpoint นั้น ตอบ 413 พร้อมข้อความนี้ (ApiExceptionHandler) */
public class FileTooLargeException extends RuntimeException {

    public FileTooLargeException(String message) {
        super(message);
    }
}
