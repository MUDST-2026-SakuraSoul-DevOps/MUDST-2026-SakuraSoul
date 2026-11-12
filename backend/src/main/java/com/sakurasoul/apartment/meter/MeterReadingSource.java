package com.sakurasoul.apartment.meter;

/** ที่มาของค่ามิเตอร์ ชื่อค่าคือสิ่งที่หน้าเว็บเห็นใน JSON (MeterReading.source ใน frontend/src/api/types.ts) */
public enum MeterReadingSource {

    /** นำเข้าจากไฟล์ CSV (SSK-166) ทางเดียวที่เขียนตารางนี้ตอนนี้ */
    CSV,

    /** กรอกทีละห้อง มีในสัญญา API แต่ยังไม่มี endpoint ไหนเขียนค่านี้ */
    MANUAL
}
