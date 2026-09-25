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
}
