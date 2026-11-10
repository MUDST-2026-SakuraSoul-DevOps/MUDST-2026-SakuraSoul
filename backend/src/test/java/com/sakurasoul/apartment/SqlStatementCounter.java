package com.sakurasoul.apartment;

import org.hibernate.resource.jdbc.spi.StatementInspector;

import java.util.concurrent.Callable;

/**
 * นับคำสั่ง SQL ที่ Hibernate ส่งออกไประหว่างงานหนึ่งชิ้นของเทส ใช้เขียนเทสกัน N+1
 * <p>
 * นับเฉพาะ thread ที่เรียก {@link #count} ไม่ใช้ statistics ของ Hibernate เพราะ statistics นับรวมทั้ง session factory
 * ซึ่งรวม BillingScheduler ที่ตื่นทุกต้นนาทีและอ่านฐานข้อมูลทุกครั้ง tick ที่ตกในช่วงที่วัดจะทำให้ตัวเลขเกินมาเป็นครั้งคราว
 * MockMvc รัน controller ใน thread เดียวกับเทส คำขอหนึ่งครั้งจึงนับได้ครบโดยไม่ปนกับงานเบื้องหลัง
 * <p>
 * ลงทะเบียนกับ Hibernate ใน {@link TestcontainersConfiguration} ตอนไม่มีใครนับ ตัวนี้แค่คืน SQL เดิมกลับไป
 */
public final class SqlStatementCounter implements StatementInspector {

    static final SqlStatementCounter INSTANCE = new SqlStatementCounter();

    private static final ThreadLocal<int[]> COUNT = new ThreadLocal<>();

    private SqlStatementCounter() {
    }

    /** จำนวนคำสั่ง SQL ที่ Hibernate ส่งจาก thread นี้ระหว่างที่ action ทำงาน */
    public static int count(Callable<?> action) throws Exception {
        int[] count = {0};
        COUNT.set(count);
        try {
            action.call();
        } finally {
            COUNT.remove();
        }
        return count[0];
    }

    @Override
    public String inspect(String sql) {
        int[] count = COUNT.get();
        if (count != null) {
            count[0]++;
        }
        return sql;
    }
}
