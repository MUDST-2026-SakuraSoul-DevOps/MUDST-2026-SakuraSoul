package com.sakurasoul.apartment.billingschedule;

import com.sakurasoul.apartment.billingschedule.BillingScheduleDtos.BillingScheduleRequest;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.YearMonth;
import java.time.ZoneId;
import java.time.ZonedDateTime;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * กฎของค่าตั้งเวลาเตือนใบค้างรายเดือน (SSK-143) ระดับฟังก์ชันล้วน ไม่แตะ database
 * <p>
 * ค่าที่คาดหวังทุกตัวคิดด้วยมือ และตรงกับ frontend/src/domain/scheduledBilling.test.ts ทุกเคส
 * ถ้าสองไฟล์นี้เริ่มคาดหวังคนละอย่าง แปลว่ากฎสองฝั่งหลุดจากกันแล้ว
 */
class BillingScheduleRulesTest {

    private static final ZoneId BANGKOK = ZoneId.of("Asia/Bangkok");

    @Test
    @DisplayName("SSK-143 ตรวจค่าทีละช่องตามลำดับฟอร์ม ข้อความตรงกับหน้าเว็บ")
    void validationMessagesFollowTheFormOrder() {
        assertThat(BillingScheduleRules.validate(new BillingScheduleRequest(null, 25, "09:00")))
                .isEqualTo("Please choose whether the schedule is enabled");
        assertThat(BillingScheduleRules.validate(new BillingScheduleRequest(true, null, "09:00")))
                .isEqualTo("Please choose the billing day");
        assertThat(BillingScheduleRules.validate(new BillingScheduleRequest(true, 0, "09:00")))
                .isEqualTo("Billing day must be between 1 and 31");
        assertThat(BillingScheduleRules.validate(new BillingScheduleRequest(true, 32, "09:00")))
                .isEqualTo("Billing day must be between 1 and 31");
        assertThat(BillingScheduleRules.validate(new BillingScheduleRequest(true, 25, " ")))
                .isEqualTo("Please choose the send time");
        assertThat(BillingScheduleRules.validate(new BillingScheduleRequest(true, 25, "25:00")))
                .isEqualTo("The send time must be in HH:MM format");
        assertThat(BillingScheduleRules.validate(new BillingScheduleRequest(false, 1, "00:00"))).isNull();
        assertThat(BillingScheduleRules.validate(new BillingScheduleRequest(true, 31, "23:59"))).isNull();
    }

    @Test
    @DisplayName("SSK-143 รับเวลาที่มีวินาทีได้ แต่เก็บแค่ระดับนาที")
    void sendTimeKeepsMinutesOnly() {
        assertThat(BillingScheduleRules.parseSendTime("09:00")).isEqualTo(LocalTime.of(9, 0));
        assertThat(BillingScheduleRules.parseSendTime("09:00:30")).isEqualTo(LocalTime.of(9, 0));
        assertThat(BillingScheduleRules.parseSendTime("9am")).isNull();
        assertThat(BillingScheduleRules.formatSendTime(LocalTime.of(7, 5))).isEqualTo("07:05");
    }

    @Test
    @DisplayName("SSK-143 วันเกินสิ้นเดือนใช้วันสุดท้ายของเดือน ก.พ. 2026 ได้ 28 และ ก.พ. 2028 ได้ 29")
    void dayIsClampedToTheEndOfShortMonths() {
        assertThat(slot(YearMonth.of(2026, 2), 31)).isEqualTo(bangkok(2026, 2, 28, 9, 0));
        assertThat(slot(YearMonth.of(2028, 2), 31)).isEqualTo(bangkok(2028, 2, 29, 9, 0));
        assertThat(slot(YearMonth.of(2026, 4), 31)).isEqualTo(bangkok(2026, 4, 30, 9, 0));
        assertThat(slot(YearMonth.of(2026, 1), 31)).isEqualTo(bangkok(2026, 1, 31, 9, 0));
    }

    @Test
    @DisplayName("SSK-143 09:00 เวลาไทยคือ 02:00 UTC")
    void slotIsInBangkokTime() {
        assertThat(slot(YearMonth.of(2026, 10), 25).toInstant()).isEqualTo(Instant.parse("2026-10-25T02:00:00Z"));
    }

    @Test
    @DisplayName("SSK-143 ปิดอยู่ไม่มีรอบถัดไปและไม่ถึงเวลาส่งเลย")
    void disabledScheduleNeverRuns() {
        BillingSchedule schedule = schedule(false, 25, "2026-09-01T00:00:00Z");

        assertThat(BillingScheduleRules.nextRunAt(schedule, false, bangkok(2026, 9, 25, 10, 0))).isEmpty();
        assertThat(BillingScheduleRules.isDue(schedule, false, bangkok(2026, 9, 25, 10, 0))).isFalse();
    }

    @Test
    @DisplayName("SSK-143 บันทึกก่อนรอบของเดือนนี้ รอบถัดไปคือรอบของเดือนนี้ และถึงเวลาพอดีที่เวลาตั้งไว้")
    void savedBeforeThisMonthsSlotRunsThisMonth() {
        BillingSchedule schedule = schedule(true, 25, "2026-09-20T03:00:00Z");

        assertThat(BillingScheduleRules.nextRunAt(schedule, false, bangkok(2026, 9, 20, 12, 0)))
                .contains(bangkok(2026, 9, 25, 9, 0));
        assertThat(BillingScheduleRules.isDue(schedule, false, bangkok(2026, 9, 25, 8, 59))).isFalse();
        assertThat(BillingScheduleRules.isDue(schedule, false, bangkok(2026, 9, 25, 9, 0))).isTrue();
    }

    /**
     * เปิดใช้วันที่ 26 โดยตั้งวันที่ 25 ต้องไม่ส่งทันที ถ้าไม่มีกฎข้อนี้ การกดเปิดครั้งแรกจะส่งอีเมลหาผู้เช่า
     * ทั้งตึกในนาทีถัดไปโดยที่แอดมินไม่ได้ตั้งใจ
     */
    @Test
    @DisplayName("SSK-143 บันทึกหลังรอบของเดือนนี้ไปแล้ว ไม่ส่งทันที รอรอบของเดือนหน้า")
    void savedAfterThisMonthsSlotWaitsForNextMonth() {
        BillingSchedule schedule = schedule(true, 25, "2026-09-26T03:00:00Z");
        ZonedDateTime now = bangkok(2026, 9, 26, 10, 1);

        assertThat(BillingScheduleRules.nextRunAt(schedule, false, now)).contains(bangkok(2026, 10, 25, 9, 0));
        assertThat(BillingScheduleRules.isDue(schedule, false, now)).isFalse();
    }

    @Test
    @DisplayName("SSK-143 เดือนนี้รันไปแล้ว รอบถัดไปคือเดือนหน้า ไม่ส่งซ้ำ")
    void alreadyRanThisMonthWaitsForNextMonth() {
        BillingSchedule schedule = schedule(true, 25, "2026-09-01T00:00:00Z");
        ZonedDateTime now = bangkok(2026, 9, 25, 9, 5);

        assertThat(BillingScheduleRules.nextRunAt(schedule, true, now)).contains(bangkok(2026, 10, 25, 9, 0));
        assertThat(BillingScheduleRules.isDue(schedule, true, now)).isFalse();
    }

    @Test
    @DisplayName("SSK-143 backend ดับตอนถึงเวลาแล้วเพิ่งกลับมาในเดือนเดียวกัน ยังส่งตามได้")
    void missedSlotIsCaughtUpWithinTheSameMonth() {
        BillingSchedule schedule = schedule(true, 25, "2026-09-01T00:00:00Z");
        ZonedDateTime backOnline = bangkok(2026, 9, 27, 14, 0);

        assertThat(BillingScheduleRules.nextRunAt(schedule, false, backOnline)).contains(bangkok(2026, 9, 25, 9, 0));
        assertThat(BillingScheduleRules.isDue(schedule, false, backOnline)).isTrue();
    }

    @Test
    @DisplayName("SSK-143 ตั้งวันที่ 31 เดือนกุมภาพันธ์ถึงรอบวันที่ 28 ไม่ใช่ข้ามไปมีนาคม")
    void day31RunsOnTheLastDayOfFebruary() {
        BillingSchedule schedule = schedule(true, 31, "2026-01-31T03:00:00Z");

        assertThat(BillingScheduleRules.nextRunAt(schedule, false, bangkok(2026, 2, 10, 9, 0)))
                .contains(bangkok(2026, 2, 28, 9, 0));
        assertThat(BillingScheduleRules.isDue(schedule, false, bangkok(2026, 2, 28, 9, 0))).isTrue();
    }

    @Test
    @DisplayName("SSK-143 เดือนของรอบคิดตามเวลาไทย ตีหนึ่งวันที่ 1 ต.ค. เวลาไทยนับเป็น ต.ค. ถึงตาม UTC จะยังเป็น ก.ย.")
    void periodFollowsBangkokTime() {
        ZonedDateTime firstOfOctober = bangkok(2026, 10, 1, 1, 0);

        assertThat(BillingScheduleRules.periodOf(firstOfOctober)).isEqualTo("2026-10");
    }

    private static ZonedDateTime slot(YearMonth month, int day) {
        return BillingScheduleRules.slotOf(month, day, LocalTime.of(9, 0), BANGKOK);
    }

    private static ZonedDateTime bangkok(int year, int month, int day, int hour, int minute) {
        return LocalDateTime.of(year, month, day, hour, minute).atZone(BANGKOK);
    }

    /** ค่าตั้งเวลาเวลา 09:00 ที่บันทึกไว้ ณ updatedAt (UTC) */
    static BillingSchedule schedule(boolean enabled, int dayOfMonth, String updatedAt) {
        BillingSchedule schedule = new BillingSchedule();
        schedule.apply(enabled, dayOfMonth, LocalTime.of(9, 0), Instant.parse(updatedAt));
        return schedule;
    }
}
