package com.sakurasoul.apartment.maintenance;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.scheduling.annotation.Scheduled;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verify;

/**
 * งานตั้งเวลาแจ้งเตือนของใกล้หมด (SSK-171) ตัวคลาสบางมาก ที่ต้องเทสคือ "เมื่อไหร่" กับ "ส่งเวลาอะไรไปให้ service"
 * ค่าตั้งต้นของ cron (แปดโมงเช้า) อ่านจาก application.yml จริงใน LowStockAlertApiTest
 */
@ExtendWith(MockitoExtension.class)
class LowStockAlertSchedulerTest {

    @Mock
    private LowStockAlertService alertService;

    @Test
    @DisplayName("SSK-171 เวลามาจาก app.supplies.low-stock-alert-cron และคิดตามเวลาไทย ไม่ใช่โซนของเครื่องที่รัน")
    void runsOnTheConfiguredCronInBangkokTime() throws NoSuchMethodException {
        Scheduled scheduled = LowStockAlertScheduler.class.getDeclaredMethod("alertLowStock")
                .getAnnotation(Scheduled.class);

        assertThat(scheduled.cron()).isEqualTo("${app.supplies.low-stock-alert-cron}");
        assertThat(scheduled.zone()).isEqualTo("Asia/Bangkok");
    }

    @Test
    @DisplayName("SSK-171 ส่งเวลาปัจจุบันจาก Clock ให้ service")
    void passesTheCurrentInstantToTheService() {
        Instant now = Instant.parse("2026-11-10T01:00:00Z");

        new LowStockAlertScheduler(alertService, Clock.fixed(now, ZoneId.of("Asia/Bangkok"))).alertLowStock();

        verify(alertService).run(now);
    }
}
