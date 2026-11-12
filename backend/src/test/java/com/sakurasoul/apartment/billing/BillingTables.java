package com.sakurasoul.apartment.billing;

import org.springframework.jdbc.core.simple.JdbcClient;

/**
 * ล้างใบเสร็จกับการชำระทั้งหมดหลังเทสที่ยิงผ่าน API ตามลำดับ foreign key
 * <p>
 * การชำระกับการตัดยอด (V21) อ้างใบเสร็จโดยไม่มี ON DELETE CASCADE และใบเสร็จอ้างกันเองผ่าน carried_to_receipt_id
 * การลบผ่าน repository ทีละแถวจึงพังได้ตามลำดับที่ Hibernate ลบ ส่วนคำสั่งเดียวต่อตารางลบได้เสมอ
 * เพราะ foreign key ของแถวในตารางเดียวกันถูกตรวจตอนจบคำสั่ง
 */
public final class BillingTables {

    private BillingTables() {
    }

    public static void clear(JdbcClient jdbc) {
        jdbc.sql("DELETE FROM payment_allocation").update();
        jdbc.sql("DELETE FROM payment").update();
        jdbc.sql("DELETE FROM receipt_line").update();
        jdbc.sql("DELETE FROM receipt").update();
    }
}
