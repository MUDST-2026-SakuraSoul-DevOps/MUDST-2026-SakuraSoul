package com.sakurasoul.apartment.attachment;

/**
 * ที่เก็บตัวไฟล์ (SSK-161) ข้อมูลของไฟล์อยู่ที่ entity Attachment ส่วนไบต์อยู่หลัง interface นี้
 * <p>
 * ตอนนี้เก็บใน PostgreSQL ({@link DatabaseAttachmentStore}) ถ้าวันหนึ่งย้ายไป object storage แก้ที่เดียว
 * ผู้เรียกต้องอยู่ใน transaction เดียวกับการบันทึกข้อมูลของไฟล์ ไฟล์กับข้อมูลของมันจึงไม่มีทางมีอย่างเดียว
 */
public interface AttachmentStore {

    void put(long attachmentId, byte[] content);

    /** ไบต์ของไฟล์ ไม่มีคือบั๊ก เพราะข้อมูลของไฟล์กับไบต์ถูกบันทึกพร้อมกันและลบพร้อมกันเสมอ */
    byte[] get(long attachmentId);
}
