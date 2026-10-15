package com.sakurasoul.apartment.billingschedule;

import com.sakurasoul.apartment.billing.ReceiptDispatchService;
import com.sakurasoul.apartment.billing.ReceiptDtos.SendReceiptsResponse;
import com.sakurasoul.apartment.billing.ReceiptDtos.SentReceipt;
import com.sakurasoul.apartment.billing.ReceiptDtos.SkipReason;
import com.sakurasoul.apartment.billing.ReceiptDtos.SkippedReceipt;
import com.sakurasoul.apartment.billingschedule.BillingScheduleDtos.BillingScheduleRequest;
import com.sakurasoul.apartment.billingschedule.BillingScheduleDtos.BillingScheduleResponse;
import com.sakurasoul.apartment.common.MailUnavailableException;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.mail.MailSendException;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.SimpleTransactionStatus;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * ค่าตั้งเวลากับรอบเตือนใบค้างรายเดือน (SSK-143) ระดับ logic ล้วน ปลอม repository กับตัวส่งอีเมล
 * <p>
 * นาฬิกาตรึงไว้ที่ 25 ก.ย. 2026 09:00 เวลาไทย ซึ่งคือเวลาของรอบพอดีของค่าตั้ง "วันที่ 25 เวลา 09:00"
 * ส่วนการกันสอง pod ของจริงอยู่ที่ billing_schedule_run_period_uk ใน PostgreSQL พิสูจน์ที่ BillingScheduleApiTest
 */
@ExtendWith(MockitoExtension.class)
class BillingScheduleServiceTest {

    private static final ZoneId BANGKOK = ZoneId.of("Asia/Bangkok");
    private static final Instant NOW = Instant.parse("2026-09-25T02:00:00Z");
    private static final Clock CLOCK = Clock.fixed(NOW, BANGKOK);

    @Mock
    private BillingScheduleRepository scheduleRepository;

    @Mock
    private BillingScheduleRunRepository runRepository;

    @Mock
    private ReceiptDispatchService receiptDispatchService;

    @Mock
    private PlatformTransactionManager transactionManager;

    @Test
    @DisplayName("SSK-143 ค่าที่ผิดได้ข้อความเตือน และไม่แตะแถวค่าตั้งเวลา")
    void invalidUpdateIsRejectedBeforeLoading() {
        assertThatThrownBy(() -> service().update(new BillingScheduleRequest(true, 32, "09:00")))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("Billing day must be between 1 and 31");
        verify(scheduleRepository, never()).saveAndFlush(any());
    }

    @Test
    @DisplayName("SSK-143 บันทึกแล้วได้เวลาปัจจุบันระดับมิลลิวินาที และรอบถัดไปคิดจากค่าใหม่")
    void updateStoresTheScheduleAndReportsTheNextRun() {
        BillingSchedule stored = BillingScheduleRulesTest.schedule(false, 25, "2026-09-01T00:00:00Z");
        when(scheduleRepository.findById((short) 1)).thenReturn(Optional.of(stored));
        when(runRepository.existsByPeriod("2026-09")).thenReturn(false);
        when(runRepository.findTopByOrderByStartedAtDesc()).thenReturn(Optional.empty());

        BillingScheduleResponse response = service().update(new BillingScheduleRequest(true, 28, "10:30:45"));

        assertThat(stored.isEnabled()).isTrue();
        assertThat(stored.getDayOfMonth()).isEqualTo(28);
        assertThat(stored.getSendTime()).isEqualTo(LocalTime.of(10, 30));
        assertThat(stored.getUpdatedAt()).isEqualTo(NOW);
        assertThat(response.sendTime()).isEqualTo("10:30");
        // วันที่ 28 เวลา 10:30 ของเดือนนี้ยังมาไม่ถึง และอยู่หลังเวลาที่บันทึก จึงเป็นรอบของเดือนนี้
        assertThat(response.nextRunAt()).isEqualTo(Instant.parse("2026-09-28T03:30:00Z"));
        assertThat(response.lastRun()).isNull();
    }

    @Test
    @DisplayName("SSK-143 ยังไม่ถึงรอบ ไม่จองเดือนและไม่ส่งอะไร")
    void notDueDoesNothing() {
        openTransaction();
        BillingSchedule schedule = BillingScheduleRulesTest.schedule(true, 26, "2026-09-01T00:00:00Z");
        when(scheduleRepository.findById((short) 1)).thenReturn(Optional.of(schedule));

        assertThat(service().runIfDue(ZonedDateTime.now(CLOCK))).isEmpty();

        verify(runRepository, never()).saveAndFlush(any());
        verify(receiptDispatchService, never()).sendAllPending();
    }

    @Test
    @DisplayName("SSK-143 ถึงรอบแล้วจองเดือนก่อนส่ง แล้วปิดรอบพร้อมจำนวนที่ส่ง ข้าม และส่งไม่ออก")
    void dueRunClaimsTheMonthThenRecordsTheOutcome() {
        openTransaction();
        dueSchedule();
        AtomicReference<BillingScheduleRun> claim = claimSucceeds();
        when(receiptDispatchService.sendAllPending()).thenReturn(new SendReceiptsResponse(
                List.of(sent(1), sent(2)),
                List.of(skipped(3, SkipReason.NO_EMAIL), skipped(4, SkipReason.SEND_FAILED))));

        Optional<BillingScheduleRun> run = service().runIfDue(ZonedDateTime.now(CLOCK));

        BillingScheduleRun claimed = claim.get();
        assertThat(run).containsSame(claimed);
        assertThat(claimed.getPeriod()).isEqualTo("2026-09");
        assertThat(claimed.getStartedAt()).isEqualTo(NOW);
        assertThat(claimed.getFinishedAt()).isEqualTo(NOW);
        assertThat(claimed.getSentCount()).isEqualTo(2);
        assertThat(claimed.getSkippedCount()).isEqualTo(1);
        assertThat(claimed.getFailedCount()).isEqualTo(1);
        assertThat(claimed.getError()).isNull();
    }

    @Test
    @DisplayName("SSK-143 pod อื่นจองเดือนนี้ไปแล้ว ข้ามไปโดยไม่ส่งอะไรเลย")
    void losingTheClaimSendsNothing() {
        openTransaction();
        dueSchedule();
        when(runRepository.saveAndFlush(any())).thenThrow(
                new DataIntegrityViolationException("duplicate key value violates billing_schedule_run_period_uk"));

        assertThat(service().runIfDue(ZonedDateTime.now(CLOCK))).isEmpty();

        verify(receiptDispatchService, never()).sendAllPending();
    }

    @Test
    @DisplayName("SSK-143 เมลเซิร์ฟเวอร์ล่มทั้งรอบ ปิดรอบพร้อมข้อความ error ไม่โยนออกไปให้แถวค้าง")
    void mailServerDownIsRecordedOnTheRun() {
        openTransaction();
        dueSchedule();
        AtomicReference<BillingScheduleRun> claim = claimSucceeds();
        when(receiptDispatchService.sendAllPending())
                .thenThrow(new MailUnavailableException(new MailSendException("connection refused")));

        service().runIfDue(ZonedDateTime.now(CLOCK));

        BillingScheduleRun claimed = claim.get();
        assertThat(claimed.getFinishedAt()).isEqualTo(NOW);
        assertThat(claimed.getSentCount()).isZero();
        assertThat(claimed.getError()).isEqualTo("The mail server is not reachable. Please try again later");
    }

    @Test
    @DisplayName("SSK-143 พังด้วยเหตุผลอื่นระหว่างส่ง ยังปิดรอบพร้อมข้อความกลาง ๆ รายละเอียดอยู่ใน log")
    void unexpectedFailureIsRecordedOnTheRun() {
        openTransaction();
        dueSchedule();
        AtomicReference<BillingScheduleRun> claim = claimSucceeds();
        when(receiptDispatchService.sendAllPending()).thenThrow(new IllegalStateException("font cache is broken"));

        service().runIfDue(ZonedDateTime.now(CLOCK));

        BillingScheduleRun claimed = claim.get();
        assertThat(claimed.getFinishedAt()).isEqualTo(NOW);
        assertThat(claimed.getError()).isEqualTo(BillingScheduleService.UNEXPECTED_ERROR);
    }

    private BillingScheduleService service() {
        return new BillingScheduleService(scheduleRepository, runRepository, receiptDispatchService, CLOCK,
                transactionManager);
    }

    /** ReceiptServiceTest ทำแบบเดียวกัน TransactionTemplate ต้องได้สถานะเปล่า ๆ ไม่งั้นพังก่อนถึง logic */
    private void openTransaction() {
        when(transactionManager.getTransaction(any())).thenReturn(new SimpleTransactionStatus());
    }

    /** วันที่ 25 เวลา 09:00 บันทึกไว้ตั้งแต่ต้นเดือน เดือนนี้ยังไม่เคยรัน นาฬิกาอยู่ที่เวลาของรอบพอดี */
    private void dueSchedule() {
        BillingSchedule schedule = BillingScheduleRulesTest.schedule(true, 25, "2026-09-01T00:00:00Z");
        when(scheduleRepository.findById((short) 1)).thenReturn(Optional.of(schedule));
        when(runRepository.existsByPeriod("2026-09")).thenReturn(false);
    }

    /**
     * การจองสำเร็จ repository ติด id ให้แถวแล้วคืนตัวเดิม และหาแถวเดิมเจอตอนปิดรอบ
     * แถวที่ถูกจองเกิดตอน runIfDue เรียก saveAndFlush เท่านั้น จึงคืนเป็นกล่องที่เทสเปิดดูได้หลังเรียกแล้ว
     */
    private AtomicReference<BillingScheduleRun> claimSucceeds() {
        AtomicReference<BillingScheduleRun> claimed = new AtomicReference<>();
        when(runRepository.saveAndFlush(any())).thenAnswer(invocation -> {
            BillingScheduleRun run = invocation.getArgument(0);
            if (run.getId() == null) {
                ReflectionTestUtils.setField(run, "id", 7L);
                claimed.set(run);
            }
            return run;
        });
        when(runRepository.findById(7L)).thenAnswer(invocation -> Optional.ofNullable(claimed.get()));
        return claimed;
    }

    private static SentReceipt sent(long id) {
        return new SentReceipt(id, "RC-2026-000" + id, "Tenant " + id, "tenant" + id + "@example.com", NOW, 1);
    }

    private static SkippedReceipt skipped(long id, SkipReason reason) {
        return new SkippedReceipt(id, "RC-2026-000" + id, "Tenant " + id, reason);
    }
}
