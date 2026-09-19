package com.sakurasoul.apartment.maintenance;

import com.sakurasoul.apartment.room.Room;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;

/**
 * การแจ้งเตือนงานซ่อมบำรุงตามรอบหนึ่งใบ (US-14) เช่น ล้างแอร์ทุกไตรมาส
 * <p>
 * วันครบกำหนดครั้งถัดไปเก็บเป็นคอลัมน์ ไม่ได้คำนวณสดจากวันเริ่มทุกครั้ง เพราะงานที่
 * scheduler ทำทุกเช้าคือถามว่า "ใบไหนถึงกำหนดแล้วบ้าง" เหตุผลเต็มอยู่ใน V8__maintenance.sql
 * <p>
 * ถือ Room เป็น association ไม่ใช่เลขห้องเปล่า ๆ แบบฝั่งหน้าเว็บ (ช่อง unit ในดีไซน์)
 * เลขห้องที่ไม่มีอยู่จริงจะเข้ามาไม่ได้ตั้งแต่แรก และเป็น null ได้เพราะงานอย่างตรวจดาดฟ้า
 * เป็นงานของทั้งตึก ไม่ได้สังกัดห้องไหน
 */
@Entity
@Table(name = "maintenance_reminder")
public class MaintenanceReminder {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "name", nullable = false, length = 200)
    private String name;

    @Enumerated(EnumType.STRING)
    @Column(name = "frequency", nullable = false, length = 10)
    private ReminderFrequency frequency;

    @Column(name = "start_date", nullable = false)
    private LocalDate startDate;

    @Column(name = "next_due_date", nullable = false)
    private LocalDate nextDueDate;

    /** ว่างได้ แปลว่าเป็นงานของทั้งตึก ไม่ได้เจาะจงห้องไหน */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "room_id")
    private Room room;

    /** เวลาที่อยากให้เตือน ตอนนี้เป็นข้อมูลให้คนอ่าน ดูเหตุผลใน V8__maintenance.sql */
    @Column(name = "remind_time")
    private LocalTime remindTime;

    @Enumerated(EnumType.STRING)
    @Column(name = "priority", nullable = false, length = 10)
    private Priority priority;

    @Column(name = "notes", length = 2000)
    private String notes;

    @Column(name = "active", nullable = false)
    private boolean active;

    @Column(name = "last_triggered_at")
    private Instant lastTriggeredAt;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected MaintenanceReminder() {
    }

    /**
     * ใบที่เพิ่งสร้างเริ่มที่เปิดใช้งานเสมอ และครั้งถัดไปคือวันเริ่มตรง ๆ
     * <p>
     * ไม่ได้เลื่อนให้ถึงวันนี้ตั้งแต่ตอนสร้าง เพราะแอดมินที่ตั้งวันเริ่มไว้ย้อนหลังตั้งใจ
     * บอกว่า "งานนี้ควรทำไปแล้ว" ใบจึงต้องขึ้นเป็นเลยกำหนดทันที ไม่ใช่เงียบไปจนถึงรอบหน้า
     */
    public MaintenanceReminder(String name, ReminderFrequency frequency, LocalDate startDate,
            Room room, LocalTime remindTime, Priority priority, String notes) {
        this.name = name;
        this.frequency = frequency;
        this.startDate = startDate;
        this.nextDueDate = startDate;
        this.room = room;
        this.remindTime = remindTime;
        this.priority = priority;
        this.notes = notes;
        this.active = true;
    }

    @PrePersist
    void onCreate() {
        if (createdAt == null) {
            createdAt = Instant.now();
        }
    }

    /**
     * แก้ใบทั้งก้อน แล้วคิดวันครบกำหนดครั้งถัดไปใหม่จากวันเริ่มกับรอบชุดใหม่
     * <p>
     * ที่ต้องคิดใหม่ทุกครั้งเพราะการแก้วันเริ่มหรือรอบทำให้ค่าเดิมไม่มีความหมายอีกต่อไป
     * เช่น ย้ายจากรายเดือนเป็นรายปีแล้ววันครบกำหนดยังเป็นเดือนหน้าอยู่ ใบจะยิงผิดรอบ
     * สูตรตรงกับ nextOccurrence ฝั่งหน้าเว็บ ดู ReminderFrequency.occurrenceOnOrAfter
     */
    public void update(String name, ReminderFrequency frequency, LocalDate startDate, Room room,
            LocalTime remindTime, Priority priority, String notes, LocalDate today, ZoneId zone) {
        this.name = name;
        this.frequency = frequency;
        this.startDate = startDate;
        this.room = room;
        this.remindTime = remindTime;
        this.priority = priority;
        this.notes = notes;
        this.nextDueDate = active
                ? nextDueAfterUpdate(startDate, today, zone)
                // ใบที่ปิดสวิตช์ไว้ถือว่าตารางหยุดเดิน ครั้งถัดไปค้างอยู่ที่วันเริ่ม
                // กฎเดียวกับ nextOccurrence ฝั่งหน้าเว็บที่เช็ค reminder.active
                : startDate;
    }

    /**
     * ครั้งถัดไปหลังแก้ใบ คือรอบแรกที่ยังไม่เลยวันนี้ แต่ต้อง "ไม่ย้อนกลับไปทับรอบที่ระบบ
     * ยิงใบไปแล้ว" ด้วย
     * <p>
     * occurrenceOnOrAfter เดินจนถึงหรือเลยวันนี้ ซึ่งวันที่ตรงกับรอบพอดีจะได้ "วันนี้" กลับมา
     * ใบรายเดือนที่เริ่ม 15 ม.ค. ถ้าแอดมินมาแก้บันทึกตอนบ่ายของวันที่ 15 ก.พ. หลังงาน
     * ประจำวันยิงใบไปแล้วเมื่อเช้า ค่าที่คิดสด ๆ จะดึงครั้งถัดไปกลับมาเป็น 15 ก.พ. อีกครั้ง
     * แล้วรอบถัดไปจะสร้างใบแจ้งซ่อมซ้ำให้รอบเดิม ซึ่งขัดกับที่ ReminderController.runDue
     * สัญญาไว้ว่าเรียกซ้ำในวันเดียวกันแล้วได้ createdTickets เป็น 0
     * <p>
     * เทียบกับวันที่ยิงล่าสุดตามเวลาไทย ไม่ใช่เทียบ instant ตรง ๆ เพราะสิ่งที่ระบบสัญญาไว้
     * เป็นราย "วัน" ไม่ใช่รายวินาที เดินทีละก้าวด้วยเหตุผลเดียวกับ advancePast คือการหนีบ
     * วันสิ้นเดือนทำให้แต่ละก้าวยาวไม่เท่ากัน
     */
    private LocalDate nextDueAfterUpdate(LocalDate startDate, LocalDate today, ZoneId zone) {
        LocalDate next = frequency.occurrenceOnOrAfter(startDate, today);
        if (!frequency.repeats() || lastTriggeredAt == null) {
            return next;
        }

        LocalDate firedOn = LocalDate.ofInstant(lastTriggeredAt, zone);
        while (!next.isAfter(firedOn)) {
            next = frequency.stepFrom(next);
        }
        return next;
    }

    /** เปิดหรือปิดสวิตช์ ใบที่ปิดอยู่ scheduler จะข้ามไปโดยไม่สนใจว่าถึงกำหนดหรือยัง */
    public void setActive(boolean active) {
        this.active = active;
    }

    /** ถึงกำหนดแล้วและยังเปิดใช้งานอยู่ คือเงื่อนไขเดียวที่ทำให้ระบบสร้างใบแจ้งซ่อมให้ */
    public boolean isDueOn(LocalDate today) {
        return active && !nextDueDate.isAfter(today);
    }

    public void markTriggered(Instant firedAt) {
        this.lastTriggeredAt = firedAt;
    }

    /**
     * เลื่อนวันครบกำหนดไปจนพ้นวันนี้ หลังจากที่ระบบสร้างใบแจ้งซ่อมจากใบนี้ไปแล้ว
     * <p>
     * ต้อง "พ้นวันนี้" ไม่ใช่แค่ "ถึงวันนี้" ไม่งั้นการรัน scheduler ซ้ำในวันเดียวกัน
     * (หรือแอดมินกดปุ่มรันเองตาม POST /api/reminders/run-due) จะสร้างใบซ้ำไปเรื่อย ๆ
     * <p>
     * วนไปข้างหน้าทีละก้าวแทนที่จะคำนวณจำนวนก้าวทีเดียว เพราะการหนีบวันสิ้นเดือนทำให้
     * ก้าวแต่ละก้าวไม่เท่ากัน (31 ม.ค. -> 28 ก.พ. -> 28 มี.ค.) เดินทีละก้าวจึงได้ผลตรงกับ
     * ฝั่งหน้าเว็บที่เดินทีละก้าวเหมือนกัน
     * <p>
     * ใบรอบเดียวไม่มีครั้งถัดไป ปิดสวิตช์แทนตามที่ US-14 กำหนด
     */
    public void advancePast(LocalDate today) {
        if (!frequency.repeats()) {
            this.active = false;
            return;
        }
        LocalDate next = nextDueDate;
        while (!next.isAfter(today)) {
            next = frequency.stepFrom(next);
        }
        this.nextDueDate = next;
    }

    /** เลยกำหนดแล้วหรือยัง หน้าเว็บเอาไปติดป้ายบนการ์ด */
    public boolean isOverdue(LocalDate today) {
        return nextDueDate.isBefore(today);
    }

    public Long getId() {
        return id;
    }

    public String getName() {
        return name;
    }

    public ReminderFrequency getFrequency() {
        return frequency;
    }

    public LocalDate getStartDate() {
        return startDate;
    }

    public LocalDate getNextDueDate() {
        return nextDueDate;
    }

    public Room getRoom() {
        return room;
    }

    public LocalTime getRemindTime() {
        return remindTime;
    }

    public Priority getPriority() {
        return priority;
    }

    public String getNotes() {
        return notes;
    }

    public boolean isActive() {
        return active;
    }

    public Instant getLastTriggeredAt() {
        return lastTriggeredAt;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
