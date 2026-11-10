package com.sakurasoul.apartment.maintenance;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.Instant;

/**
 * งานประจำวันที่ส่งอีเมลแจ้งเตือนของใกล้หมด (SSK-171) ตั้งต้นแปดโมงเช้าตามเวลาไทย เวลาเดียวกับ ReminderScheduler
 * คนดูแลหอเห็นรายการของที่ต้องซื้อตั้งแต่เริ่มงาน
 * <p>
 * ตัวคลาสมีแค่ "เมื่อไหร่" ส่วน "ทำอะไร" และเหตุผลที่สอง pod รันพร้อมกันได้อยู่ที่ LowStockAlertService
 * <p>
 * เวลาเป็น cron ที่ตั้งได้ (app.supplies.low-stock-alert-cron หรือ APP_LOW_STOCK_ALERT_CRON) ไม่ได้เขียนตายตัว
 * เดโมที่อยากเห็นอีเมลทันทีตั้งเป็นทุกนาทีได้ ของแต่ละชิ้นยังได้อีเมลครั้งเดียวต่อการข้ามเกณฑ์ ตั้งเป็น - เพื่อปิดงานนี้
 */
@Component
class LowStockAlertScheduler {

    private static final Logger log = LoggerFactory.getLogger(LowStockAlertScheduler.class);

    private final LowStockAlertService alertService;
    private final Clock clock;

    LowStockAlertScheduler(LowStockAlertService alertService, Clock clock) {
        this.alertService = alertService;
        this.clock = clock;
    }

    /** zone อยู่ที่ cron ตรง ๆ container ตั้งเป็น UTC ถ้าไม่ระบุ งานจะยิงตอนบ่ายสามของไทย (เหตุผลเดียวกับ ReminderScheduler) */
    @Scheduled(cron = "${app.supplies.low-stock-alert-cron}", zone = "Asia/Bangkok")
    void alertLowStock() {
        int items = alertService.run(Instant.now(clock));
        log.info("แจ้งเตือนของใกล้หมด: อีเมลรอบนี้มี {} รายการ", items);
    }
}
