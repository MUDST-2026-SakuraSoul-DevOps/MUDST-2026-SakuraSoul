package com.sakurasoul.apartment.billingschedule;

import com.jayway.jsonpath.JsonPath;
import com.sakurasoul.apartment.RecordingMailSender;
import com.sakurasoul.apartment.TestcontainersConfiguration;
import com.sakurasoul.apartment.billing.ReceiptRepository;
import com.sakurasoul.apartment.lease.LeaseRepository;
import com.sakurasoul.apartment.tenant.Tenant;
import com.sakurasoul.apartment.tenant.TenantRepository;
import jakarta.mail.internet.InternetAddress;
import jakarta.mail.internet.MimeMessage;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIf;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.testcontainers.DockerClientFactory;

import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.matchesPattern;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * ค่าตั้งเวลาเตือนใบค้างรายเดือนกับรอบเตือน (SSK-143) ระดับ HTTP และ service ทะลุถึง PostgreSQL ตัวจริง
 * <p>
 * สิ่งที่พิสูจน์ได้เฉพาะชั้นนี้คือการกันสอง pod รันเดือนเดียวกัน ซึ่งพึ่ง billing_schedule_run_period_uk
 * ของจริงในฐานข้อมูล เทสนี้ปล่อยสองเธรดเรียก runIfDue พร้อมกันเหมือนสอง pod ตื่นในวินาทีเดียวกัน
 *
 * <h2>ทำไมรอบในเทสเป็นของปี 2099</h2>
 * งานตั้งเวลาตัวจริง (BillingScheduler) ก็ตื่นทุกนาทีอยู่ใน context ของเทสด้วย ถ้าเทสตั้งค่าให้ถึงรอบตามเวลาจริง
 * งานตัวจริงอาจแย่งจองเดือนนั้นไปก่อนแล้วเทสแกว่ง เทสจึงตั้งวันที่ 1 เวลา 00:00 ซึ่งรอบของเดือนจริงอยู่ก่อนเวลา
 * ที่บันทึกเสมอ (งานตัวจริงจึงรอเดือนหน้า) แล้วสั่ง runIfDue ด้วย "ตอนนี้" ของ 1 ม.ค. 2099 ที่ถึงรอบแน่นอน
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
@EnabledIf("dockerAvailable")
// ทุก endpoint ต้องล็อกอินแล้วตั้งแต่ SSK-28 ชุดนี้จึงยิงในนามผู้ใช้ปลอม
@WithMockUser
class BillingScheduleApiTest {

    /** ห้อง 107 กับ 108 มาจาก migration V2 ไม่ชนกับห้องที่เทสคลาสอื่นใช้ */
    private static final long ROOM_107 = 7L;
    private static final long ROOM_108 = 8L;

    private static final String EMAIL = "manee.remind@example.com";
    private static final ZonedDateTime DUE_NOW =
            LocalDateTime.of(2099, 1, 1, 0, 5).atZone(ZoneId.of("Asia/Bangkok"));

    private static final String LEASE_BODY = """
            {"roomId":%d,"tenantId":%d,"startDate":"2026-09-01","endDate":null,\
            "monthlyRent":3500,"billingCycle":"MONTHLY","securityDeposit":7000,\
            "electricRatePerUnit":9.5,"waterRatePerUnit":20,\
            "commonAreaFee":350,"internetFee":0}""";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private BillingScheduleService billingScheduleService;

    @Autowired
    private BillingScheduleRunRepository runRepository;

    @Autowired
    private RecordingMailSender mailSender;

    @Autowired
    private ReceiptRepository receiptRepository;

    @Autowired
    private LeaseRepository leaseRepository;

    @Autowired
    private TenantRepository tenantRepository;

    private final List<Tenant> tenants = new ArrayList<>();

    static boolean dockerAvailable() {
        return DockerClientFactory.instance().isDockerAvailable();
    }

    @BeforeEach
    void resetMailbox() {
        mailSender.reset();
    }

    /**
     * คืนค่าตั้งเวลาเป็นค่าที่ V15 ใส่ไว้ (ปิด วันที่ 25 09:00) ลบรอบทุกแถว แล้วลบใบเสร็จ สัญญา ผู้เช่าของเทส
     * ตามลำดับ foreign key container ตัวนี้ใช้ร่วมกับเทสคลาสอื่น ค่าที่ค้างไว้จะทำให้คลาสอื่นแกว่ง
     * แนบผู้ใช้กับคำขอตรง ๆ เหตุผลเดียวกับ ReceiptApiTest
     */
    @AfterEach
    void restoreDefaults() throws Exception {
        mockMvc.perform(put("/api/billing-schedule")
                        .with(user("admin"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"enabled":false,"dayOfMonth":25,"sendTime":"09:00"}"""))
                .andExpect(status().isOk());
        runRepository.deleteAll();
        receiptRepository.deleteAll();
        leaseRepository.deleteAll();
        tenantRepository.deleteAll(tenants);
        tenants.clear();
        mailSender.reset();
    }

    @Test
    @DisplayName("SSK-143 ค่าตั้งต้นจาก V15 คือปิด วันที่ 25 เวลา 09:00 ไม่มีรอบถัดไปและยังไม่เคยรัน")
    void defaultScheduleIsOffWithNoRuns() throws Exception {
        mockMvc.perform(get("/api/billing-schedule"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.enabled").value(false))
                .andExpect(jsonPath("$.dayOfMonth").value(25))
                .andExpect(jsonPath("$.sendTime").value("09:00"))
                .andExpect(jsonPath("$.nextRunAt").isEmpty())
                .andExpect(jsonPath("$.lastRun").isEmpty());
    }

    @Test
    @DisplayName("SSK-143 บันทึกค่าใหม่แล้ว GET เห็นค่าเดิม และได้รอบถัดไปที่ server คิด")
    void savedScheduleIsReadBackWithTheNextRun() throws Exception {
        save("""
                {"enabled":true,"dayOfMonth":22,"sendTime":"10:30:59"}""")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.enabled").value(true))
                .andExpect(jsonPath("$.sendTime").value("10:30"))
                .andExpect(jsonPath("$.updatedAt").value(matchesPattern(
                        "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z$")))
                .andExpect(jsonPath("$.nextRunAt").value(matchesPattern("^\\d{4}-\\d{2}-22T03:30:00\\.000Z$")));

        mockMvc.perform(get("/api/billing-schedule"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.enabled").value(true))
                .andExpect(jsonPath("$.dayOfMonth").value(22))
                .andExpect(jsonPath("$.sendTime").value("10:30"));
    }

    @Test
    @DisplayName("SSK-143 ค่าที่ผิดได้ 400 พร้อมข้อความเดียวกับหน้าเว็บ และค่าเดิมไม่เปลี่ยน")
    void invalidSchedulesAreRejected() throws Exception {
        expectBadRequest("""
                {"dayOfMonth":25,"sendTime":"09:00"}""", "Please choose whether the schedule is enabled");
        expectBadRequest("""
                {"enabled":true,"sendTime":"09:00"}""", "Please choose the billing day");
        expectBadRequest("""
                {"enabled":true,"dayOfMonth":0,"sendTime":"09:00"}""", "Billing day must be between 1 and 31");
        expectBadRequest("""
                {"enabled":true,"dayOfMonth":32,"sendTime":"09:00"}""", "Billing day must be between 1 and 31");
        expectBadRequest("""
                {"enabled":true,"dayOfMonth":25}""", "Please choose the send time");
        expectBadRequest("""
                {"enabled":true,"dayOfMonth":25,"sendTime":"25:00"}""", "The send time must be in HH:MM format");

        mockMvc.perform(get("/api/billing-schedule"))
                .andExpect(jsonPath("$.enabled").value(false))
                .andExpect(jsonPath("$.dayOfMonth").value(25));
    }

    /**
     * ใบค้างของผู้เช่าที่มีอีเมลได้เตือน ใบค้างของคนไม่มีอีเมลถูกข้าม และใบที่จ่ายแล้วไม่ถูกส่ง
     * แล้ว GET ต้องเห็นผลรอบนี้เป็น lastRun
     */
    @Test
    @DisplayName("SSK-143 รอบเตือนส่งเฉพาะใบค้างของคนที่มีอีเมล ไม่ส่งใบที่จ่ายแล้ว และบันทึกผลเป็นรอบล่าสุด")
    void dueRunRemindsOnlyUnpaidReceiptsOfTenantsWithEmail() throws Exception {
        seedReceipts();
        enableDueSchedule();

        Optional<BillingScheduleRun> run = billingScheduleService.runIfDue(DUE_NOW);

        assertThat(run).isPresent();
        assertThat(run.get().getPeriod()).isEqualTo("2099-01");
        assertThat(run.get().getSentCount()).isEqualTo(1);
        assertThat(run.get().getSkippedCount()).isEqualTo(1);
        assertThat(run.get().getFailedCount()).isZero();
        assertThat(run.get().getError()).isNull();
        assertThat(mailSender.sent()).singleElement().satisfies(mail -> {
            assertThat(((InternetAddress) mail.getAllRecipients()[0]).getAddress()).isEqualTo(EMAIL);
            assertThat(mail.getSubject()).contains("for Oct 2026").doesNotContain("paid");
        });

        mockMvc.perform(get("/api/billing-schedule"))
                .andExpect(jsonPath("$.lastRun.period").value("2099-01"))
                .andExpect(jsonPath("$.lastRun.sentCount").value(1))
                .andExpect(jsonPath("$.lastRun.skippedCount").value(1))
                .andExpect(jsonPath("$.lastRun.failedCount").value(0))
                .andExpect(jsonPath("$.lastRun.finishedAt").isNotEmpty())
                .andExpect(jsonPath("$.lastRun.error").isEmpty());

        // เดือนเดิมถึงเวลาอีกรอบก็ต้องไม่ส่งซ้ำ
        assertThat(billingScheduleService.runIfDue(DUE_NOW.plusMinutes(1))).isEmpty();
        assertThat(mailSender.sent()).hasSize(1);
    }

    /**
     * สอง pod ตื่นในวินาทีเดียวกันแล้วเห็นว่าถึงรอบทั้งคู่ ต้องมีตัวเดียวที่จองเดือนนั้นได้และส่งจริง
     * ปล่อยพร้อมกันด้วย CountDownLatch แบบเดียวกับ ReceiptApiTest
     */
    @Test
    @DisplayName("SSK-143 สอง pod สั่งรอบเดียวกันพร้อมกัน ส่งจริงตัวเดียว เดือนนั้นมีแถวรอบเดียว")
    void twoPodsDueAtTheSameTimeSendOnce() throws Exception {
        seedReceipts();
        enableDueSchedule();

        CountDownLatch start = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(2);
        List<Boolean> ran = new ArrayList<>();
        try {
            List<Future<Boolean>> results = new ArrayList<>();
            for (int i = 0; i < 2; i++) {
                results.add(pool.submit(() -> {
                    start.await();
                    return billingScheduleService.runIfDue(DUE_NOW).isPresent();
                }));
            }
            start.countDown();
            for (Future<Boolean> result : results) {
                ran.add(result.get(60, TimeUnit.SECONDS));
            }
        } finally {
            pool.shutdownNow();
        }

        assertThat(ran).containsExactlyInAnyOrder(true, false);
        assertThat(runRepository.findAll()).filteredOn(run -> run.getPeriod().equals("2099-01")).hasSize(1);
        assertThat(mailSender.sent()).hasSize(1);
    }

    @Test
    @DisplayName("SSK-143 เมลเซิร์ฟเวอร์ล่มทั้งรอบ รอบถูกปิดพร้อมข้อความ error และเดือนนั้นไม่รันซ้ำเอง")
    void mailServerDownIsRecordedAndNotRetried() throws Exception {
        seedReceipts();
        enableDueSchedule();
        mailSender.failAfter(0);

        Optional<BillingScheduleRun> run = billingScheduleService.runIfDue(DUE_NOW);

        assertThat(run).isPresent();
        assertThat(run.get().getFinishedAt()).isNotNull();
        assertThat(run.get().getError()).isEqualTo("The mail server is not reachable. Please try again later");
        mockMvc.perform(get("/api/billing-schedule"))
                .andExpect(jsonPath("$.lastRun.error").value("The mail server is not reachable. Please try again later"));

        mailSender.reset();
        assertThat(billingScheduleService.runIfDue(DUE_NOW.plusMinutes(1))).isEmpty();
        assertThat(mailSender.sent()).isEmpty();
    }

    /** เปิดใช้วันที่ 1 เวลา 00:00 ดูเหตุผลที่คอมเมนต์ของคลาส */
    private void enableDueSchedule() throws Exception {
        save("""
                {"enabled":true,"dayOfMonth":1,"sendTime":"00:00"}""")
                .andExpect(status().isOk());
    }

    /**
     * ผู้เช่าที่มีอีเมลมีใบที่จ่ายแล้ว (ก.ย.) กับใบค้าง (ต.ค.) ผู้เช่าที่ไม่มีอีเมลมีใบค้างหนึ่งใบ
     * เลขบัตรขึ้นต้นด้วย 17 เพื่อไม่ให้ชนกับเทสคลาสอื่นที่ใช้ container เดียวกัน
     */
    private void seedReceipts() throws Exception {
        long withEmail = createLease(ROOM_107,
                save(new Tenant("มานี รักเรียน", "1700000000001", "manee.m", "082-700-0001", EMAIL)));
        long withoutEmail = createLease(ROOM_108,
                save(new Tenant("Kenji Watanabe", "1700000000002", "kenji.m", "082-700-0002", null)));

        long paid = createReceipt(withEmail, "2026-09");
        mockMvc.perform(post("/api/receipts/{id}/pay", paid)).andExpect(status().isOk());
        createReceipt(withEmail, "2026-10");
        createReceipt(withoutEmail, "2026-10");
    }

    private Tenant save(Tenant tenant) {
        Tenant saved = tenantRepository.saveAndFlush(tenant);
        tenants.add(saved);
        return saved;
    }

    private long createLease(long roomId, Tenant tenant) throws Exception {
        String json = mockMvc.perform(post("/api/leases")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(LEASE_BODY.formatted(roomId, tenant.getId())))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return ((Number) JsonPath.read(json, "$.id")).longValue();
    }

    private long createReceipt(long leaseId, String billingMonth) throws Exception {
        String json = mockMvc.perform(post("/api/receipts")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"leaseId":%d,"billingMonth":"%s","electricUnits":120,"waterUnits":15}"""
                                .formatted(leaseId, billingMonth)))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return ((Number) JsonPath.read(json, "$.id")).longValue();
    }

    private ResultActions save(String body) throws Exception {
        return mockMvc.perform(put("/api/billing-schedule")
                .contentType(MediaType.APPLICATION_JSON)
                .content(body));
    }

    private void expectBadRequest(String body, String detail) throws Exception {
        save(body)
                .andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.detail").value(detail));
    }
}
