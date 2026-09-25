package com.sakurasoul.apartment.billing;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * ค่าของอีเมลใบเสร็จ ผูกกับ app.mail ใน application.yml ซึ่งอ่านต่อจาก APP_MAIL_FROM อีกที (SSK-143)
 * <p>
 * มีแค่ที่อยู่ผู้ส่ง ส่วนปลายทาง SMTP (Mailpit) เป็นของ spring.mail ที่ Spring Boot ดูแลเอง
 * <p>
 * ค่าตั้งต้นเติมที่ constructor ด้วย ไม่พึ่ง application.yml อย่างเดียว เหตุผลเดียวกับ AdminProperties
 * คือเทสที่สร้าง record นี้เองจะได้ไม่ต้องกรอก และ environment ที่ส่งสตริงว่างมาจะไม่ได้อีเมลที่ไม่มีผู้ส่ง
 */
@ConfigurationProperties(prefix = "app.mail")
public record AppMailProperties(String from) {

    static final String DEFAULT_FROM = "billing@sakura-soul.local";

    public AppMailProperties {
        from = from == null || from.isBlank() ? DEFAULT_FROM : from.trim();
    }
}
