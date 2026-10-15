package com.sakurasoul.apartment.billingschedule;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.time.LocalTime;

/**
 * ค่าตั้งเวลาเตือนใบค้างรายเดือน (SSK-143) มีแถวเดียวเสมอ แบบเดียวกับ ApartmentConfig
 * <p>
 * ไม่มี constructor แบบสร้างของใหม่ เพราะแถวเดียวถูกใส่ไว้ตั้งแต่ migration V15 แล้ว
 * การใช้งานมีแค่โหลดมาแล้วแก้ค่า
 * <p>
 * แยก package ของตัวเองออกจาก billing ตามแบบ apartmentconfig คือค่าตั้งแถวเดียวอยู่ใน package ของมันเอง
 * ส่วนการส่งอีเมลยังอยู่ที่ billing และ package นี้เรียกไปทางเดียว
 */
@Entity
@Table(name = "billing_schedule")
public class BillingSchedule {

    /** ล็อกเป็น 1 เสมอด้วย CHECK constraint ใน V15 */
    @Id
    @Column(name = "id", nullable = false)
    private Short id;

    @Column(name = "enabled", nullable = false)
    private boolean enabled;

    /** 1 ถึง 31 เดือนที่สั้นกว่าใช้วันสุดท้ายของเดือน ดู BillingScheduleRules.slotOf */
    @Column(name = "day_of_month", nullable = false)
    private int dayOfMonth;

    /** เวลาไทย ไม่มีโซนเหมือน remind_time ของแจ้งเตือนซ่อม */
    @Column(name = "send_time", nullable = false)
    private LocalTime sendTime;

    /**
     * เวลาที่กดบันทึกล่าสุด นอกจากโชว์แล้วยังเป็นตัวตัดสินว่ารอบของเดือนนี้นับหรือยัง
     * รอบที่อยู่ก่อนเวลานี้ไม่นับ ค่าใหม่จึงมีผลตั้งแต่รอบแรกหลังกดบันทึก (BillingScheduleRules.nextRunAt)
     */
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected BillingSchedule() {
    }

    /** ทับค่าทั้งชุด ผู้เรียกต้องตรวจค่าผ่าน BillingScheduleRules มาก่อน */
    void apply(boolean enabled, int dayOfMonth, LocalTime sendTime, Instant updatedAt) {
        this.enabled = enabled;
        this.dayOfMonth = dayOfMonth;
        this.sendTime = sendTime;
        this.updatedAt = updatedAt;
    }

    public Short getId() {
        return id;
    }

    public boolean isEnabled() {
        return enabled;
    }

    public int getDayOfMonth() {
        return dayOfMonth;
    }

    public LocalTime getSendTime() {
        return sendTime;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }
}
