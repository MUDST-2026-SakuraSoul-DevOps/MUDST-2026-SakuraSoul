package com.sakurasoul.apartment.billingschedule;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.ZonedDateTime;

/**
 * งานตั้งเวลาเตือนใบค้างรายเดือน (SSK-143) ตื่นทุกนาทีแล้วถามว่าถึงรอบของเดือนนี้หรือยัง
 * <p>
 * ตื่นทุกนาทีเพราะเวลาที่แอดมินตั้งเป็นระดับนาที และการอ่านแถวเดียวต่อนาทีถูกมาก ถ้าตื่นห่างกว่านี้
 * เวลาที่ส่งจริงจะคลาดจากเวลาที่ตั้งไว้ได้ถึงรอบของการตื่น
 * <p>
 * บางที่สุดเท่าที่ทำได้แบบเดียวกับ maintenance.ReminderScheduler มีแค่ "เมื่อไหร่" ส่วน "ทำอะไร" รวมถึง
 * การกันสอง pod ส่งซ้ำอยู่ใน BillingScheduleService.runIfDue ทั้งหมด เทสยิงเมธอดนั้นตรง ๆ ได้โดยไม่ต้องรอนาฬิกา
 */
@Component
public class BillingScheduler {

    private static final Logger log = LoggerFactory.getLogger(BillingScheduler.class);

    private final BillingScheduleService billingScheduleService;
    private final Clock clock;

    public BillingScheduler(BillingScheduleService billingScheduleService, Clock clock) {
        this.billingScheduleService = billingScheduleService;
        this.clock = clock;
    }

    /**
     * ระบุ zone ไว้ที่ cron ตรง ๆ เหตุผลเดียวกับ ReminderScheduler คือ container ตั้งเป็น UTC
     * ถ้าไม่ระบุ งานยังตื่นทุกนาทีเหมือนเดิม แต่เวลาที่ส่งไปคิดรอบจะเป็นของโซนเครื่อง ไม่ใช่เวลาไทย
     */
    @Scheduled(cron = "0 * * * * *", zone = "Asia/Bangkok")
    public void sendRemindersIfDue() {
        billingScheduleService.runIfDue(ZonedDateTime.now(clock))
                .ifPresent(run -> log.debug("ปิดรอบเตือนใบค้างของเดือน {} แล้ว", run.getPeriod()));
    }
}
