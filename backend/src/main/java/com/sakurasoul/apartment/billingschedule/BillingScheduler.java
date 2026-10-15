package com.sakurasoul.apartment.billingschedule;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.ZonedDateTime;
import java.time.temporal.ChronoUnit;

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
        billingScheduleService.runIfDue(tickMinute(ZonedDateTime.now(clock)))
                .ifPresent(run -> log.debug("ปิดรอบเตือนใบค้างของเดือน {} แล้ว", run.getPeriod()));
    }

    /**
     * นาทีที่ tick นี้ตั้งใจ ไม่ใช่เวลาที่ตื่นจริง (SSK-145)
     * <p>
     * cron ตั้งให้ตื่นทุกต้นนาที แต่ scheduler ของ Spring ตื่นเร็วกว่าต้นนาทีได้ไม่กี่มิลลิวินาที ตอนซ้อมบน stack จริง
     * tick ของ 06:55 ตื่นตอน 06:54:59 กว่า ๆ ถ้าส่งเวลาจริงให้ runIfDue รอบ 06:55 จะยังไม่ถึง แล้วไปส่งใน tick ถัดไป
     * ช้ากว่าที่หน้าเว็บบอกหนึ่งนาที
     * <p>
     * บวกหนึ่งวินาทีแล้วตัดเหลือนาที tick ที่ตื่นเร็วไม่เกินหนึ่งวินาทีจึงได้นาทีข้างหน้าที่มันตั้งใจ ส่วน tick ที่ตื่นช้า
     * (เช่นเครื่องยุ่ง) ได้นาทีเดิมของมัน รอบตั้งเวลาเป็นระดับนาทีอยู่แล้ว (sendTime ไม่มีวินาที) จึงไม่เสียความละเอียดอะไร
     * และเดือนของรอบก็คิดจากนาทีนี้ด้วย tick ของเที่ยงคืนวันที่ 1 ที่ตื่นเร็วจึงยังเป็นของเดือนใหม่
     */
    static ZonedDateTime tickMinute(ZonedDateTime now) {
        return now.plusSeconds(1).truncatedTo(ChronoUnit.MINUTES);
    }
}
