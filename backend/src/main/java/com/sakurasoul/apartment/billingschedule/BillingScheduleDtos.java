package com.sakurasoul.apartment.billingschedule;

import com.fasterxml.jackson.annotation.JsonFormat;

import java.time.Instant;

/**
 * รูปร่าง request กับ response ของค่าตั้งเวลาเตือนใบค้าง ตกลงไว้ใน docs/api-contract-billing.md (SSK-143)
 * <p>
 * ไม่ใส่ bean validation ที่ request เหตุผลเดียวกับ ApartmentConfigDtos คือหน้าเว็บอ่านข้อความจาก detail
 * ไปโชว์ใต้ฟอร์มตรง ๆ การตรวจจึงอยู่ที่ BillingScheduleRules แล้วโยน IllegalArgumentException
 * <p>
 * เวลาทุกตัวใช้รูปแบบเดียวกับ updatedAt ของ Apartment Config คือ ISO-8601 โซน UTC ละเอียดมิลลิวินาทีเสมอ
 */
public final class BillingScheduleDtos {

    private static final String INSTANT_PATTERN = "yyyy-MM-dd'T'HH:mm:ss.SSSX";

    private BillingScheduleDtos() {
    }

    /**
     * body ของ PUT /api/billing-schedule
     * <p>
     * ช่องเป็น Boolean กับ Integer ไม่ใช่ boolean กับ int เพื่อแยก "ไม่ได้ส่งมา" ออกจาก false กับ 0
     * ถ้าเป็นชนิดพื้นฐาน ช่องที่หายไปจะกลายเป็นค่าปิดหรือวันที่ 0 เงียบ ๆ แทนที่จะได้ข้อความเตือน
     */
    public record BillingScheduleRequest(Boolean enabled, Integer dayOfMonth, String sendTime) {
    }

    /** รอบเตือนของหนึ่งเดือน error มีค่าเมื่อทั้งรอบส่งไม่ออกเลย */
    public record BillingScheduleRunResponse(
            String period,
            @JsonFormat(shape = JsonFormat.Shape.STRING, pattern = INSTANT_PATTERN, timezone = "UTC")
            Instant startedAt,
            @JsonFormat(shape = JsonFormat.Shape.STRING, pattern = INSTANT_PATTERN, timezone = "UTC")
            Instant finishedAt,
            int sentCount,
            int skippedCount,
            int failedCount,
            String error) {

        static BillingScheduleRunResponse of(BillingScheduleRun run) {
            return new BillingScheduleRunResponse(run.getPeriod(), run.getStartedAt(), run.getFinishedAt(),
                    run.getSentCount(), run.getSkippedCount(), run.getFailedCount(), run.getError());
        }
    }

    /**
     * ค่าตั้งเวลาพร้อมรอบถัดไปกับรอบล่าสุด
     * <p>
     * nextRunAt คิดที่ server ด้วยกฎชุดเดียวกับที่งานตั้งเวลาใช้ตัดสินจริง หน้าเว็บจึงโชว์ได้ตรงกับที่จะเกิด
     * เป็น null เมื่อปิดอยู่ ส่วน lastRun เป็น null เมื่อยังไม่เคยรัน
     */
    public record BillingScheduleResponse(
            boolean enabled,
            int dayOfMonth,
            /** "HH:MM" ตามเวลาไทย */
            String sendTime,
            @JsonFormat(shape = JsonFormat.Shape.STRING, pattern = INSTANT_PATTERN, timezone = "UTC")
            Instant updatedAt,
            @JsonFormat(shape = JsonFormat.Shape.STRING, pattern = INSTANT_PATTERN, timezone = "UTC")
            Instant nextRunAt,
            BillingScheduleRunResponse lastRun) {
    }
}
