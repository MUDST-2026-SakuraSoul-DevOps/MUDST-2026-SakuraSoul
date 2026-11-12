package com.sakurasoul.apartment.common;

import java.math.BigDecimal;
import java.math.RoundingMode;

/**
 * กฎการปัดเงินของทั้งระบบ
 * <p>
 * คอลัมน์เงินทุกตัวเป็น NUMERIC(10,2) ฐานข้อมูลปัดให้เหลือสองตำแหน่งอยู่แล้ว ถ้าโค้ดไม่ปัดเองก่อนตอบกลับ
 * คนที่ส่ง 8.005 มาจะได้ response ว่า 8.005 แต่พอ GET รอบถัดไปกลับได้ 8.01 ซึ่งดูเหมือนระบบแอบเปลี่ยนค่าให้
 * <p>
 * ปัดครึ่งขึ้น (HALF_UP) แบบที่คนไทยคิดเงินกัน ไม่ใช่ปัดแบบธนาคาร (HALF_EVEN) ที่ BigDecimal ใช้บางที่
 * ใบเสร็จต้องตรงกับเครื่องคิดเลขของผู้เช่า
 */
public final class Money {

    /** สองตำแหน่งตาม NUMERIC(10,2) */
    public static final int SCALE = 2;

    private Money() {
    }

    public static BigDecimal round(BigDecimal value) {
        return value.setScale(SCALE, RoundingMode.HALF_UP);
    }
}
