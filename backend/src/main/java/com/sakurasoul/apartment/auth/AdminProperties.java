package com.sakurasoul.apartment.auth;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * ค่าของแอดมินคนแรกที่ระบบจะสร้างให้ตอนสตาร์ต ผูกกับ app.admin ใน application.yml
 * ซึ่งอ่านต่อมาจาก environment variable APP_ADMIN_USERNAME / APP_ADMIN_PASSWORD /
 * APP_ADMIN_DISPLAY_NAME อีกที
 * <p>
 * {@code password} ว่างเป็นค่าตั้งต้นโดยตั้งใจ ระบบที่ตั้งรหัสผ่านให้เองเวลาไม่ได้ตั้งค่า
 * คือระบบที่ทุกคนรู้รหัส ถ้าไม่ตั้ง APP_ADMIN_PASSWORD ระบบจะไม่สร้างใครเลยและเตือน
 * ไว้ใน log แทน (ดู AdminUserInitializer)
 * <p>
 * ค่าตั้งต้นของ username กับ displayName เติมให้ที่ constructor ไม่ใช่พึ่ง application.yml
 * อย่างเดียว เพราะเทสที่สร้าง record ตัวนี้เองจะได้ไม่ต้องกรอกครบทุกช่อง และเผื่อกรณี
 * ที่ environment ส่งสตริงว่างมา ซึ่ง Spring จะ bind ให้เป็นสตริงว่างจริง ๆ ไม่ใช่ null
 */
@ConfigurationProperties(prefix = "app.admin")
public record AdminProperties(String username, String password, String displayName) {

    static final String DEFAULT_USERNAME = "admin";
    static final String DEFAULT_DISPLAY_NAME = "ผู้ดูแลระบบ";

    public AdminProperties {
        username = hasText(username) ? username.trim() : DEFAULT_USERNAME;
        displayName = hasText(displayName) ? displayName.trim() : DEFAULT_DISPLAY_NAME;
        password = password == null ? "" : password;
    }

    /** ตั้งรหัสผ่านไว้จริงหรือยัง ช่องว่างล้วนถือว่ายังไม่ได้ตั้ง */
    public boolean hasPassword() {
        return hasText(password);
    }

    private static boolean hasText(String value) {
        return value != null && !value.isBlank();
    }
}
