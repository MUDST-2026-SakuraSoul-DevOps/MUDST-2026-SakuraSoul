package com.sakurasoul.apartment.common;

/** เนื้อไฟล์ไม่ใช่ชนิดที่ endpoint นั้นรับ ตอบ 415 พร้อมข้อความนี้ (ApiExceptionHandler) */
public class UnsupportedFileTypeException extends RuntimeException {

    public UnsupportedFileTypeException(String message) {
        super(message);
    }
}
