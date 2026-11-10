package com.sakurasoul.apartment.maintenance;

import jakarta.mail.internet.AddressException;
import jakarta.mail.internet.InternetAddress;
import org.springframework.boot.context.properties.ConfigurationProperties;

import java.util.List;

/**
 * ค่าของงานแจ้งเตือนของใกล้หมด (SSK-171) ผูกกับ app.supplies ใน application.yml ซึ่งอ่านจาก environment อีกที
 * <ul>
 *   <li>{@code lowStockAlertTo} ผู้รับ จาก APP_LOW_STOCK_ALERT_TO หลายคนคั่นด้วยจุลภาค</li>
 *   <li>{@code lowStockAlertCron} เวลาที่ตรวจ จาก APP_LOW_STOCK_ALERT_CRON เป็น cron ของ Spring ตามเวลาไทย
 *       ตั้งเป็น - เพื่อปิดงานนี้ (LowStockAlertScheduler)</li>
 * </ul>
 * ผู้รับอยู่ใน environment ไม่ใช่ apartment_config เพราะ PUT /api/apartment-config แทนค่าทั้งแถว ฟอร์มอัตราเดิมที่ไม่รู้จัก
 * ช่องนี้จะลบผู้รับทิ้งทุกครั้งที่กดบันทึก หน้าตั้งค่าผู้รับยังไม่ได้ตกลงกัน (docs/api-contract-maintenance.md)
 * <p>
 * ไม่ตั้งหรือตั้งเป็นค่าว่างได้ค่าตั้งต้นทั้งสองช่อง (หลักเดียวกับ AppMailProperties) เพราะ placeholder ของ Spring
 * ใช้ค่าตั้งต้นเฉพาะตอนไม่ได้ตั้งตัวแปร ตั้งเป็นค่าว่างแล้ว cron ว่างจะทำให้แอปสตาร์ตไม่ขึ้น
 * ส่วนที่อยู่ที่ผิดรูปแบบทำให้แอปสตาร์ตไม่ขึ้นพร้อมข้อความที่บอกตรง ๆ ดีกว่าปล่อยให้ส่งไม่ออกเงียบ ๆ ทุกเช้า
 * อีเมลทุกฉบับค้างอยู่ใน Mailpit ไม่ออกนอกเครื่องอยู่แล้ว
 */
@ConfigurationProperties(prefix = "app.supplies")
public record LowStockAlertProperties(List<String> lowStockAlertTo, String lowStockAlertCron) {

    static final String DEFAULT_RECIPIENT = "admin@sakura-soul.local";

    /** แปดโมงเช้าทุกวันตามเวลาไทย เวลาเดียวกับ ReminderScheduler */
    static final String DEFAULT_CRON = "0 0 8 * * *";

    public LowStockAlertProperties {
        List<String> recipients = lowStockAlertTo == null ? List.of() : lowStockAlertTo.stream()
                .map(String::trim)
                .filter(address -> !address.isEmpty())
                .toList();
        recipients.forEach(LowStockAlertProperties::requireValidAddress);
        lowStockAlertTo = recipients.isEmpty() ? List.of(DEFAULT_RECIPIENT) : recipients;
        lowStockAlertCron = lowStockAlertCron == null || lowStockAlertCron.isBlank()
                ? DEFAULT_CRON
                : lowStockAlertCron.trim();
    }

    private static void requireValidAddress(String address) {
        try {
            new InternetAddress(address, true).validate();
        } catch (AddressException ex) {
            throw new IllegalArgumentException("APP_LOW_STOCK_ALERT_TO has an invalid email address: " + address, ex);
        }
    }
}
