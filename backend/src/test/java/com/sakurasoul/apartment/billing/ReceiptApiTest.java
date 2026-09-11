package com.sakurasoul.apartment.billing;

import com.jayway.jsonpath.JsonPath;
import com.sakurasoul.apartment.TestcontainersConfiguration;
import com.sakurasoul.apartment.lease.LeaseRepository;
import com.sakurasoul.apartment.tenant.Tenant;
import com.sakurasoul.apartment.tenant.TenantRepository;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDResources;
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

import java.nio.charset.StandardCharsets;
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
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * เทสของ US-10 (ใบเสร็จ SSK-16) US-11 (เอกสารสัญญา SSK-17) และ US-16-S3 (snapshot อัตรา)
 * ระดับ HTTP ยิงผ่าน MockMvc ทะลุถึง PostgreSQL ตัวจริง
 * <p>
 * สิ่งที่จับได้เฉพาะชั้นนี้ชั้นเดียวมีสามเรื่อง หนึ่งคือ constraint จริงที่กันออกใบซ้ำเดือน
 * สองคือไฟล์ PDF ที่ออกมาเปิดได้จริงและมีฟอนต์ไทยฝังอยู่ข้างใน ซึ่งเป็นข้อที่ README
 * เตือนไว้ว่าพังเงียบที่สุด และสามคือ US-16-S3 ที่ต้องเปลี่ยนอัตราของตึกจริง ๆ
 * แล้วดูว่าใบเสร็จเก่าขยับตามหรือเปล่า
 * <p>
 * เครื่องที่ไม่ได้เปิด Docker จะข้ามเทสชุดนี้ ไม่ใช่ล้ม ส่วน CI มี Docker อยู่แล้วจะรันจริง
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
@EnabledIf("dockerAvailable")
// ทุก endpoint ต้องล็อกอินแล้วตั้งแต่ SSK-28 ชุดนี้จึงยิงในนามผู้ใช้ปลอม
@WithMockUser
class ReceiptApiTest {

    /** ห้อง 103 มาจาก migration V2 ห้ามลบทิ้งตอนล้างข้อมูล */
    private static final long ROOM_103 = 3L;

    private static final String BILLING_MONTH = "2026-09";

    /**
     * อัตราที่ล็อกไว้กับสัญญาของเทสนี้ ตั้งให้ต่างจากอัตราตั้งต้นของตึกทุกตัว
     * (ตึกเป็น 8.00 / 18.00 / 300.00 / 250.00 ตั้งแต่ migration V3)
     * ถ้าใบเสร็จเผลอไปอ่าน apartment_config ยอดจะออกมาคนละตัวทันที ไม่ใช่ผ่านไปเฉย ๆ
     */
    private static final String LEASE_BODY = """
            {"roomId":%d,"tenantId":%d,"startDate":"2026-09-01","endDate":null,\
            "monthlyRent":3500,"billingCycle":"MONTHLY","securityDeposit":7000,\
            "electricRatePerUnit":9.5,"waterRatePerUnit":20,\
            "commonAreaFee":350,"internetFee":0}""";

    /** 3500 ค่าเช่า + 350 ส่วนกลาง + 0 อินเทอร์เน็ต + (120 x 9.50) + (15 x 20.00) */
    private static final double EXPECTED_TOTAL = 5290.00;

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ReceiptRepository receiptRepository;

    @Autowired
    private LeaseRepository leaseRepository;

    @Autowired
    private TenantRepository tenantRepository;

    private Tenant tenant;
    private long leaseId;

    static boolean dockerAvailable() {
        return DockerClientFactory.instance().isDockerAvailable();
    }

    /**
     * เลขบัตรขึ้นต้นด้วย 15 เพื่อไม่ให้ชนกับเทสคลาสอื่นที่ใช้ container เดียวกัน
     * เพราะ V6 ตั้ง tenant_national_id_uk ไว้ เลขซ้ำข้าม class จะพังตอนบันทึกทันที
     */
    @BeforeEach
    void createTenantAndLease() throws Exception {
        tenant = tenantRepository.saveAndFlush(
                new Tenant("มานี รักเรียน", "1500000000001", "manee.r", "082-500-0000", null));

        String json = mockMvc.perform(post("/api/leases")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(LEASE_BODY.formatted(ROOM_103, tenant.getId())))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        leaseId = ((Number) JsonPath.read(json, "$.id")).longValue();
    }

    /**
     * ลบใบเสร็จก่อนสัญญา และลบสัญญาก่อนผู้เช่าเสมอ เพราะ foreign key ไล่กันเป็นทอด ๆ
     * <p>
     * คืนอัตราของตึกกลับเป็นชุดที่ migration V3 seed ไว้ด้วย เพราะเทสของ US-16-S3
     * แก้อัตราจริง ๆ และ container ตัวนี้ถูกใช้ร่วมกับ LeaseApiTest กับ
     * ApartmentConfigApiTest ที่ทั้งคู่คาดหวังอัตราตั้งต้น ถ้าไม่คืน เทสสองคลาสนั้น
     * จะพังตามลำดับการรัน ซึ่งเป็นอาการที่ไล่หาสาเหตุยากที่สุดแบบหนึ่ง
     * (ApartmentConfigApiTest ใช้วิธีเดียวกันนี้อยู่แล้ว)
     */
    @AfterEach
    void clearReceiptsAndRestoreRates() throws Exception {
        receiptRepository.deleteAll();
        leaseRepository.deleteAll();
        tenantRepository.deleteAll(List.of(tenant));

        // คืนอัตราผ่าน endpoint จริง เพราะเมธอดที่เขียนทับค่าใน entity เป็น package-private
        // ของ apartmentconfig โดยตั้งใจ (ทางเดียวที่แก้อัตราได้คือผ่าน service ของมันเอง)
        // แนบผู้ใช้มากับคำขอตรง ๆ ไม่พึ่ง @WithMockUser ระดับคลาส เพราะ context ของ
        // annotation นั้นถูกล้างหลังเมธอดเทสจบ ซึ่งใกล้กับจังหวะนี้เกินกว่าจะไว้ใจ
        mockMvc.perform(put("/api/apartment-config")
                        .with(user("admin"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"electricRatePerUnit":8.00,"waterRatePerUnit":18.00,\
                                "commonAreaFee":300.00,"internetFee":250.00}"""))
                .andExpect(status().isOk());
    }

    @Test
    @DisplayName("US-10 ออกใบเสร็จต้องได้ 201 เลขที่รูปแบบ RC-ปี-ลำดับ และทุกบรรทัดคิดจากอัตราของสัญญา")
    void createReturnsNumberedReceiptPricedFromTheLeaseRates() throws Exception {
        createReceipt(BILLING_MONTH, "120", "15")
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.receiptNo").value(matchesPattern("^RC-\\d{4}-\\d{4}$")))
                .andExpect(jsonPath("$.leaseId").value(leaseId))
                .andExpect(jsonPath("$.roomNumber").value("103"))
                .andExpect(jsonPath("$.tenantName").value("มานี รักเรียน"))
                .andExpect(jsonPath("$.billingMonth").value(BILLING_MONTH))
                .andExpect(jsonPath("$.status").value("PENDING"))
                .andExpect(jsonPath("$.paidAt").isEmpty())
                // ไม่ได้ส่ง dueDate มา ต้องตกไปเป็นวันที่ 5 ของเดือนถัดไป
                .andExpect(jsonPath("$.dueDate").value("2026-10-05"))

                .andExpect(jsonPath("$.items").value(hasSize(5)))
                .andExpect(jsonPath("$.items[0].item").value("Room rent"))
                .andExpect(jsonPath("$.items[0].amount").value(3500.00))
                .andExpect(jsonPath("$.items[1].item").value("Common area fee"))
                .andExpect(jsonPath("$.items[1].amount").value(350.00))
                .andExpect(jsonPath("$.items[2].item").value("Internet"))
                .andExpect(jsonPath("$.items[2].amount").value(0.00))
                .andExpect(jsonPath("$.items[3].item").value("Electricity"))
                .andExpect(jsonPath("$.items[3].usageValue").value(120.00))
                .andExpect(jsonPath("$.items[3].usageUnit").value("units"))
                // อัตราของสัญญา ไม่ใช่ 8.00 ที่เป็นอัตราปัจจุบันของตึก
                .andExpect(jsonPath("$.items[3].rate").value(9.50))
                .andExpect(jsonPath("$.items[3].amount").value(1140.00))
                .andExpect(jsonPath("$.items[4].item").value("Water"))
                .andExpect(jsonPath("$.items[4].rate").value(20.00))
                .andExpect(jsonPath("$.items[4].amount").value(300.00))
                .andExpect(jsonPath("$.totalAmount").value(EXPECTED_TOTAL));
    }

    /**
     * US-16-S3 ข้อที่สำคัญที่สุดของตั๋วนี้
     * <p>
     * ใบเสร็จเก็บ snapshot ของอัตราไว้ในตัวเอง การขึ้นค่าไฟของตึกจึงต้องไม่แตะใบที่
     * ออกไปแล้วแม้แต่บาทเดียว ถ้าเทสนี้แดง แปลว่ามีใครเปลี่ยนไปอ่าน apartment_config
     * ตอนแสดงผล ซึ่งจะทำให้ใบเสร็จที่พิมพ์ส่งผู้เช่าไปแล้วไม่ตรงกับที่ระบบโชว์
     */
    @Test
    @DisplayName("US-16-S3 ขึ้นอัตราของตึกหลังออกใบแล้ว ใบเสร็จเดิมต้องไม่ขยับสักบาท")
    void changingApartmentRatesDoesNotTouchIssuedReceipts() throws Exception {
        long receiptId = createdReceiptId(BILLING_MONTH, "120", "15");

        mockMvc.perform(put("/api/apartment-config")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"electricRatePerUnit":99,"waterRatePerUnit":99,\
                                "commonAreaFee":9999,"internetFee":9999}"""))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.electricRatePerUnit").value(99.00));

        mockMvc.perform(get("/api/receipts/{id}", receiptId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[1].amount").value(350.00))
                .andExpect(jsonPath("$.items[2].amount").value(0.00))
                .andExpect(jsonPath("$.items[3].rate").value(9.50))
                .andExpect(jsonPath("$.items[3].amount").value(1140.00))
                .andExpect(jsonPath("$.items[4].rate").value(20.00))
                .andExpect(jsonPath("$.totalAmount").value(EXPECTED_TOTAL));
    }

    @Test
    @DisplayName("ออกใบของเดือนเดิมซ้ำต้องได้ 409 พร้อมข้อความไทยที่บอกว่าออกไปแล้ว")
    void issuingTheSameMonthTwiceIsRejected() throws Exception {
        createReceipt(BILLING_MONTH, "120", "15").andExpect(status().isCreated());

        createReceipt(BILLING_MONTH, "90", "10")
                .andExpect(status().isConflict())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.detail").value("ออกใบเสร็จของเดือนนี้ให้สัญญานี้ไปแล้ว"));

        // ใบที่สองต้องไม่ถูกบันทึกลงไป สัญญานี้ยังมีใบเดียวเหมือนเดิม
        mockMvc.perform(get("/api/receipts").param("leaseId", String.valueOf(leaseId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").value(hasSize(1)));
    }

    @Test
    @DisplayName("หน่วยไฟติดลบต้องได้ 400 ที่ detail บอกชื่อช่องที่ผิด ไม่ใช่ข้อความรวม ๆ")
    void negativeUnitsAreRejected() throws Exception {
        createReceipt(BILLING_MONTH, "-1", "15")
                .andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.detail").value("หน่วยไฟต้องไม่ติดลบ"))
                .andExpect(jsonPath("$.fields.electricUnits").value("หน่วยไฟต้องไม่ติดลบ"));

        createReceipt(BILLING_MONTH, "120", "-0.5")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value("หน่วยน้ำต้องไม่ติดลบ"));
    }

    @Test
    @DisplayName("เดือนที่รูปแบบผิดต้องได้ 400 และไม่ส่งเดือนมาเลยต้องได้ข้อความว่าต้องระบุ")
    void badBillingMonthIsRejected() throws Exception {
        createReceipt("2026-9", "120", "15")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value("รูปแบบเดือนต้องเป็น YYYY-MM"));

        mockMvc.perform(post("/api/receipts")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"leaseId":%d,"electricUnits":120,"waterUnits":15}""".formatted(leaseId)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value("ต้องระบุเดือนที่เรียกเก็บ"));
    }

    @Test
    @DisplayName("สัญญาที่ไม่มีต้องได้ 404 ที่บอกว่าไม่พบอะไร id ไหน")
    void unknownLeaseIsNotFound() throws Exception {
        mockMvc.perform(post("/api/receipts")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"leaseId":999999,"billingMonth":"2026-09",\
                                "electricUnits":120,"waterUnits":15}"""))
                .andExpect(status().isNotFound())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.detail").value("ไม่พบสัญญา id 999999"));
    }

    @Test
    @DisplayName("กดรับชำระแล้วต้องเป็น PAID พร้อมวันที่ชำระ และกดซ้ำต้องได้ 409")
    void payingMarksTheReceiptPaidAndRejectsASecondPayment() throws Exception {
        long receiptId = createdReceiptId(BILLING_MONTH, "120", "15");

        pay(receiptId, """
                {"paymentMethod":"โอนผ่านธนาคาร"}""")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("PAID"))
                .andExpect(jsonPath("$.paidAt").isNotEmpty())
                .andExpect(jsonPath("$.paymentMethod").value("โอนผ่านธนาคาร"));

        pay(receiptId, """
                {"paymentMethod":"เงินสด"}""")
                .andExpect(status().isConflict())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.detail").value("ใบเสร็จนี้ชำระแล้ว"));

        // ช่องทางเดิมต้องไม่ถูกเขียนทับด้วยครั้งที่กดซ้ำ
        mockMvc.perform(get("/api/receipts/{id}", receiptId))
                .andExpect(jsonPath("$.paymentMethod").value("โอนผ่านธนาคาร"));
    }

    /**
     * ป้องกันอาการที่ Javadoc ของ Receipt.markPaid บอกว่ากันไว้แล้ว แต่กันไม่ได้จริงถ้าไม่มี
     * อะไรบังคับที่ database คือกดปุ่มสองครั้งติดหรือเปิดค้างไว้สองแท็บ แล้วคำขอที่สอง
     * เขียนทับวันที่ชำระกับช่องทางการจ่ายของคำขอแรกเงียบ ๆ โดยตอบ 200 ทั้งคู่
     * <p>
     * ปล่อยพร้อมกันด้วย CountDownLatch แบบเดียวกับ LeaseApiTest ถ้าปล่อยให้ต่างคนต่างเริ่ม
     * thread ที่ขึ้นก่อนจะทำเสร็จก่อนอีก thread จะเริ่มด้วยซ้ำ ซึ่งไม่ได้เทสอะไรเลย
     */
    @Test
    @DisplayName("ยิงรับชำระใบเดียวกันพร้อมกันสองคำขอ ต้องผ่านคำขอเดียว อีกคำขอได้ 409")
    void concurrentPaymentsMarkTheReceiptPaidExactlyOnce() throws Exception {
        long receiptId = createdReceiptId(BILLING_MONTH, "120", "15");

        CountDownLatch start = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(2);

        try {
            List<Future<Integer>> results = new ArrayList<>();
            for (String paymentMethod : List.of("โอนผ่านธนาคาร", "เงินสด")) {
                results.add(pool.submit(() -> {
                    start.await();
                    return mockMvc.perform(post("/api/receipts/{id}/pay", receiptId)
                                    // @WithMockUser ระดับคลาสตั้ง SecurityContext ไว้ใน thread
                                    // ของเทสเท่านั้น สอง thread ในพูลนี้จึงมองไม่เห็นและจะได้ 401
                                    // ทั้งคู่ ต้องแนบผู้ใช้มากับคำขอตรง ๆ (เหมือน LeaseApiTest)
                                    .with(user("admin"))
                                    .contentType(MediaType.APPLICATION_JSON)
                                    .content("""
                                            {"paymentMethod":"%s"}""".formatted(paymentMethod)))
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

        // ใบนี้ต้องมีวันที่ชำระเดียว และเป็นช่องทางของคำขอที่ชนะ ไม่ใช่ค่าที่ถูกเขียนทับทีหลัง
        mockMvc.perform(get("/api/receipts/{id}", receiptId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("PAID"))
                .andExpect(jsonPath("$.paidAt").isNotEmpty())
                .andExpect(jsonPath("$.paymentMethod").isNotEmpty());
    }

    /**
     * ใบเสร็จที่ออกไปแล้วลบไม่ได้แก้ไม่ได้ เดือนที่พิมพ์ผิดจึงต้องถูกปฏิเสธตั้งแต่ตอนออก
     * สัญญาของเทสนี้เริ่ม 2026-09-01 เดือนสิงหาคมจึงเป็นเดือนที่ผู้เช่ายังไม่ได้เข้าอยู่
     */
    @Test
    @DisplayName("ออกใบของเดือนที่อยู่นอกช่วงสัญญาต้องได้ 400 พร้อมข้อความไทย")
    void billingMonthOutsideTheLeasePeriodIsRejected() throws Exception {
        createReceipt("2026-08", "120", "15")
                .andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.detail").value("เดือนที่เรียกเก็บอยู่นอกช่วงสัญญา"));

        // ต้องไม่มีใบไหนถูกบันทึกลงไป
        mockMvc.perform(get("/api/receipts").param("leaseId", String.valueOf(leaseId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").value(hasSize(0)));
    }

    @Test
    @DisplayName("รายการใบเสร็จต้องเรียงใบใหม่สุดขึ้นก่อน และกรองด้วย status ได้")
    void listSortsNewestFirstAndFiltersByStatus() throws Exception {
        long september = createdReceiptId(BILLING_MONTH, "120", "15");
        createdReceiptId("2026-10", "100", "12");

        mockMvc.perform(get("/api/receipts").param("leaseId", String.valueOf(leaseId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").value(hasSize(2)))
                // ใบของเดือนตุลาคมถูกออกทีหลัง จึงต้องอยู่บนสุด
                .andExpect(jsonPath("$[0].billingMonth").value("2026-10"))
                .andExpect(jsonPath("$[1].billingMonth").value(BILLING_MONTH));

        pay(september, "{}").andExpect(status().isOk());

        mockMvc.perform(get("/api/receipts").param("status", "PAID"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").value(hasSize(1)))
                .andExpect(jsonPath("$[0].billingMonth").value(BILLING_MONTH));

        mockMvc.perform(get("/api/receipts")
                        .param("status", "PENDING")
                        .param("month", "2026-10"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").value(hasSize(1)))
                .andExpect(jsonPath("$[0].billingMonth").value("2026-10"));
    }

    /**
     * สิ่งที่เทสนี้ป้องกันคืออาการที่ README เตือนไว้ว่าหลอกที่สุด คือ PDF ที่เปิดขึ้นแต่
     * ตัวอักษรไทยหายทั้งใบ เพราะฟอนต์ไม่ได้ถูก embed ลงไปในไฟล์
     * <p>
     * เช็คแค่ว่า response เป็น application/pdf ไม่พอ และเช็คว่าขึ้นต้นด้วย %PDF ก็ยังไม่พอ
     * ต้องเปิดไฟล์ด้วย PDFBox แล้วไล่ดูชื่อฟอนต์ใน resource ของทุกหน้าจริง ๆ
     * ชื่อที่ได้จะมี prefix ของ subset ติดมาด้วย เช่น AAAAAA+Sarabun จึงเทียบแบบ contains
     */
    @Test
    @DisplayName("US-10 ดาวน์โหลดใบเสร็จเป็น PDF ต้องได้ไฟล์ที่เปิดได้และมีฟอนต์ไทยฝังอยู่ข้างใน")
    void receiptPdfIsADownloadableFileWithTheThaiFontEmbedded() throws Exception {
        long receiptId = createdReceiptId(BILLING_MONTH, "120", "15");
        String receiptNo = JsonPath.read(mockMvc.perform(get("/api/receipts/{id}", receiptId))
                .andReturn().getResponse().getContentAsString(), "$.receiptNo");

        byte[] pdf = mockMvc.perform(get("/api/receipts/{id}/pdf", receiptId))
                .andExpect(status().isOk())
                .andExpect(content().contentType(MediaType.APPLICATION_PDF))
                .andExpect(header().string("Content-Disposition",
                        "attachment; filename=\"" + receiptNo + ".pdf\""))
                .andReturn().getResponse().getContentAsByteArray();

        assertPdfWithThaiFont(pdf);
    }

    @Test
    @DisplayName("US-11 ดาวน์โหลดเอกสารสัญญาเป็น PDF ต้องได้ไฟล์ที่เปิดได้และมีฟอนต์ไทยฝังอยู่ข้างใน")
    void leaseContractPdfIsADownloadableFileWithTheThaiFontEmbedded() throws Exception {
        byte[] pdf = mockMvc.perform(get("/api/leases/{id}/contract.pdf", leaseId))
                .andExpect(status().isOk())
                .andExpect(content().contentType(MediaType.APPLICATION_PDF))
                .andExpect(header().string("Content-Disposition",
                        "attachment; filename=\"lease-contract-" + leaseId + ".pdf\""))
                .andReturn().getResponse().getContentAsByteArray();

        assertPdfWithThaiFont(pdf);
    }

    @Test
    @DisplayName("ขอ PDF ของใบเสร็จหรือสัญญาที่ไม่มีต้องได้ 404 เป็น ProblemDetail ไม่ใช่ไฟล์เปล่า")
    void pdfOfUnknownDocumentIsNotFound() throws Exception {
        mockMvc.perform(get("/api/receipts/{id}/pdf", 999999))
                .andExpect(status().isNotFound())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.detail").value("ไม่พบใบเสร็จ id 999999"));

        mockMvc.perform(get("/api/leases/{id}/contract.pdf", 999999))
                .andExpect(status().isNotFound())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.detail").value("ไม่พบสัญญา id 999999"));
    }

    /** เปิดไฟล์จริงแล้วยืนยันสองข้อ คือมีหน้ากระดาษอย่างน้อยหนึ่งหน้า และฟอนต์ Sarabun ถูกฝังมาด้วย */
    private static void assertPdfWithThaiFont(byte[] pdf) throws Exception {
        assertThat(new String(pdf, 0, 4, StandardCharsets.ISO_8859_1)).isEqualTo("%PDF");

        try (PDDocument document = PDDocument.load(pdf)) {
            assertThat(document.getNumberOfPages()).isGreaterThanOrEqualTo(1);

            List<String> fontNames = new ArrayList<>();
            for (PDPage page : document.getPages()) {
                PDResources resources = page.getResources();
                for (COSName fontName : resources.getFontNames()) {
                    fontNames.add(resources.getFont(fontName).getName());
                }
            }

            assertThat(fontNames)
                    .as("ฟอนต์ที่ฝังอยู่ในไฟล์ ต้องมี Sarabun ไม่งั้นตัวอักษรไทยจะหายตอนเปิดบนเครื่องอื่น")
                    .isNotEmpty()
                    .anyMatch(name -> name.contains("Sarabun"));
        }
    }

    private ResultActions createReceipt(String billingMonth, String electricUnits, String waterUnits)
            throws Exception {
        return mockMvc.perform(post("/api/receipts")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {"leaseId":%d,"billingMonth":"%s","electricUnits":%s,"waterUnits":%s}"""
                        .formatted(leaseId, billingMonth, electricUnits, waterUnits)));
    }

    private ResultActions pay(long receiptId, String body) throws Exception {
        return mockMvc.perform(post("/api/receipts/{id}/pay", receiptId)
                .contentType(MediaType.APPLICATION_JSON)
                .content(body));
    }

    /**
     * ออกใบเสร็จแล้วคืน id ที่ database ออกให้
     * <p>
     * อ่าน id จาก response แทนที่จะเดาว่าเป็น 1 เพราะ sequence ไม่ได้ถูกรีเซ็ตระหว่างเทส
     * (@AfterEach ลบแถวอย่างเดียว) ใบแรกของเทสที่สองจึงไม่ใช่ id 1 อีกแล้ว
     */
    private long createdReceiptId(String billingMonth, String electricUnits, String waterUnits)
            throws Exception {
        String json = createReceipt(billingMonth, electricUnits, waterUnits)
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return ((Number) JsonPath.read(json, "$.id")).longValue();
    }
}
