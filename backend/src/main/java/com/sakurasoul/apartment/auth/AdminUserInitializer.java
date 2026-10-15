package com.sakurasoul.apartment.auth;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

/**
 * สร้างแอดมินคนแรกให้ตอนแอปสตาร์ต ถ้าตาราง admin_user ยังว่างและมีรหัสผ่านส่งมาให้
 * <p>
 * ที่ไม่ใส่แถวแรกไว้ใน migration เพราะ migration ถูกคอมมิตลง repo และรันเหมือนกัน
 * ทุก environment แปลว่ารหัสผ่านของเครื่องจริงจะเท่ากับรหัสที่ทุกคนที่ clone repo
 * อ่านไปแล้ว ต่อให้เก็บเป็น hash ก็ยังเดาย้อนได้เพราะรู้ว่า hash มาจากอะไร
 * <p>
 * ที่ไม่ผูกกับโปรไฟล์ dev แบบ DevDataSeeder เพราะนี่ไม่ใช่ข้อมูลตัวอย่าง แต่เป็นทาง
 * เดียวที่จะมีคนล็อกอินเข้าระบบที่เพิ่ง deploy ใหม่ได้ ถ้าผูกกับ dev ระบบบน k8s จะ
 * ไม่มีใครเข้าได้เลยตั้งแต่วินาทีแรก
 * <p>
 * เงื่อนไขคือตารางต้องว่างเท่านั้น ไม่ใช่ "ไม่มี username นี้" เพื่อไม่ให้การตั้ง
 * APP_ADMIN_USERNAME ใหม่กลายเป็นการแอบเพิ่มบัญชีเข้าระบบที่ใช้งานอยู่แล้ว
 * และไม่เขียนทับของเดิมเด็ดขาด รหัสผ่านที่แอดมินเปลี่ยนเองทีหลังจะได้ไม่ถูก
 * environment variable ที่ค้างอยู่ใน manifest ตั้งกลับทุกครั้งที่ pod restart
 */
@Component
@EnableConfigurationProperties(AdminProperties.class)
public class AdminUserInitializer implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(AdminUserInitializer.class);

    private final AdminUserRepository adminUserRepository;
    private final PasswordEncoder passwordEncoder;
    private final AdminProperties adminProperties;

    public AdminUserInitializer(AdminUserRepository adminUserRepository, PasswordEncoder passwordEncoder,
            AdminProperties adminProperties) {
        this.adminUserRepository = adminUserRepository;
        this.passwordEncoder = passwordEncoder;
        this.adminProperties = adminProperties;
    }

    @Override
    public void run(ApplicationArguments args) {
        if (adminUserRepository.count() > 0) {
            log.info("มีผู้ใช้แอดมินอยู่แล้ว ข้ามการสร้างแอดมินคนแรก");
            return;
        }

        if (!adminProperties.hasPassword()) {
            log.warn("ยังไม่มีผู้ใช้แอดมินและยังไม่ได้ตั้งรหัสผ่าน จะยังเข้าสู่ระบบไม่ได้"
                    + " ให้ตั้ง environment variable APP_ADMIN_PASSWORD (และ APP_ADMIN_USERNAME"
                    + " ถ้าไม่อยากใช้ชื่อ {}) แล้วสตาร์ตใหม่อีกครั้ง", AdminProperties.DEFAULT_USERNAME);
            return;
        }

        // อีเมลกับเบอร์โทรเป็น null เพราะ environment variable ไม่ได้ส่งมา
        // แอดมินไปกรอกเพิ่มเองได้ทีหลังเมื่อมีหน้าโปรไฟล์ (ยังไม่อยู่ในเฟสนี้)
        AdminUser adminUser = new AdminUser(adminProperties.username(),
                passwordEncoder.encode(adminProperties.password()),
                adminProperties.displayName(), null, null);
        adminUserRepository.save(adminUser);

        // ห้าม log รหัสผ่าน log ของ k8s อ่านได้กว้างกว่าที่คิดเสมอ
        log.info("สร้างผู้ใช้แอดมินคนแรกชื่อ {} เรียบร้อย", adminUser.getUsername());
    }
}
