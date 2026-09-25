package com.sakurasoul.apartment.billingschedule;

import com.sakurasoul.apartment.billing.ReceiptDispatchService;
import com.sakurasoul.apartment.billing.ReceiptDtos.SendReceiptsResponse;
import com.sakurasoul.apartment.billing.ReceiptDtos.SkipReason;
import com.sakurasoul.apartment.billingschedule.BillingScheduleDtos.BillingScheduleRequest;
import com.sakurasoul.apartment.billingschedule.BillingScheduleDtos.BillingScheduleResponse;
import com.sakurasoul.apartment.billingschedule.BillingScheduleDtos.BillingScheduleRunResponse;
import com.sakurasoul.apartment.common.MailUnavailableException;
import com.sakurasoul.apartment.common.NotFoundException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Clock;
import java.time.Instant;
import java.time.ZonedDateTime;
import java.time.temporal.ChronoUnit;
import java.util.Optional;

/**
 * ค่าตั้งเวลาเตือนใบค้างรายเดือน และรอบเตือนที่งานตั้งเวลาเรียกทุกนาที (SSK-143)
 * <p>
 * "ตอนนี้" มาจาก Clock ที่ฉีดเข้ามา (config.SchedulingConfig) เทสจึงตรึงเวลาได้
 */
@Service
public class BillingScheduleService {

    private static final Logger log = LoggerFactory.getLogger(BillingScheduleService.class);

    /** ตารางนี้มีแถวเดียวเสมอ id ถูกล็อกไว้ด้วย CHECK constraint ใน V15 */
    private static final short SINGLETON_ID = 1;

    /** ข้อความเก็บลงแถวของรอบ เมื่อรอบนั้นพังด้วยเหตุผลอื่นที่ไม่ใช่เมลเซิร์ฟเวอร์ รายละเอียดจริงอยู่ใน log */
    static final String UNEXPECTED_ERROR = "The reminders could not be sent. See the server log for details";

    private final BillingScheduleRepository scheduleRepository;
    private final BillingScheduleRunRepository runRepository;
    private final ReceiptDispatchService receiptDispatchService;
    private final Clock clock;

    /** อ่านค่าตั้งเวลาเพื่อตัดสินว่าถึงรอบหรือยัง */
    private final TransactionTemplate readTransaction;

    /**
     * จองเดือนกับปิดรอบ แต่ละขั้นเป็น transaction ของตัวเอง (REQUIRES_NEW)
     * <p>
     * การจองต้อง commit ให้เสร็จก่อนเริ่มส่ง pod อีกตัวถึงจะเห็นว่าเดือนนี้ถูกจองแล้ว ถ้าจองกับส่งอยู่ใน
     * transaction เดียวกัน อีก pod จะรอล็อกจนส่งเสร็จ หรือหนักกว่านั้นคือถ้า transaction มา rollback ทีหลัง
     * อีเมลที่ออกไปแล้วจะไม่มีแถวไหนบอกว่าเดือนนี้ส่งไปแล้ว แล้วรอบถัดไปจะส่งซ้ำ
     */
    private final TransactionTemplate newTransaction;

    public BillingScheduleService(BillingScheduleRepository scheduleRepository,
            BillingScheduleRunRepository runRepository, ReceiptDispatchService receiptDispatchService,
            Clock clock, PlatformTransactionManager transactionManager) {
        this.scheduleRepository = scheduleRepository;
        this.runRepository = runRepository;
        this.receiptDispatchService = receiptDispatchService;
        this.clock = clock;
        this.readTransaction = new TransactionTemplate(transactionManager);
        this.readTransaction.setReadOnly(true);
        this.newTransaction = new TransactionTemplate(transactionManager);
        this.newTransaction.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    }

    @Transactional(readOnly = true)
    public BillingScheduleResponse get() {
        return response(load(), ZonedDateTime.now(clock));
    }

    /**
     * ตั้งค่าใหม่ทั้งชุด ค่าใหม่มีผลตั้งแต่รอบแรกหลังเวลานี้ (ดู BillingScheduleRules.nextRunAt)
     * <p>
     * ตัดเวลาเหลือมิลลิวินาทีด้วยเหตุผลเดียวกับ ApartmentConfigService คือรูปแบบ JSON ที่ตกลงไว้มีสามตำแหน่ง
     */
    @Transactional
    public BillingScheduleResponse update(BillingScheduleRequest request) {
        String invalid = BillingScheduleRules.validate(request);
        if (invalid != null) {
            throw new IllegalArgumentException(invalid);
        }

        BillingSchedule schedule = load();
        schedule.apply(request.enabled(), request.dayOfMonth(), BillingScheduleRules.parseSendTime(request.sendTime()),
                Instant.now(clock).truncatedTo(ChronoUnit.MILLIS));
        scheduleRepository.saveAndFlush(schedule);

        return response(schedule, ZonedDateTime.now(clock));
    }

    /**
     * รอบเตือนของเดือนนี้ ถ้าถึงเวลาแล้ว งานตั้งเวลาเรียกทุกนาที (BillingScheduler)
     * <p>
     * ลำดับคือ อ่านว่าถึงรอบไหม แล้วจองเดือนนี้ด้วยการแทรกแถวรอบ แล้วส่งนอก transaction แล้วปิดรอบพร้อมผล
     * pod ที่แทรกแถวไม่ผ่านเพราะ billing_schedule_run_period_uk คือตัวที่แพ้ ข้ามไปโดยไม่ส่งอะไร
     * <p>
     * ถ้าทั้งรอบส่งไม่ออก (เมลเซิร์ฟเวอร์ล่ม) ยังปิดรอบตามปกติพร้อมเก็บข้อความ error ไว้ และจะไม่รันซ้ำเองในเดือนนั้น
     * แอดมินเห็นในหน้าเว็บแล้วกด Send All Invoices เองได้ ดูเหตุผลใน docs/api-contract-billing.md
     *
     * @param now เวลาปัจจุบันตามเวลาไทย ใช้ตัดสินว่าถึงรอบไหมและรอบนี้เป็นของเดือนไหน
     * @return รอบที่เพิ่งทำเสร็จ หรือว่างถ้ายังไม่ถึงรอบหรือ pod อื่นจองไปแล้ว
     */
    public Optional<BillingScheduleRun> runIfDue(ZonedDateTime now) {
        String period = BillingScheduleRules.periodOf(now);
        boolean due = Boolean.TRUE.equals(readTransaction.execute(status ->
                BillingScheduleRules.isDue(load(), runRepository.existsByPeriod(period), now)));
        if (!due) {
            return Optional.empty();
        }

        BillingScheduleRun claimed;
        try {
            claimed = newTransaction.execute(status ->
                    runRepository.saveAndFlush(BillingScheduleRun.claim(period, Instant.now(clock))));
        } catch (DataIntegrityViolationException ex) {
            log.info("รอบเตือนใบค้างของเดือน {} มี pod อื่นจองไปแล้ว ข้ามไป", period);
            return Optional.empty();
        }

        Outcome outcome = sendReminders(period);
        BillingScheduleRun finished = newTransaction.execute(status -> {
            BillingScheduleRun run = runRepository.findById(claimed.getId())
                    .orElseThrow(() -> new IllegalStateException("The claimed run " + period + " disappeared"));
            run.finish(Instant.now(clock), outcome.sent(), outcome.skipped(), outcome.failed(), outcome.error());
            return runRepository.saveAndFlush(run);
        });
        log.info("รอบเตือนใบค้างของเดือน {}: ส่ง {} ใบ ข้าม {} ใบ ส่งไม่ออก {} ใบ{}", period, outcome.sent(),
                outcome.skipped(), outcome.failed(), outcome.error() == null ? "" : " (" + outcome.error() + ")");
        return Optional.ofNullable(finished);
    }

    /**
     * ส่งเตือนทุกใบที่ยังค้าง แล้วนับผลเก็บลงแถวของรอบ
     * <p>
     * ดัก error ทุกแบบไว้ที่นี่ เพื่อให้รอบถูกปิดพร้อมข้อความเสมอ ถ้าหลุดออกไป แถวของเดือนนี้จะค้างไว้โดยไม่มี
     * finishedAt และหน้าเว็บจะบอกอะไรแอดมินไม่ได้เลย
     */
    private Outcome sendReminders(String period) {
        try {
            SendReceiptsResponse result = receiptDispatchService.sendAllPending();
            int skipped = (int) result.skipped().stream().filter(s -> s.reason() == SkipReason.NO_EMAIL).count();
            int failed = (int) result.skipped().stream().filter(s -> s.reason() == SkipReason.SEND_FAILED).count();
            return new Outcome(result.sent().size(), skipped, failed, null);
        } catch (MailUnavailableException ex) {
            log.warn("รอบเตือนใบค้างของเดือน {} ส่งไม่ออกเลย เมลเซิร์ฟเวอร์ติดต่อไม่ได้", period, ex);
            return new Outcome(0, 0, 0, ex.getMessage());
        } catch (RuntimeException ex) {
            log.error("รอบเตือนใบค้างของเดือน {} พังระหว่างส่ง", period, ex);
            return new Outcome(0, 0, 0, UNEXPECTED_ERROR);
        }
    }

    private BillingScheduleResponse response(BillingSchedule schedule, ZonedDateTime now) {
        boolean ranThisMonth = runRepository.existsByPeriod(BillingScheduleRules.periodOf(now));
        Instant nextRunAt = BillingScheduleRules.nextRunAt(schedule, ranThisMonth, now)
                .map(ZonedDateTime::toInstant)
                .orElse(null);
        BillingScheduleRunResponse lastRun = runRepository.findTopByOrderByStartedAtDesc()
                .map(BillingScheduleRunResponse::of)
                .orElse(null);
        return new BillingScheduleResponse(schedule.isEnabled(), schedule.getDayOfMonth(),
                BillingScheduleRules.formatSendTime(schedule.getSendTime()), schedule.getUpdatedAt(), nextRunAt,
                lastRun);
    }

    /**
     * แถวเดียวของตารางนี้ถูกใส่ไว้ตั้งแต่ V15 ถ้าหาไม่เจอแปลว่ามีคนลบทิ้งหรือ migration ไม่ได้รัน
     * ต้องดังออกมาเป็น 404 ให้เห็น ไม่ใช่เงียบแล้วสร้างใหม่ เหตุผลเดียวกับ ApartmentConfigService
     */
    private BillingSchedule load() {
        return scheduleRepository.findById(SINGLETON_ID)
                .orElseThrow(() -> new NotFoundException(
                        "No billing schedule in the database. Check that migration V15 has run"));
    }

    /** ผลของรอบหนึ่งรอบ error เป็น null เมื่อส่งได้ตามปกติ */
    private record Outcome(int sent, int skipped, int failed, String error) {
    }
}
