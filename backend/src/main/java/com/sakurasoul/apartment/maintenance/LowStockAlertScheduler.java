package com.sakurasoul.apartment.maintenance;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.scheduling.annotation.SchedulingConfigurer;
import org.springframework.scheduling.config.CronTask;
import org.springframework.scheduling.config.ScheduledTaskRegistrar;
import org.springframework.scheduling.support.CronTrigger;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;

/**
 * งานประจำวันที่ส่งอีเมลแจ้งเตือนของใกล้หมด (SSK-171) ตั้งต้นแปดโมงเช้าตามเวลาไทย เวลาเดียวกับ ReminderScheduler
 * คนดูแลหอเห็นรายการของที่ต้องซื้อตั้งแต่เริ่มงาน
 * <p>
 * ตัวคลาสมีแค่ "เมื่อไหร่" ส่วน "ทำอะไร" และเหตุผลที่สอง pod รันพร้อมกันได้อยู่ที่ LowStockAlertService
 * <p>
 * เวลาตั้งได้ (LowStockAlertProperties.lowStockAlertCron) เดโมที่อยากเห็นอีเมลทันทีตั้งเป็นทุกนาทีได้
 * ของแต่ละชิ้นยังได้อีเมลครั้งเดียวต่อการข้ามเกณฑ์ ลงทะเบียนงานผ่าน SchedulingConfigurer แทน @Scheduled
 * เพราะ @Scheduled อ่าน placeholder ตรง ๆ ตัวแปรที่ตั้งเป็นค่าว่างจะได้ cron ว่างแล้วแอปสตาร์ตไม่ขึ้น
 * ส่วน properties แปลงค่าว่างเป็นค่าตั้งต้นให้แล้ว
 */
@Component
@EnableConfigurationProperties(LowStockAlertProperties.class)
class LowStockAlertScheduler implements SchedulingConfigurer {

    private static final Logger log = LoggerFactory.getLogger(LowStockAlertScheduler.class);

    /** cron คิดตามเวลาไทยเสมอ container ตั้งเป็น UTC ถ้าไม่ระบุ งานจะยิงตอนบ่ายสามของไทย (เหตุผลเดียวกับ ReminderScheduler) */
    static final ZoneId BANGKOK = ZoneId.of("Asia/Bangkok");

    private final LowStockAlertService alertService;
    private final LowStockAlertProperties properties;
    private final Clock clock;

    LowStockAlertScheduler(LowStockAlertService alertService, LowStockAlertProperties properties, Clock clock) {
        this.alertService = alertService;
        this.properties = properties;
        this.clock = clock;
    }

    /** cron ที่ผิดรูปแบบทำให้ CronTrigger โยนตอนสตาร์ต แอปจึงไม่ขึ้นพร้อมข้อความที่บอก cron นั้น */
    @Override
    public void configureTasks(ScheduledTaskRegistrar registrar) {
        String cron = properties.lowStockAlertCron();
        if (ScheduledTaskRegistrar.CRON_DISABLED.equals(cron)) {
            log.info("งานแจ้งเตือนของใกล้หมดถูกปิดไว้ (APP_LOW_STOCK_ALERT_CRON={})", cron);
            return;
        }
        registrar.addCronTask(new CronTask(this::alertLowStock, new CronTrigger(cron, BANGKOK)));
    }

    void alertLowStock() {
        int items = alertService.run(Instant.now(clock));
        log.info("แจ้งเตือนของใกล้หมด: อีเมลรอบนี้มี {} รายการ", items);
    }
}
