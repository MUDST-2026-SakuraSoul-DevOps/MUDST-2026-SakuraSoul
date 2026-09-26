package com.sakurasoul.apartment.billingschedule;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.scheduling.annotation.Scheduled;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * งานตั้งเวลาเตือนใบค้าง (SSK-143) ตัวคลาสบางมาก ที่ต้องเทสคือ "เมื่อไหร่" กับ "ส่งเวลาอะไรไปให้ service"
 * <p>
 * ค่าใน @Scheduled เปลี่ยนแล้วไม่มีเทสไหนแดงเลยถ้าไม่มีเทสนี้ เช่นลืม zone แล้วงานคิดเวลาเป็น UTC
 * หรือเปลี่ยน cron เป็นทุกชั่วโมงแล้วเวลาที่ส่งจริงคลาดจากที่ตั้งไว้เกือบชั่วโมง
 */
@ExtendWith(MockitoExtension.class)
class BillingSchedulerTest {

    @Mock
    private BillingScheduleService billingScheduleService;

    @Test
    @DisplayName("SSK-143 งานตื่นทุกต้นนาทีตามเวลาไทย ไม่ใช่ตามโซนของเครื่องที่รัน")
    void runsAtTheStartOfEveryMinuteInBangkokTime() throws NoSuchMethodException {
        Scheduled scheduled = BillingScheduler.class.getMethod("sendRemindersIfDue").getAnnotation(Scheduled.class);

        assertThat(scheduled.cron()).isEqualTo("0 * * * * *");
        assertThat(scheduled.zone()).isEqualTo("Asia/Bangkok");
    }

    @Test
    @DisplayName("SSK-143 ส่งเวลาปัจจุบันตามเวลาไทยให้ service ตีหนึ่งวันที่ 1 ต.ค. ไทยต้องไม่กลายเป็นเดือน ก.ย.")
    void passesTheCurrentBangkokTimeToTheService() {
        Clock clock = Clock.fixed(Instant.parse("2026-09-30T18:00:00Z"), ZoneId.of("Asia/Bangkok"));
        when(billingScheduleService.runIfDue(any())).thenReturn(Optional.empty());

        new BillingScheduler(billingScheduleService, clock).sendRemindersIfDue();

        verify(billingScheduleService).runIfDue(ZonedDateTime.parse("2026-10-01T01:00+07:00[Asia/Bangkok]"));
    }

    /**
     * อาการที่เจอตอนซ้อมบน stack จริง tick ของ 06:55 ตื่นตอน 06:54:59 กว่า ๆ แล้วงานไปส่งตอน 06:56
     * tick ที่ตื่นเร็วต้องได้นาทีที่มันตั้งใจ ไม่ใช่นาทีก่อนหน้า
     */
    @Test
    @DisplayName("SSK-145 tick ที่ตื่นก่อนต้นนาทีไม่กี่มิลลิวินาทีได้นาทีที่ตั้งใจ ไม่ใช่นาทีก่อนหน้า")
    void aTickThatFiresAFewMillisecondsEarlyCountsAsTheIntendedMinute() {
        Clock clock = Clock.fixed(Instant.parse("2026-09-25T23:54:59.995Z"), ZoneId.of("Asia/Bangkok"));
        when(billingScheduleService.runIfDue(any())).thenReturn(Optional.empty());

        new BillingScheduler(billingScheduleService, clock).sendRemindersIfDue();

        verify(billingScheduleService).runIfDue(ZonedDateTime.parse("2026-09-26T06:55+07:00[Asia/Bangkok]"));
    }

    @Test
    @DisplayName("SSK-145 tick ของเที่ยงคืนวันที่ 1 ที่ตื่นเร็วยังเป็นของเดือนใหม่")
    void anEarlyMidnightTickBelongsToTheNewMonth() {
        Clock clock = Clock.fixed(Instant.parse("2026-09-30T16:59:59.998Z"), ZoneId.of("Asia/Bangkok"));
        when(billingScheduleService.runIfDue(any())).thenReturn(Optional.empty());

        new BillingScheduler(billingScheduleService, clock).sendRemindersIfDue();

        verify(billingScheduleService).runIfDue(ZonedDateTime.parse("2026-10-01T00:00+07:00[Asia/Bangkok]"));
    }

    @Test
    @DisplayName("SSK-145 tick ที่ตื่นช้า (เครื่องยุ่ง) ได้นาทีเดิมของมัน ไม่เลื่อนไปนาทีถัดไป")
    void aLateTickKeepsItsOwnMinute() {
        Clock clock = Clock.fixed(Instant.parse("2026-09-25T23:55:00.700Z"), ZoneId.of("Asia/Bangkok"));
        when(billingScheduleService.runIfDue(any())).thenReturn(Optional.empty());

        new BillingScheduler(billingScheduleService, clock).sendRemindersIfDue();

        verify(billingScheduleService).runIfDue(ZonedDateTime.parse("2026-09-26T06:55+07:00[Asia/Bangkok]"));
    }
}
