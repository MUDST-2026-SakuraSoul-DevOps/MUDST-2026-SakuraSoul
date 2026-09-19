package com.sakurasoul.apartment.maintenance;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * งานประจำวันของ US-14-S2 ทุกเช้าแปดโมงตามเวลาไทย ระบบจะไล่ดูว่าใบแจ้งเตือนใบไหน
 * ถึงกำหนดแล้วบ้าง แล้วเปิดใบแจ้งซ่อมให้อัตโนมัติ
 * <p>
 * แปดโมงเช้าเพราะเป็นเวลาที่คนดูแลหอเริ่มงาน ใบที่ระบบเปิดให้จะรออยู่ในหน้า Maintenance
 * ตั้งแต่เปิดคอมพิวเตอร์ ไม่ใช่โผล่มากลางวันตอนที่วางแผนงานของวันไปแล้ว
 * <p>
 * ตัวคลาสนี้ตั้งใจให้บางที่สุดเท่าที่จะทำได้ มีแค่ "เมื่อไหร่" กับการเขียน log ส่วน
 * "ทำอะไร" อยู่ใน ReminderService.runDue ทั้งหมด ซึ่งเป็นเมธอดเดียวกับที่
 * POST /api/reminders/run-due เรียก สองทางนี้จึงไม่มีวันทำงานต่างกัน และเทสยิงเมธอด
 * นั้นตรง ๆ ได้โดยไม่ต้องรอให้ถึงแปดโมง
 * <p>
 * <h2>สอง pod ยิงพร้อมกัน</h2>
 * k8s รัน backend สอง pod อยู่จริง (replicas: 2 ใน k8s/20-backend.yaml) งานนี้จึงทำงาน
 * หนึ่งครั้งต่อ pod ในวินาทีเดียวกัน ตัวกันใบซ้ำไม่ใช่ข้อตกลงว่าจะรันชุดเดียว แต่เป็นสองชั้น
 * ที่ฐานข้อมูล คือการล็อกแถวใบแจ้งเตือนตอนอ่าน (ReminderService.runDue ผ่าน
 * MaintenanceReminderRepository.findDueForUpdate) ทำให้ pod ที่สองเห็นวันครบกำหนด
 * ที่ถูกเลื่อนไปแล้วและข้ามใบนั้นไป และ unique index maintenance_ticket_reminder_due_uk
 * ใน V8 ที่กันใบแจ้งซ่อมซ้ำของรอบเดียวกันเป็นด่านสุดท้าย
 * <p>
 * ShedLock ยังไม่จำเป็นเพราะงานนี้ทำงานซ้ำได้โดยไม่เกิดผลซ้ำ (idempotent) แล้ว ถ้าวันหลัง
 * มีงานประจำวันที่ซ้ำไม่ได้จริง ๆ ค่อยใส่ตัวล็อกร่วม
 */
@Component
public class ReminderScheduler {

    private static final Logger log = LoggerFactory.getLogger(ReminderScheduler.class);

    private final ReminderService reminderService;

    public ReminderScheduler(ReminderService reminderService) {
        this.reminderService = reminderService;
    }

    /**
     * ระบุ zone ไว้ที่ cron ตรง ๆ เพื่อไม่ให้เวลาที่ยิงเลื่อนไปตามโซนเวลาของเครื่องที่รัน
     * container ของโปรเจกต์นี้ตั้งเป็น UTC ถ้าไม่ระบุ งานจะไปยิงตอนบ่ายสามของไทยแทน
     */
    @Scheduled(cron = "0 0 8 * * *", zone = "Asia/Bangkok")
    public void createTicketsForDueReminders() {
        int created = reminderService.runDue(reminderService.today());
        log.info("แจ้งเตือนซ่อมบำรุงตามรอบ: สร้างใบแจ้งซ่อมอัตโนมัติ {} ใบ", created);
    }
}
