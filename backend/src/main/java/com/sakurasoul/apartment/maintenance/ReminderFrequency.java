package com.sakurasoul.apartment.maintenance;

import java.time.LocalDate;

/**
 * รอบของการแจ้งเตือนงานซ่อมบำรุง (US-14) ชุดเดียวกับ ReminderFrequency ฝั่งหน้าเว็บ
 * (One-time / Monthly / Quarterly / Annual) แต่เขียนเป็นตัวพิมพ์ใหญ่ให้เข้าชุดกับ enum
 * ตัวอื่นของ API นี้
 * <p>
 * การบวกวันอยู่ที่นี่ที่เดียว ทั้ง ReminderService ตอนแก้ใบและ scheduler ตอนเลื่อนรอบ
 * ถัดไปเรียกตัวเดียวกัน ถ้าเขียนสูตรแยกกันสองที่ วันครบกำหนดจะเริ่มเพี้ยนจากกันเงียบ ๆ
 */
public enum ReminderFrequency {

    /** เตือนครั้งเดียวจบ ยิงแล้วใบจะถูกปิดสวิตช์ ไม่มีครั้งถัดไป */
    ONE_TIME(0),

    MONTHLY(1),
    QUARTERLY(3),
    ANNUAL(12);

    private final int monthsPerStep;

    ReminderFrequency(int monthsPerStep) {
        this.monthsPerStep = monthsPerStep;
    }

    public static ReminderFrequency parse(String value) {
        for (ReminderFrequency frequency : values()) {
            if (frequency.name().equals(value)) {
                return frequency;
            }
        }
        throw new IllegalArgumentException("Frequency must be ONE_TIME, MONTHLY, QUARTERLY or ANNUAL");
    }

    /** รอบที่วนซ้ำได้จริง ONE_TIME ตอบ false และไม่มีวันถัดไปให้คำนวณ */
    public boolean repeats() {
        return monthsPerStep > 0;
    }

    /**
     * ครั้งถัดไปนับจากวันที่ให้มาหนึ่งก้าว
     * <p>
     * ใช้ plusMonths ของ java.time ซึ่งหนีบวันสิ้นเดือนให้เอง 31 ม.ค. บวกหนึ่งเดือน
     * ได้ 28 ก.พ. (หรือ 29 ในปีอธิกสุรทิน) ไม่ล้นไปเป็น 3 มี.ค. กฎเดียวกับ addMonths
     * ใน frontend/src/domain/maintenanceBoard.ts ที่หนีบด้วยวันสุดท้ายของเดือนปลายทาง
     */
    public LocalDate stepFrom(LocalDate date) {
        return date.plusMonths(monthsPerStep);
    }

    /**
     * วันครบกำหนดครั้งแรกที่ยัง "ไม่เลยวันนี้" นับจากวันเริ่ม
     * <p>
     * ตรงกับ nextOccurrence ฝั่งหน้าเว็บเป๊ะ ๆ คือเดินทีละก้าวจนกว่าจะถึงหรือเลยวันนี้
     * ใบรอบเดียวไม่มีอะไรให้เดิน ครั้งถัดไปจึงค้างอยู่ที่วันเริ่มเสมอ ซึ่งทำให้ใบที่ตั้งไว้
     * นานแล้วแต่ยังไม่ได้ทำกลายเป็น "เลยกำหนด" บนหน้าจอ และนั่นคือสิ่งที่ควรเห็น
     * <p>
     * ต่างจากตอน scheduler เลื่อนรอบหลังยิงใบ (ดู MaintenanceReminder.advancePast)
     * ตรงที่ตัวนั้นต้องเดินให้ "พ้นวันนี้" ไม่ใช่แค่ถึงวันนี้ ไม่งั้นใบเดิมจะถูกยิงซ้ำอีกรอบ
     * ในวันเดียวกัน
     */
    public LocalDate occurrenceOnOrAfter(LocalDate startDate, LocalDate today) {
        if (!repeats()) {
            return startDate;
        }
        LocalDate next = startDate;
        while (next.isBefore(today)) {
            next = stepFrom(next);
        }
        return next;
    }
}
