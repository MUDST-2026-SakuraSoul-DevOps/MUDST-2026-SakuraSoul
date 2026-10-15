package com.sakurasoul.apartment.billingschedule;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;

/**
 * รอบเตือนใบค้างของหนึ่งเดือน (SSK-143) หนึ่งเดือนมีได้แถวเดียว บังคับด้วย billing_schedule_run_period_uk
 * <p>
 * แถวนี้เป็นทั้ง "ตัวจอง" ที่กันสอง pod รันเดือนเดียวกัน และบันทึกผลของรอบที่หน้าเว็บโชว์เป็น Last run
 * ดูเหตุผลเต็มในคอมเมนต์ของ V15
 */
@Entity
@Table(name = "billing_schedule_run")
public class BillingScheduleRun {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** "YYYY-MM" ของเดือนตามเวลาไทยที่รอบนี้เป็นของ */
    @Column(name = "period", nullable = false, length = 7)
    private String period;

    @Column(name = "started_at", nullable = false)
    private Instant startedAt;

    /** ว่างแปลว่ายังส่งอยู่ หรือ pod ตายกลางทาง */
    @Column(name = "finished_at")
    private Instant finishedAt;

    @Column(name = "sent_count", nullable = false)
    private int sentCount;

    /** ใบที่ข้ามเพราะผู้เช่าไม่มีอีเมล */
    @Column(name = "skipped_count", nullable = false)
    private int skippedCount;

    /** ใบที่เมลเซิร์ฟเวอร์ปฏิเสธหลังจากใบก่อนหน้าออกไปได้แล้ว */
    @Column(name = "failed_count", nullable = false)
    private int failedCount;

    /** ข้อความเมื่อทั้งรอบส่งไม่ออกเลย เช่นเมลเซิร์ฟเวอร์ล่ม */
    @Column(name = "error", length = 500)
    private String error;

    protected BillingScheduleRun() {
    }

    /** จองเดือนนี้ก่อนเริ่มส่ง ถ้าบันทึกไม่ผ่านเพราะ period ซ้ำ แปลว่ามี pod อื่นจองไปแล้ว */
    static BillingScheduleRun claim(String period, Instant startedAt) {
        BillingScheduleRun run = new BillingScheduleRun();
        run.period = period;
        run.startedAt = startedAt;
        return run;
    }

    /** ปิดรอบพร้อมผลของการส่ง error เป็น null เมื่อรอบนี้ส่งได้ตามปกติ */
    void finish(Instant finishedAt, int sentCount, int skippedCount, int failedCount, String error) {
        this.finishedAt = finishedAt;
        this.sentCount = sentCount;
        this.skippedCount = skippedCount;
        this.failedCount = failedCount;
        this.error = error;
    }

    public Long getId() {
        return id;
    }

    public String getPeriod() {
        return period;
    }

    public Instant getStartedAt() {
        return startedAt;
    }

    public Instant getFinishedAt() {
        return finishedAt;
    }

    public int getSentCount() {
        return sentCount;
    }

    public int getSkippedCount() {
        return skippedCount;
    }

    public int getFailedCount() {
        return failedCount;
    }

    public String getError() {
        return error;
    }
}
