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
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.testcontainers.DockerClientFactory;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * ยกยอดค้างและคิดดอกเบี้ยตอนออกใบ (SSK-164) ผ่าน API ถึง PostgreSQL จริง
 * <p>
 * เรื่องเดียวกับตัวอย่างในสัญญา API เลื่อนมาเป็น ส.ค. ก.ย. ต.ค. 2569 ให้ทุกเดือนอยู่ในอดีตเสมอ
 * อัตราดอกเบี้ย 1.50% ไม่มีวันผ่อนผัน สัญญาใช้อัตราตั้งต้นของตึก (ไฟ 8 น้ำ 18 ส่วนกลาง 300 อินเทอร์เน็ต 250)
 * ค่าเช่า 3,500 ตามชนิดห้องชั้น 1 ใบ ส.ค. (ไฟ 85 น้ำ 15) ค่าใช้จ่าย 5,000.00 ใบ ก.ย. (ไฟ 102 น้ำ 13) 5,100.00
 * <p>
 * วันอ้างอิงของดอกเบี้ยคือวันที่มาก่อนระหว่างวันออกใบกับสิ้นเดือนของใบใหม่ ใบที่ออกย้อนหลังจึงได้สิ้นเดือนเสมอ
 * ตัวเลขทุกตัวในคลาสนี้จึงไม่ขึ้นกับวันที่รันเทส
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
@EnabledIf("dockerAvailable")
@WithMockUser
class CarryForwardApiTest {

    /** ห้อง 110 ชั้น 1 ชนิด SINGLE ค่าเช่า 3,500 */
    private static final long ROOM_110 = 10L;

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JdbcClient jdbc;

    @Autowired
    private LeaseRepository leaseRepository;

    @Autowired
    private TenantRepository tenantRepository;

    private final List<Tenant> tenants = new ArrayList<>();

    static boolean dockerAvailable() {
        return DockerClientFactory.instance().isDockerAvailable();
    }

    /** สัญญาที่ทำหลังจากนี้คัดลอกดอกเบี้ย 1.50% ต่อเดือน ไม่มีวันผ่อนผัน */
    @BeforeEach
    void chargeLateInterest() throws Exception {
        setLateInterest("1.5", "0");
    }

    /**
     * ตรวจสมการหลักของทุกสัญญาหลังทุกเทส แล้วล้างข้อมูลแม้สมการจะไม่จริง ไม่งั้นเทสถัดไปพังตามเพราะข้อมูลค้าง
     * ดูเหตุผลของการล้างด้วย SQL ที่ BillingTables แล้วคืนดอกเบี้ยตั้งต้น สัญญาของเทสคลาสอื่นคัดลอกค่านี้
     */
    @AfterEach
    void clearData() throws Exception {
        try {
            assertEveryLeaseBalances();
        } finally {
            BillingTables.clear(jdbc);
            leaseRepository.deleteAll();
            tenantRepository.deleteAll(tenants);
            tenants.clear();
            setLateInterest("0", "0");
        }
    }

    @Test
    @DisplayName("SSK-164 เรื่องในสัญญา: ยกมา 3,000 ดอกเบี้ย 45 บิล 8,145 → รับ 3,000 เหลือ 5,145 → ยกเลิกกลับไป 8,145")
    void theContractStory() throws Exception {
        long lease = createLease(ROOM_110, "2400000000001", "2026-07-01", null);
        long august = issue(lease, "2026-08", "85", "15");
        String augustNo = receiptNo(august);
        record(august, "2000", "CASH").andExpect(status().isCreated());

        long september = issue(lease, "2026-09", "102", "13");
        String septemberNo = receiptNo(september);
        mockMvc.perform(get("/api/receipts/{id}", september))
                .andExpect(jsonPath("$.chargesAmount").value(5100.00))
                .andExpect(jsonPath("$.previousBalance").value(3000.00))
                .andExpect(jsonPath("$.interestAmount").value(45.00))
                .andExpect(jsonPath("$.totalAmount").value(8145.00))
                .andExpect(jsonPath("$.balanceDue").value(8145.00))
                .andExpect(jsonPath("$.outstandingAmount").value(5145.00))
                .andExpect(jsonPath("$.status").value("PENDING"))
                .andExpect(jsonPath("$.latest").value(true))
                // หนี้ของใบ ส.ค. ที่ยกมายังเกินกำหนดตั้งแต่ 5 ก.ย. ไม่หายไปตอนออกใบใหม่
                .andExpect(jsonPath("$.oldestUnpaidDueDate").value("2026-09-05"))
                .andExpect(jsonPath("$.overdue").value(true))
                .andExpect(jsonPath("$.items").value(hasSize(7)))
                .andExpect(jsonPath("$.items[5].item").value("Previous balance"))
                .andExpect(jsonPath("$.items[5].detail").value(augustNo))
                .andExpect(jsonPath("$.items[5].amount").value(3000.00))
                .andExpect(jsonPath("$.items[6].item").value("Late interest"))
                .andExpect(jsonPath("$.items[6].detail").value("1.50% of ฿3,000.00"))
                .andExpect(jsonPath("$.items[6].amount").value(45.00));
        mockMvc.perform(get("/api/receipts/{id}", august))
                .andExpect(jsonPath("$.carriedToReceiptId").value(september))
                .andExpect(jsonPath("$.latest").value(false))
                .andExpect(jsonPath("$.balanceDue").value(nullValue()))
                .andExpect(jsonPath("$.status").value("PARTIAL"))
                .andExpect(jsonPath("$.outstandingAmount").value(3000.00));

        // เงินบนบิล ก.ย. ถูกตัดเข้าใบ ส.ค. ทั้งก้อน ใบ ส.ค. ครบ ใบ ก.ย. ยังไม่ถูกตัด
        long transfer = lastPaymentId(record(september, "3000", "TRANSFER")
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.paidAmount").value(3000.00))
                .andExpect(jsonPath("$.balanceDue").value(5145.00))
                .andExpect(jsonPath("$.settledAmount").value(0.00))
                .andExpect(jsonPath("$.status").value("PENDING")));
        mockMvc.perform(get("/api/receipts/{id}", august))
                .andExpect(jsonPath("$.status").value("PAID"))
                .andExpect(jsonPath("$.settledAmount").value(5000.00))
                .andExpect(jsonPath("$.paidAmount").value(2000.00))
                .andExpect(jsonPath("$.paymentMethod").value("Bank transfer"));
        record(august, "1", "CASH")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.detail")
                        .value("Payments are recorded on the latest bill of this lease (" + septemberNo + ")"));

        mockMvc.perform(post("/api/payments/{id}/void", transfer))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.paidAmount").value(0.00))
                .andExpect(jsonPath("$.balanceDue").value(8145.00));
        mockMvc.perform(get("/api/receipts/{id}", august))
                .andExpect(jsonPath("$.status").value("PARTIAL"))
                .andExpect(jsonPath("$.outstandingAmount").value(3000.00))
                .andExpect(jsonPath("$.paidAt").value(nullValue()));
        // การชำระบนใบ ส.ค. ยกเลิกไม่ได้ ยอดของใบนั้นถูกยกไปแช่แข็งในบิล ก.ย. แล้ว
        long cash = firstPaymentId(august);
        mockMvc.perform(post("/api/payments/{id}/void", cash))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.detail").value("This payment is on a bill that was carried into "
                        + septemberNo + " and can no longer be voided"));
    }

    /** ตัวอย่างค้างสามเดือนในสัญญา ดอกเบี้ยเดือนที่สามคิดจาก 3,000 + 5,100 ไม่ใช่ 8,145 เพราะ 45.00 เป็นดอกเบี้ย */
    @Test
    @DisplayName("SSK-164 ค้างสามเดือน ใบ ต.ค. ยกมา 8,145.00 ดอกเบี้ย 8,100 x 1.5% = 121.50 รวม 13,266.50 ใบเก่าชี้มาใบล่าสุด")
    void threeMonthsBehind() throws Exception {
        long lease = createLease(ROOM_110, "2400000000001", "2026-07-01", null);
        long august = issue(lease, "2026-08", "85", "15");
        record(august, "2000", "CASH").andExpect(status().isCreated());
        long september = issue(lease, "2026-09", "102", "13");
        long october = issue(lease, "2026-10", "85", "15");
        String octoberNo = receiptNo(october);

        mockMvc.perform(get("/api/receipts/{id}", october))
                .andExpect(jsonPath("$.previousBalance").value(8145.00))
                .andExpect(jsonPath("$.items[5].detail").value(receiptNo(august) + ", " + receiptNo(september)))
                .andExpect(jsonPath("$.items[6].detail").value("1.50% of ฿8,100.00"))
                .andExpect(jsonPath("$.interestAmount").value(121.50))
                .andExpect(jsonPath("$.totalAmount").value(13266.50));
        mockMvc.perform(get("/api/receipts/{id}", august)).andExpect(jsonPath("$.carriedToReceiptId").value(october));
        mockMvc.perform(get("/api/receipts/{id}", september))
                .andExpect(jsonPath("$.carriedToReceiptId").value(october));

        // ใบที่ถูกยกยอดแก้ไม่ได้ ใบต้องออกตามลำดับเดือน
        mockMvc.perform(put("/api/receipts/{id}", september)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"billingMonth":"2026-09","electricUnits":1,"waterUnits":1}"""))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.detail")
                        .value("This receipt was carried into " + octoberNo + " and can no longer be edited"));
        issueRequest(lease, "2026-07", "1", "1")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.detail")
                        .value("A receipt for a later month (2026-10) has already been issued for this lease"));
    }

    @Test
    @DisplayName("SSK-164 สัญญาที่ไม่คิดดอกเบี้ยยังยกยอด แต่ไม่มีดอกเบี้ยและไม่มีบรรทัด Late interest")
    void aLeaseWithoutInterestStillCarriesItsBalance() throws Exception {
        setLateInterest("0", "0");
        long lease = createLease(ROOM_110, "2400000000001", "2026-07-01", null);
        long august = issue(lease, "2026-08", "85", "15");

        long september = issue(lease, "2026-09", "102", "13");

        mockMvc.perform(get("/api/receipts/{id}", september))
                .andExpect(jsonPath("$.previousBalance").value(5000.00))
                .andExpect(jsonPath("$.interestAmount").value(0.00))
                .andExpect(jsonPath("$.totalAmount").value(10100.00))
                .andExpect(jsonPath("$.items").value(hasSize(6)))
                .andExpect(jsonPath("$.items[5].item").value("Previous balance"));
        mockMvc.perform(get("/api/receipts/{id}", august)).andExpect(jsonPath("$.carriedToReceiptId").value(september));
    }

    @Test
    @DisplayName("SSK-164 สองสัญญาในห้องเดียว ยอดค้างของผู้เช่าคนเก่าไม่ไปอยู่ในบิลของคนใหม่ จ่ายของคนใหม่ไม่แตะใบของคนเก่า")
    void balancesNeverCrossLeases() throws Exception {
        long previousTenant = createLease(ROOM_110, "2400000000001", "2026-07-01", "\"2026-08-31\"");
        long nextTenant = createLease(ROOM_110, "2400000000002", "2026-09-01", null);
        long august = issue(previousTenant, "2026-08", "85", "15");
        long september = issue(nextTenant, "2026-09", "102", "13");

        mockMvc.perform(get("/api/receipts/{id}", september))
                .andExpect(jsonPath("$.previousBalance").value(0.00))
                .andExpect(jsonPath("$.totalAmount").value(5100.00));
        record(september, "5100", "CASH")
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("PAID"));
        mockMvc.perform(get("/api/receipts/{id}", august))
                .andExpect(jsonPath("$.status").value("PENDING"))
                .andExpect(jsonPath("$.carriedToReceiptId").value(nullValue()))
                .andExpect(jsonPath("$.balanceDue").value(5000.00));
    }

    /**
     * รับชำระบนบิลเดือนนี้พร้อมกับออกบิลเดือนถัดไปของสัญญาเดียวกัน วนหลายเดือน ล็อกของสัญญาจัดคิวให้เกิดทีละอย่าง
     * <ul>
     *   <li>รับชำระก่อน: บิลใหม่ยกมาเฉพาะยอดที่เหลือหลังหักเงินก้อนนั้น</li>
     *   <li>ออกบิลก่อน: การรับชำระบนบิลเดิมได้ 409 เพราะไม่ใช่ใบล่าสุดแล้ว บิลใหม่ยกมาเต็มยอด</li>
     * </ul>
     * จบแบบไหนสมการหลักต้องจริง (ตรวจทุกสัญญาตอนจบเทส) และยอดยกมาต้องตรงกับผลของการรับชำระ
     */
    @Test
    @DisplayName("SSK-164 รับชำระพร้อมออกบิลใหม่ วนหลายรอบ ยอดยกมาตรงกับการรับชำระที่เกิดก่อนเสมอ")
    void aPaymentRacingTheNextBill() throws Exception {
        setLateInterest("0", "0");
        long lease = createLease(ROOM_110, "2400000000001", "2026-01-01", null);
        long bill = issue(lease, "2026-01", "85", "15");
        for (int month = 2; month <= 6; month++) {
            long current = bill;
            String next = "2026-0" + month;
            BigDecimal owedBefore = balanceDue(current);

            List<Integer> statuses = race(
                    () -> asAdmin(post("/api/receipts/{id}/payments", current)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("""
                                    {"amount":1000,"method":"CASH"}""")),
                    () -> asAdmin(post("/api/receipts")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("""
                                    {"leaseId":%d,"billingMonth":"%s","electricUnits":85,"waterUnits":15}"""
                                    .formatted(lease, next))));

            assertThat(statuses.get(1)).isEqualTo(201);
            assertThat(statuses.get(0)).isIn(201, 409);
            bill = latestReceiptOf(lease);
            BigDecimal paid = statuses.get(0) == 201 ? new BigDecimal("1000.00") : BigDecimal.ZERO;
            mockMvc.perform(get("/api/receipts/{id}", bill))
                    .andExpect(jsonPath("$.previousBalance").value(owedBefore.subtract(paid).doubleValue()));
        }
    }

    /** ยกเลิกพร้อมออกบิลใหม่ ห้ามมีกรณีที่ยกเลิกสำเร็จ และบิลใหม่ก็ยกยอดหลังหักเงินก้อนนั้นไปแล้ว */
    @Test
    @DisplayName("SSK-164 ยกเลิกการชำระพร้อมออกบิลใหม่ วนหลายรอบ ไม่มีรอบไหนที่ทั้งยกเลิกสำเร็จและบิลใหม่หักเงินก้อนนั้น")
    void aVoidRacingTheNextBill() throws Exception {
        setLateInterest("0", "0");
        long lease = createLease(ROOM_110, "2400000000001", "2026-01-01", null);
        long bill = issue(lease, "2026-01", "85", "15");
        for (int month = 2; month <= 6; month++) {
            long payment = lastPaymentId(record(bill, "1000", "CASH").andExpect(status().isCreated()));
            BigDecimal owedAfterPayment = balanceDue(bill);
            String next = "2026-0" + month;

            List<Integer> statuses = race(
                    () -> asAdmin(post("/api/payments/{id}/void", payment)),
                    () -> asAdmin(post("/api/receipts")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("""
                                    {"leaseId":%d,"billingMonth":"%s","electricUnits":85,"waterUnits":15}"""
                                    .formatted(lease, next))));

            assertThat(statuses.get(1)).isEqualTo(201);
            assertThat(statuses.get(0)).isIn(200, 409);
            bill = latestReceiptOf(lease);
            BigDecimal refunded = statuses.get(0) == 200 ? new BigDecimal("1000.00") : BigDecimal.ZERO;
            mockMvc.perform(get("/api/receipts/{id}", bill))
                    .andExpect(jsonPath("$.previousBalance").value(owedAfterPayment.add(refunded).doubleValue()));
        }
    }

    /**
     * สองสัญญาออกบิลพร้อมกัน นับเลขที่ได้เลขเดียวกัน คำขอที่แพ้ถูก rollback ทั้งก้อนรวมการยกยอด แล้วลองใหม่
     * ต้องได้ 201 ทั้งคู่ เลขที่ไม่ซ้ำ และใบเก่าของแต่ละสัญญาชี้ไปบิลใหม่ของสัญญาตัวเอง
     */
    @Test
    @DisplayName("SSK-164 สองสัญญาออกบิลที่มียอดยกมาพร้อมกัน ได้ทั้งคู่ เลขที่ไม่ซ้ำ การยกยอดไม่ค้างครึ่งทาง")
    void twoLeasesIssueAtOnce() throws Exception {
        setLateInterest("0", "0");
        long first = createLease(ROOM_110, "2400000000001", "2026-07-01", null);
        long second = createLease(11L, "2400000000002", "2026-07-01", null);
        long firstAugust = issue(first, "2026-08", "85", "15");
        long secondAugust = issue(second, "2026-08", "85", "15");

        List<Integer> statuses = race(
                () -> asAdmin(post("/api/receipts").contentType(MediaType.APPLICATION_JSON).content("""
                        {"leaseId":%d,"billingMonth":"2026-09","electricUnits":102,"waterUnits":13}""".formatted(first))),
                () -> asAdmin(post("/api/receipts").contentType(MediaType.APPLICATION_JSON).content("""
                        {"leaseId":%d,"billingMonth":"2026-09","electricUnits":102,"waterUnits":13}""".formatted(second))));

        assertThat(statuses).containsExactly(201, 201);
        long firstSeptember = latestReceiptOf(first);
        long secondSeptember = latestReceiptOf(second);
        assertThat(receiptNo(firstSeptember)).isNotEqualTo(receiptNo(secondSeptember));
        mockMvc.perform(get("/api/receipts/{id}", firstAugust))
                .andExpect(jsonPath("$.carriedToReceiptId").value(firstSeptember));
        mockMvc.perform(get("/api/receipts/{id}", secondAugust))
                .andExpect(jsonPath("$.carriedToReceiptId").value(secondSeptember));
    }

    /**
     * สมการที่ทั้งระบบพึ่ง ตรวจจากตารางตรง ๆ ไม่ผ่านโค้ดที่กำลังเทส: ผลรวมการตัดยอดของแต่ละการชำระเท่ายอดเงิน
     * และของทุกสัญญา ยอดที่ต้องจ่ายของบิลล่าสุดเท่ากับผลรวมยอดค้างของทุกใบ
     */
    private void assertEveryLeaseBalances() {
        assertThat(jdbc.sql("""
                SELECT count(*) FROM payment p
                WHERE p.amount <> (SELECT coalesce(sum(a.interest_amount + a.principal_amount), 0)
                                   FROM payment_allocation a WHERE a.payment_id = p.id)""")
                .query(Long.class).single()).isZero();
        assertThat(jdbc.sql("""
                WITH settled AS (
                    SELECT a.receipt_id, sum(a.interest_amount + a.principal_amount) AS amount
                    FROM payment_allocation a JOIN payment p ON p.id = a.payment_id
                    WHERE p.voided_at IS NULL GROUP BY a.receipt_id),
                outstanding AS (
                    SELECT r.lease_id, sum(r.total_amount - r.previous_balance - coalesce(s.amount, 0)) AS amount
                    FROM receipt r LEFT JOIN settled s ON s.receipt_id = r.id GROUP BY r.lease_id),
                latest AS (
                    SELECT DISTINCT ON (r.lease_id) r.lease_id, r.id, r.total_amount
                    FROM receipt r ORDER BY r.lease_id, r.billing_month DESC),
                due AS (
                    SELECT l.lease_id, l.total_amount - coalesce((SELECT sum(p.amount) FROM payment p
                        WHERE p.receipt_id = l.id AND p.voided_at IS NULL), 0) AS amount
                    FROM latest l)
                SELECT count(*) FROM due d JOIN outstanding o ON o.lease_id = d.lease_id WHERE d.amount <> o.amount""")
                .query(Long.class).single()).isZero();
    }

    /** ปล่อยสองคำขอพร้อมกัน คืนสถานะตามลำดับที่ส่งมา */
    private List<Integer> race(Callable<Integer> first, Callable<Integer> second) throws Exception {
        CountDownLatch start = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            List<Future<Integer>> results = new ArrayList<>();
            for (Callable<Integer> request : List.of(first, second)) {
                results.add(pool.submit(() -> {
                    start.await();
                    return request.call();
                }));
            }
            start.countDown();
            List<Integer> statuses = new ArrayList<>();
            for (Future<Integer> result : results) {
                statuses.add(result.get(30, TimeUnit.SECONDS));
            }
            return statuses;
        } finally {
            pool.shutdownNow();
        }
    }

    /** SecurityContext ของ @WithMockUser อยู่แค่ thread ของเทส คำขอจากพูลต้องแนบผู้ใช้มาเอง */
    private int asAdmin(MockHttpServletRequestBuilder request) throws Exception {
        return mockMvc.perform(request.with(user("admin"))).andReturn().getResponse().getStatus();
    }

    private long createLease(long roomId, String nationalId, String startDate, String endDate) throws Exception {
        Tenant tenant = tenantRepository.saveAndFlush(
                new Tenant("มานี รักเรียน " + nationalId.substring(12), nationalId, "manee.c" + nationalId.substring(12),
                        "082-220-0001", null));
        tenants.add(tenant);
        // body หกช่องแบบฟอร์มหน้าเว็บ อัตรามาจากค่าตั้งของตึก ค่าเช่ามาจากชนิดห้อง ดอกเบี้ยคัดลอกจากค่าตั้งตอนนี้
        String json = mockMvc.perform(post("/api/leases")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"roomId":%d,"tenantId":%d,"startDate":"%s","endDate":%s,\
                                "monthlyRent":9999,"billingCycle":"MONTHLY"}"""
                                .formatted(roomId, tenant.getId(), startDate, endDate == null ? "null" : endDate)))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return ((Number) JsonPath.read(json, "$.id")).longValue();
    }

    private long issue(long leaseId, String month, String electricUnits, String waterUnits) throws Exception {
        String json = issueRequest(leaseId, month, electricUnits, waterUnits)
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return ((Number) JsonPath.read(json, "$.id")).longValue();
    }

    private ResultActions issueRequest(long leaseId, String month, String electricUnits, String waterUnits)
            throws Exception {
        return mockMvc.perform(post("/api/receipts")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {"leaseId":%d,"billingMonth":"%s","electricUnits":%s,"waterUnits":%s}"""
                        .formatted(leaseId, month, electricUnits, waterUnits)));
    }

    private ResultActions record(long receiptId, String amount, String method) throws Exception {
        return mockMvc.perform(post("/api/receipts/{id}/payments", receiptId)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {"amount":%s,"method":"%s"}""".formatted(amount, method)));
    }

    private void setLateInterest(String percent, String graceDays) throws Exception {
        mockMvc.perform(put("/api/apartment-config/late-interest")
                        .with(user("admin"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"lateInterestPercentPerMonth":%s,"graceDays":%s}""".formatted(percent, graceDays)))
                .andExpect(status().isOk());
    }

    private String receiptNo(long receiptId) throws Exception {
        return JsonPath.read(receiptJson(receiptId), "$.receiptNo");
    }

    private BigDecimal balanceDue(long receiptId) throws Exception {
        return new BigDecimal(JsonPath.read(receiptJson(receiptId), "$.balanceDue").toString());
    }

    private long firstPaymentId(long receiptId) throws Exception {
        return ((Number) JsonPath.read(receiptJson(receiptId), "$.payments[0].id")).longValue();
    }

    private String receiptJson(long receiptId) throws Exception {
        return mockMvc.perform(get("/api/receipts/{id}", receiptId))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
    }

    /** ใบล่าสุดของสัญญา รายการเรียงใบที่ออกล่าสุดก่อน และใบของสัญญาออกตามลำดับเดือน */
    private long latestReceiptOf(long leaseId) throws Exception {
        String json = mockMvc.perform(get("/api/receipts").param("leaseId", String.valueOf(leaseId)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        List<Number> latest = JsonPath.read(json, "$[?(@.latest == true)].id");
        assertThat(latest).hasSize(1);
        return latest.getFirst().longValue();
    }

    private static long lastPaymentId(ResultActions response) throws Exception {
        String json = response.andReturn().getResponse().getContentAsString();
        List<Number> ids = JsonPath.read(json, "$.payments[*].id");
        return ids.getLast().longValue();
    }
}
