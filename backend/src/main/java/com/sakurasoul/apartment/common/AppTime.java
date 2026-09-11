package com.sakurasoul.apartment.common;

import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;

/**
 * "วันนี้" ของระบบนี้คือวันนี้ตามเวลาไทย ไม่ใช่ UTC
 * <p>
 * ถ้าใช้ UTC แล้วมีคนกดสร้างสัญญาตอนตีหนึ่ง วันที่จะเพี้ยนไปหนึ่งวันจริง ๆ ซึ่งกระทบ
 * การตัดสินว่าห้องมีคนอยู่วันนี้ไหม และกระทบการตรวจสัญญาทับกันด้วย
 * ฝั่งหน้าเว็บมีตัวเดียวกันชื่อ todayInBangkok() ใน frontend/src/format.ts
 */
public final class AppTime {

    private static final ZoneId BANGKOK = ZoneId.of("Asia/Bangkok");

    private AppTime() {
    }

    public static LocalDate today() {
        return LocalDate.now(BANGKOK);
    }

    /**
     * นาฬิกาเวลาไทยตัวเดียวกับที่ {@link #today()} ใช้ เปิดไว้ให้ประกอบเป็น bean
     * <p>
     * งานของ CR-05 (แจ้งเตือนตามรอบ, เวลาปิดงานซ่อม) ต้องเขียนเทสที่ตรึง "วันนี้" ไว้ให้ได้
     * เช่น พิสูจน์ว่า 31 ม.ค. บวกหนึ่งเดือนได้ 28 ก.พ. ซึ่งทำไม่ได้ถ้าโค้ดเรียกเมธอด static
     * ตรง ๆ ทุกจุด คลาสที่ต้องการแบบนั้นจึงรับ java.time.Clock เข้าทาง constructor แทน
     * แล้วให้ MaintenanceSchedulingConfig ประกอบ bean จากตัวนี้ (ดูคอมเมนต์ที่นั่น)
     * <p>
     * เพิ่มเมธอดใหม่ ไม่ได้แก้ของเดิม โค้ดที่เรียก AppTime.today() อยู่แล้วทั้งหมด
     * ทำงานเหมือนเดิมทุกอย่าง
     */
    public static Clock clock() {
        return Clock.system(BANGKOK);
    }
}
