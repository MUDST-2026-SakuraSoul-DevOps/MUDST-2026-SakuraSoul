package com.sakurasoul.apartment.dev;

import com.sakurasoul.apartment.tenant.TenantDtos.CreateTenantRequest;
import com.sakurasoul.apartment.tenant.TenantRepository;
import com.sakurasoul.apartment.tenant.TenantService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

/**
 * ใส่ผู้เช่าตัวอย่างให้ตอน dev จะได้มีข้อมูลให้กดเล่นโดยไม่ต้องนั่งกรอกเอง
 * <p>
 * ห้องทั้ง 24 ห้องไม่ได้อยู่ที่นี่ แต่อยู่ใน migration V2 เพราะเป็นข้อมูลจริงของตึก
 * ส่วนผู้เช่าเป็นของปลอม เลยผูกไว้กับโปรไฟล์ dev ซึ่ง k8s ไม่ได้เปิด ข้อมูลปลอมจึงไม่หลุดขึ้นไป
 * <p>
 * เรียกผ่าน service ไม่ยิง repository ตรง จะได้เดินผ่านกฎเดียวกับที่ API ใช้
 */
@Component
@Profile("dev")
public class DevDataSeeder implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(DevDataSeeder.class);

    private final TenantRepository tenantRepository;
    private final TenantService tenantService;

    public DevDataSeeder(TenantRepository tenantRepository, TenantService tenantService) {
        this.tenantRepository = tenantRepository;
        this.tenantService = tenantService;
    }

    @Override
    public void run(ApplicationArguments args) {
        if (tenantRepository.count() > 0) {
            log.info("มีข้อมูลตัวอย่างอยู่แล้ว ข้ามการ seed");
            return;
        }

        tenantService.create(new CreateTenantRequest("สมชาย ใจดี", "081-234-5678", "1234567890123"));
        tenantService.create(new CreateTenantRequest("ปิยะดา แสงทอง", "089-876-5432", "1234567890124"));
        tenantService.create(new CreateTenantRequest("Kenji Watanabe", "062-111-2222", null));

        log.info("seed ผู้เช่าตัวอย่าง 3 คนเรียบร้อย");
    }
}
