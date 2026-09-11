package com.sakurasoul.apartment.common;

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
}
