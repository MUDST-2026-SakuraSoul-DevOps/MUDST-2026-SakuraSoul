package com.sakurasoul.apartment.billing;

import com.jayway.jsonpath.JsonPath;
import com.sakurasoul.apartment.TestcontainersConfiguration;
import com.sakurasoul.apartment.lease.LeaseRepository;
import com.sakurasoul.apartment.tenant.Tenant;
import com.sakurasoul.apartment.tenant.TenantRepository;
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
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.DockerClientFactory;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.matchesPattern;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * รับชำระผ่าน API ถึง PostgreSQL จริง (SSK-163) ตามสัญญา API หัวข้อ "รับชำระ"
 * <p>
 * สัญญาของเทสนี้ล็อกอัตราไว้ต่างจากตึก ใบ ก.ย. (ไฟ 120 น้ำ 15) รวม 5,290.00 ใบ ต.ค. (ไฟ 100 น้ำ 12) รวม 5,040.00
 * การตัดยอดข้ามหลายใบพิสูจน์ที่ LeaseAccountTest และในเทสของการยกยอด เทสนี้ดูเส้นทาง API ของบิลเดียว
 * <p>
 * เครื่องที่ไม่ได้เปิด Docker จะข้ามเทสชุดนี้ ไม่ใช่ล้ม ส่วน CI มี Docker อยู่แล้วจะรันจริง
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
@EnabledIf("dockerAvailable")
// ทุก endpoint ต้องล็อกอินแล้วตั้งแต่ SSK-28 ชุดนี้จึงยิงในนามผู้ใช้ปลอม
@WithMockUser
class PaymentApiTest {

    /** ห้อง 110 มาจาก migration V2 ไม่มีเทสคลาสอื่นใช้ */
    private static final long ROOM_110 = 10L;

    private static final String LEASE_BODY = """
            {"roomId":%d,"tenantId":%d,"startDate":"2026-09-01","endDate":null,\
            "monthlyRent":3500,"billingCycle":"MONTHLY","securityDeposit":7000,\
            "electricRatePerUnit":9.5,"waterRatePerUnit":20,\
            "commonAreaFee":350,"internetFee":0}""";

    /** 3500 + 350 + 0 + (120 x 9.50) + (15 x 20.00) */
    private static final double SEPTEMBER_TOTAL = 5290.00;

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JdbcClient jdbc;

    @Autowired
    private ReceiptRepository receiptRepository;

    @Autowired
    private LeaseRepository leaseRepository;

    @Autowired
    private TenantRepository tenantRepository;

    @Autowired
    private PlatformTransactionManager transactionManager;

    private Tenant tenant;
    private long leaseId;

    static boolean dockerAvailable() {
        return DockerClientFactory.instance().isDockerAvailable();
    }

    /** เลขบัตรขึ้นต้นด้วย 21 ไม่ให้ชนกับเทสคลาสอื่นที่ใช้ container เดียวกัน (tenant_national_id_uk ใน V6) */
    @BeforeEach
    void createTenantAndLease() throws Exception {
        tenant = tenantRepository.saveAndFlush(
                new Tenant("มานี รักเรียน", "2100000000001", "manee.p", "082-210-0001", null));
        String json = mockMvc.perform(post("/api/leases")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(LEASE_BODY.formatted(ROOM_110, tenant.getId())))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        leaseId = ((Number) JsonPath.read(json, "$.id")).longValue();
    }

    @AfterEach
    void clearData() {
        BillingTables.clear(jdbc);
        leaseRepository.deleteAll();
        tenantRepository.deleteAll(List.of(tenant));
    }

    @Test
    @DisplayName("SSK-163 จ่ายบางส่วนได้ PARTIAL แล้วจ่ายส่วนที่เหลือได้ PAID พร้อมเวลากับช่องทางของก้อนที่ทำให้ครบ")
    void aPartialPaymentAndThenTheRest() throws Exception {
        long september = issue("2026-09", "120", "15");

        recordPayment(september, """
                {"amount":2000,"paidOn":"2026-10-03","method":"CASH","reference":"  CASH-0001  "}""")
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("PARTIAL"))
                .andExpect(jsonPath("$.paidAmount").value(2000.00))
                .andExpect(jsonPath("$.balanceDue").value(3290.00))
                .andExpect(jsonPath("$.settledAmount").value(2000.00))
                .andExpect(jsonPath("$.outstandingAmount").value(3290.00))
                .andExpect(jsonPath("$.paidAt").value(nullValue()))
                .andExpect(jsonPath("$.paymentMethod").value(nullValue()))
                .andExpect(jsonPath("$.payments").value(hasSize(1)))
                .andExpect(jsonPath("$.payments[0].amount").value(2000.00))
                .andExpect(jsonPath("$.payments[0].paidOn").value("2026-10-03"))
                .andExpect(jsonPath("$.payments[0].method").value("CASH"))
                .andExpect(jsonPath("$.payments[0].reference").value("CASH-0001"))
                .andExpect(jsonPath("$.payments[0].note").value(nullValue()))
                .andExpect(jsonPath("$.payments[0].voidedAt").value(nullValue()));

        // ไม่ส่ง paidOn คือวันนี้ การชำระที่เพิ่งบันทึกเป็นตัวสุดท้ายของ payments
        String json = recordPayment(september, """
                {"amount":3290,"method":"TRANSFER"}""")
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("PAID"))
                .andExpect(jsonPath("$.balanceDue").value(0.00))
                .andExpect(jsonPath("$.outstandingAmount").value(0.00))
                .andExpect(jsonPath("$.overdue").value(false))
                .andExpect(jsonPath("$.paymentMethod").value("Bank transfer"))
                .andExpect(jsonPath("$.payments").value(hasSize(2)))
                .andExpect(jsonPath("$.payments[1].method").value("TRANSFER"))
                .andExpect(jsonPath("$.payments[1].paidOn").value(matchesPattern("^\\d{4}-\\d{2}-\\d{2}$")))
                .andReturn().getResponse().getContentAsString();
        // เวลาที่ใบกลายเป็น PAID คือเวลาที่บันทึกการชำระก้อนที่ทำให้ครบ
        assertThat((String) JsonPath.read(json, "$.paidAt")).isEqualTo(JsonPath.read(json, "$.payments[1].recordedAt"));

        recordPayment(september, """
                {"amount":1,"method":"CASH"}""")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.detail").value("This receipt has already been paid"));
        mockMvc.perform(get("/api/receipts/{id}/payments", september))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").value(hasSize(2)))
                .andExpect(jsonPath("$[0].method").value("CASH"))
                .andExpect(jsonPath("$[1].method").value("TRANSFER"));
    }

    /** ลำดับในสัญญา: ไม่พบใบ 404 → ไม่ใช่ใบล่าสุด 409 → จ่ายครบแล้ว 409 → ค่าในคำขอ 400 → เกินยอด 400 */
    @Test
    @DisplayName("SSK-163 ทุกแถวของตาราง error ตามลำดับ ค่าที่ผิดซึ่งส่งไปที่ใบเก่าได้ 409 พร้อมเลขที่ใบล่าสุด ไม่ใช่ 400")
    void errorsComeInTheContractOrder() throws Exception {
        recordPayment(999_999L, """
                {"amount":-1,"method":"CASH"}""")
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.detail").value("No receipt with id 999999"));

        long september = issue("2026-09", "120", "15");
        pay(september, "{}").andExpect(status().isOk());
        long october = issue("2026-10", "100", "12");
        String octoberNo = receiptRepository.findById(october).orElseThrow().getReceiptNo();

        recordPayment(september, """
                {"amount":-1,"method":"CASH"}""")
                .andExpect(status().isConflict())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.detail")
                        .value("Payments are recorded on the latest bill of this lease (" + octoberNo + ")"));

        assertBadRequest(october, """
                {"amount":0,"method":"bad","paidOn":"bad"}""", "Amount must be greater than 0");
        assertBadRequest(october, """
                {"amount":100,"method":"Cash"}""", "Payment method must be CASH, TRANSFER, QR or OTHER");
        assertBadRequest(october, """
                {"amount":100,"method":"QR","paidOn":"2026/10/31"}""", "The payment date must be in YYYY-MM-DD format");
        assertBadRequest(october, """
                {"amount":100,"method":"QR","paidOn":"2999-01-01"}""", "The payment date cannot be in the future");
        assertBadRequest(october, """
                {"amount":100,"method":"QR","reference":"%s"}""".formatted("x".repeat(101)),
                "The reference must be 100 characters or fewer");
        assertBadRequest(october, """
                {"amount":100,"method":"QR","note":"%s"}""".formatted("x".repeat(501)),
                "The note must be 500 characters or fewer");
        assertBadRequest(october, """
                {"amount":5040.01,"method":"QR"}""", "The amount is more than the balance due of ฿5,040.00");
        // Jackson อ่าน body ไม่ออกก่อนถึง controller ลำดับในสัญญาใช้ไม่ได้ ได้ข้อความกลางของระบบ (ดูจุดที่ต่างจากสัญญา)
        assertBadRequest(october, """
                {"amount":"abc","method":"QR"}""", "The amount field must be a number");

        pay(october, "{}").andExpect(status().isOk());
        recordPayment(october, """
                {"amount":-1,"method":"bad"}""")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.detail").value("This receipt has already been paid"));
        mockMvc.perform(get("/api/receipts/{id}/payments", 999_999L))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("SSK-163 /pay แบบเดิมบนใบที่จ่ายไปบางส่วนแล้วรับเฉพาะส่วนที่เหลือ ข้อความที่ส่งมาอยู่ใน note และในช่องทางของใบ")
    void theOldPayEndpointTakesWhatIsLeft() throws Exception {
        long september = issue("2026-09", "120", "15");
        recordPayment(september, """
                {"amount":2000,"method":"CASH"}""").andExpect(status().isCreated());

        pay(september, """
                {"paymentMethod":"%s"}""".formatted("x".repeat(51)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value("The payment method must be 50 characters or fewer"));
        pay(september, """
                {"paymentMethod":" Cash "}""")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("PAID"))
                .andExpect(jsonPath("$.paymentMethod").value("Cash"))
                .andExpect(jsonPath("$.paidAmount").value(SEPTEMBER_TOTAL))
                .andExpect(jsonPath("$.payments[1].amount").value(3290.00))
                .andExpect(jsonPath("$.payments[1].method").value("OTHER"))
                .andExpect(jsonPath("$.payments[1].note").value("Cash"));
    }

    @Test
    @DisplayName("SSK-163 รับ 3,000 สองคำขอพร้อมกันบนบิล 5,290 ผ่านคำขอเดียว อีกคำขอได้ 400 เกินยอด เหลือ 2,290 พอดี")
    void twoPaymentsAtOnceCannotOverpay() throws Exception {
        long september = issue("2026-09", "120", "15");
        CountDownLatch start = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            List<Future<Integer>> results = new ArrayList<>();
            for (int i = 0; i < 2; i++) {
                results.add(pool.submit(() -> {
                    start.await();
                    // SecurityContext ของ @WithMockUser อยู่แค่ thread ของเทส ต้องแนบผู้ใช้มากับคำขอเอง
                    return mockMvc.perform(post("/api/receipts/{id}/payments", september)
                                    .with(user("admin"))
                                    .contentType(MediaType.APPLICATION_JSON)
                                    .content("""
                                            {"amount":3000,"method":"CASH"}"""))
                            .andReturn().getResponse().getStatus();
                }));
            }
            start.countDown();

            List<Integer> statuses = new ArrayList<>();
            for (Future<Integer> result : results) {
                statuses.add(result.get(30, TimeUnit.SECONDS));
            }
            assertThat(statuses).containsExactlyInAnyOrder(201, 400);
        } finally {
            pool.shutdownNow();
        }

        mockMvc.perform(get("/api/receipts/{id}", september))
                .andExpect(jsonPath("$.payments").value(hasSize(1)))
                .andExpect(jsonPath("$.balanceDue").value(2290.00));
    }

    /**
     * รอบส่งอีเมลนับครั้งที่ส่งด้วยการล็อกแถวใบโดยไม่ล็อกสัญญา (ReceiptDispatchService.markSent) และ Hibernate เขียน
     * ทุกคอลัมน์ของแถว ถ้าการรับชำระอ่านใบโดยไม่ล็อก มันจะเขียน sent_count ค่าเก่าทับตอนปรับสถานะ เทสนี้ถือแถวไว้
     * แทนรอบส่งอีเมล แล้วปล่อยหลังจากการรับชำระเริ่มไปแล้ว ต้องได้ทั้งสถานะใหม่และจำนวนครั้งที่ส่ง
     */
    @Test
    @DisplayName("SSK-163 รับชำระขณะที่รอบส่งอีเมลกำลังนับครั้งที่ส่งใบเดียวกัน ไม่มีฝั่งไหนเขียนทับ")
    void aPaymentWaitsForTheSendCountInsteadOfOverwritingIt() throws Exception {
        long september = issue("2026-09", "120", "15");
        TransactionTemplate transaction = new TransactionTemplate(transactionManager);
        CountDownLatch rowHeld = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            Future<?> sending = pool.submit(() -> transaction.executeWithoutResult(status -> {
                Receipt locked = receiptRepository.findForUpdateById(september).orElseThrow();
                rowHeld.countDown();
                awaitQuietly(release);
                locked.markSent(Instant.now());
                receiptRepository.saveAndFlush(locked);
            }));
            assertThat(rowHeld.await(10, TimeUnit.SECONDS)).isTrue();

            Future<Integer> paying = pool.submit(() -> mockMvc.perform(post("/api/receipts/{id}/payments", september)
                            .with(user("admin"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("""
                                    {"amount":2000,"method":"CASH"}"""))
                    .andReturn().getResponse().getStatus());
            // ให้การรับชำระวิ่งไปถึงการอ่านใบก่อนปล่อยรอบส่งอีเมล
            Thread.sleep(300);
            assertThat(paying).isNotDone();

            release.countDown();
            sending.get(10, TimeUnit.SECONDS);
            assertThat(paying.get(10, TimeUnit.SECONDS)).isEqualTo(201);
        } finally {
            release.countDown();
            pool.shutdownNow();
        }

        mockMvc.perform(get("/api/receipts/{id}", september))
                .andExpect(jsonPath("$.status").value("PARTIAL"))
                .andExpect(jsonPath("$.sentCount").value(1));
    }

    @Test
    @DisplayName("SSK-163 ยกเลิกย้อนทีละก้อนจากก้อนล่าสุด ยอดกลับไปตรงกับก่อนรับชำระทุกสตางค์ ก้อนที่ยกเลิกยังอยู่ในประวัติ")
    void voidingStepsBackOnePaymentAtATime() throws Exception {
        long september = issue("2026-09", "120", "15");
        long cash = lastPaymentId(recordPayment(september, """
                {"amount":2000,"method":"CASH"}"""));
        long transfer = lastPaymentId(recordPayment(september, """
                {"amount":3290,"method":"TRANSFER"}"""));

        voidPayment(cash)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.detail").value("Only the most recent payment of this lease can be voided"));

        voidPayment(transfer)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(september))
                .andExpect(jsonPath("$.status").value("PARTIAL"))
                .andExpect(jsonPath("$.paidAt").value(nullValue()))
                .andExpect(jsonPath("$.paymentMethod").value(nullValue()))
                .andExpect(jsonPath("$.paidAmount").value(2000.00))
                .andExpect(jsonPath("$.balanceDue").value(3290.00))
                .andExpect(jsonPath("$.settledAmount").value(2000.00))
                .andExpect(jsonPath("$.payments").value(hasSize(2)))
                .andExpect(jsonPath("$.payments[1].voidedAt").isNotEmpty());
        voidPayment(transfer)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.detail").value("This payment has already been voided"));

        // ก้อนที่ยกเลิกแล้วไม่นับเป็นก้อนล่าสุด ก้อนก่อนหน้าจึงยกเลิกได้ต่อ
        voidPayment(cash)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("PENDING"))
                .andExpect(jsonPath("$.paidAmount").value(0.00))
                .andExpect(jsonPath("$.balanceDue").value(SEPTEMBER_TOTAL))
                .andExpect(jsonPath("$.outstandingAmount").value(SEPTEMBER_TOTAL));

        mockMvc.perform(get("/api/receipts/{id}/payments", september))
                .andExpect(jsonPath("$[0].voidedAt").isNotEmpty())
                .andExpect(jsonPath("$[1].voidedAt").isNotEmpty());
        recordPayment(september, """
                {"amount":5290,"method":"QR"}""")
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("PAID"))
                .andExpect(jsonPath("$.paymentMethod").value("PromptPay QR"));
    }

    @Test
    @DisplayName("SSK-163 ยกเลิกการชำระที่ไม่มีได้ 404 ข้อความตามสัญญา")
    void voidingAnUnknownPaymentIsNotFound() throws Exception {
        voidPayment(999_999L)
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.detail").value("No payment with id 999999"));
    }

    /** ใบ ก.ย. ตัดครบก่อนออกใบ ต.ค. จึงไม่ถูกยกยอด ประโยค "was carried into" ไม่จริง ต้องได้อีกข้อความ */
    @Test
    @DisplayName("SSK-163 มีบิลใหม่กว่าแล้วยกเลิกการชำระบนบิลเก่าไม่ได้ แม้บิลเก่าจะไม่ถูกยกยอด")
    void aPaymentOnAnOlderBillCannotBeVoided() throws Exception {
        long september = issue("2026-09", "120", "15");
        long payment = lastPaymentId(pay(september, "{}"));
        long october = issue("2026-10", "100", "12");
        String octoberNo = receiptRepository.findById(october).orElseThrow().getReceiptNo();

        voidPayment(payment)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.detail").value("A newer bill (" + octoberNo
                        + ") has been issued for this lease, so this payment can no longer be voided"));
        mockMvc.perform(get("/api/receipts/{id}", september))
                .andExpect(jsonPath("$.status").value("PAID"));
    }

    @Test
    @DisplayName("SSK-163 ยกเลิกก้อนเดียวกันสองคำขอพร้อมกัน ผ่านคำขอเดียว อีกคำขอได้ 409")
    void voidingTwiceAtOnceVoidsOnce() throws Exception {
        long september = issue("2026-09", "120", "15");
        long payment = lastPaymentId(recordPayment(september, """
                {"amount":2000,"method":"CASH"}"""));
        CountDownLatch start = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            List<Future<Integer>> results = new ArrayList<>();
            for (int i = 0; i < 2; i++) {
                results.add(pool.submit(() -> {
                    start.await();
                    return mockMvc.perform(post("/api/payments/{id}/void", payment).with(user("admin")))
                            .andReturn().getResponse().getStatus();
                }));
            }
            start.countDown();

            List<Integer> statuses = new ArrayList<>();
            for (Future<Integer> result : results) {
                statuses.add(result.get(30, TimeUnit.SECONDS));
            }
            assertThat(statuses).containsExactlyInAnyOrder(200, 409);
        } finally {
            pool.shutdownNow();
        }

        mockMvc.perform(get("/api/receipts/{id}", september))
                .andExpect(jsonPath("$.status").value("PENDING"))
                .andExpect(jsonPath("$.balanceDue").value(SEPTEMBER_TOTAL));
    }

    private void assertBadRequest(long receiptId, String body, String detail) throws Exception {
        recordPayment(receiptId, body)
                .andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.detail").value(detail));
    }

    private ResultActions recordPayment(long receiptId, String body) throws Exception {
        return mockMvc.perform(post("/api/receipts/{id}/payments", receiptId)
                .contentType(MediaType.APPLICATION_JSON)
                .content(body));
    }

    private ResultActions voidPayment(long paymentId) throws Exception {
        return mockMvc.perform(post("/api/payments/{id}/void", paymentId));
    }

    /** id ของการชำระที่เพิ่งบันทึก ซึ่งเป็นตัวสุดท้ายของ payments ในบิลที่ตอบกลับ */
    private static long lastPaymentId(ResultActions response) throws Exception {
        String json = response.andReturn().getResponse().getContentAsString();
        List<Number> ids = JsonPath.read(json, "$.payments[*].id");
        return ids.getLast().longValue();
    }

    private ResultActions pay(long receiptId, String body) throws Exception {
        return mockMvc.perform(post("/api/receipts/{id}/pay", receiptId)
                .contentType(MediaType.APPLICATION_JSON)
                .content(body));
    }

    private long issue(String billingMonth, String electricUnits, String waterUnits) throws Exception {
        String json = mockMvc.perform(post("/api/receipts")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"leaseId":%d,"billingMonth":"%s","electricUnits":%s,"waterUnits":%s}"""
                                .formatted(leaseId, billingMonth, electricUnits, waterUnits)))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return ((Number) JsonPath.read(json, "$.id")).longValue();
    }

    private static void awaitQuietly(CountDownLatch latch) {
        try {
            if (!latch.await(10, TimeUnit.SECONDS)) {
                throw new IllegalStateException("The test never released the receipt row");
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException(e);
        }
    }
}
