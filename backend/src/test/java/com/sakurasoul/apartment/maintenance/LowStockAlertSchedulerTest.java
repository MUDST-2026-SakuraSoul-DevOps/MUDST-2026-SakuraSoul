package com.sakurasoul.apartment.maintenance;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.scheduling.config.CronTask;
import org.springframework.scheduling.config.ScheduledTaskRegistrar;
import org.springframework.scheduling.support.SimpleTriggerContext;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.List;
import java.util.TimeZone;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verify;

/**
 * งานตั้งเวลาแจ้งเตือนของใกล้หมด (SSK-171) ที่ต้องเทสคือ "เมื่อไหร่" กับ "ส่งเวลาอะไรไปให้ service"
 * <p>
 * เวลาเทียบด้วยรอบถัดไปที่ trigger คิดจริง ไม่ใช่แค่ข้อความ cron ลืม zone แล้วงานคิดเวลาเป็น UTC เทสแรกจะแดงทันที
 */
@ExtendWith(MockitoExtension.class)
class LowStockAlertSchedulerTest {

    /** 07:00 ตามเวลาไทยของ 10 พ.ย. 2569 */
    private static final Instant SEVEN_AM_BANGKOK = Instant.parse("2026-11-10T00:00:00Z");

    @Mock
    private LowStockAlertService alertService;

    /**
     * CronTrigger ที่ไม่ได้ระบุ zone ใช้โซนของเครื่องตอนสร้าง เครื่องของทีมตั้งเป็นเวลาไทย การลืม zone จึงไม่เห็นผลบนเครื่องเรา
     * เทสนี้สร้างงานตอนที่โซนของ JVM เป็น UTC เหมือน container จริง ลืม zone เมื่อไหร่งานจะได้ 08:00 UTC แล้วเทสแดง
     */
    @Test
    @DisplayName("SSK-171 ค่าตั้งต้นตรวจแปดโมงเช้าตามเวลาไทย ไม่ใช่ตามโซนของเครื่องที่รัน")
    void theDefaultRunsAtEightInTheMorningBangkokTime() {
        TimeZone original = TimeZone.getDefault();
        CronTask task;
        try {
            TimeZone.setDefault(TimeZone.getTimeZone("UTC"));
            task = onlyTask(scheduler(null));
        } finally {
            TimeZone.setDefault(original);
        }

        assertThat(task.getExpression()).isEqualTo("0 0 8 * * *");
        assertThat(nextRunAfter(task, SEVEN_AM_BANGKOK)).isEqualTo(Instant.parse("2026-11-10T01:00:00Z"));
    }

    @Test
    @DisplayName("SSK-171 ตั้งเป็นทุกนาทีสำหรับเดโมได้ ค่าว่างได้ค่าตั้งต้น ไม่ทำให้แอปสตาร์ตไม่ขึ้น")
    void theCronComesFromTheProperties() {
        assertThat(nextRunAfter(onlyTask(scheduler("0 * * * * *")), SEVEN_AM_BANGKOK.plusSeconds(10)))
                .isEqualTo(SEVEN_AM_BANGKOK.plusSeconds(60));
        assertThat(onlyTask(scheduler("  ")).getExpression()).isEqualTo("0 0 8 * * *");
    }

    @Test
    @DisplayName("SSK-171 ตั้งเป็น - แล้วไม่มีงานถูกลงทะเบียน")
    void aDashDisablesTheJob() {
        ScheduledTaskRegistrar registrar = new ScheduledTaskRegistrar();

        scheduler("-").configureTasks(registrar);

        assertThat(registrar.getCronTaskList()).isEmpty();
    }

    @Test
    @DisplayName("SSK-171 ส่งเวลาปัจจุบันจาก Clock ให้ service")
    void passesTheCurrentInstantToTheService() {
        new LowStockAlertScheduler(alertService, new LowStockAlertProperties(null, null),
                Clock.fixed(SEVEN_AM_BANGKOK, ZoneId.of("Asia/Bangkok"))).alertLowStock();

        verify(alertService).run(SEVEN_AM_BANGKOK);
    }

    private LowStockAlertScheduler scheduler(String cron) {
        return new LowStockAlertScheduler(alertService, new LowStockAlertProperties(null, cron), Clock.systemUTC());
    }

    private static CronTask onlyTask(LowStockAlertScheduler scheduler) {
        ScheduledTaskRegistrar registrar = new ScheduledTaskRegistrar();
        scheduler.configureTasks(registrar);
        List<CronTask> tasks = registrar.getCronTaskList();
        assertThat(tasks).hasSize(1);
        return tasks.get(0);
    }

    private static Instant nextRunAfter(CronTask task, Instant now) {
        return task.getTrigger().nextExecution(new SimpleTriggerContext(Clock.fixed(now, ZoneOffset.UTC)));
    }
}
