package com.sakurasoul.apartment.billing;

import com.jayway.jsonpath.JsonPath;
import com.sakurasoul.apartment.SqlStatementCounter;
import com.sakurasoul.apartment.TestcontainersConfiguration;
import com.sakurasoul.apartment.lease.LeaseRepository;
import com.sakurasoul.apartment.pdf.PdfImages;
import com.sakurasoul.apartment.pdf.PdfText;
import com.sakurasoul.apartment.promptpay.QrCodes;
import com.sakurasoul.apartment.room.Room;
import com.sakurasoul.apartment.room.RoomRepository;
import com.sakurasoul.apartment.room.RoomType;
import com.sakurasoul.apartment.tenant.Tenant;
import com.sakurasoul.apartment.tenant.TenantRepository;
import org.junit.jupiter.api.AfterEach;
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
import org.testcontainers.DockerClientFactory;

import java.awt.image.BufferedImage;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;
import java.util.stream.LongStream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.anonymous;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * พิมพ์ใบเสร็จรวมผ่าน API ถึง PostgreSQL จริง (SSK-169) ตามสัญญา API หัวข้อ "พิมพ์ใบเสร็จรวม"
 * <p>
 * สร้างห้องของตัวเองชั้น 8 ถึง 10 (801-812, 901-911, 1001) ไม่แตะห้องของเทสคลาสอื่น และมีเลขห้องสี่หลัก
 * ให้เช็คลำดับแบบผังตึกได้จริง ลบห้อง สัญญา ผู้เช่า และใบทั้งหมดหลังแต่ละเทส เลขบัตรขึ้นต้นด้วย 27
 * <p>
 * เครื่องที่ไม่ได้เปิด Docker จะข้ามเทสชุดนี้ ไม่ใช่ล้ม ส่วน CI มี Docker อยู่แล้วจะรันจริง
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
@EnabledIf("dockerAvailable")
@WithMockUser
class ReceiptPrintApiTest {

    private static final String LEASE_BODY = """
            {"roomId":%d,"tenantId":%d,"startDate":"2026-09-01","endDate":null,\
            "monthlyRent":3500,"billingCycle":"MONTHLY","securityDeposit":7000,\
            "electricRatePerUnit":9.5,"waterRatePerUnit":20,\
            "commonAreaFee":350,"internetFee":0}""";

    private static final String KASIKORN = """
            {"bankName":"Kasikornbank","accountName":"Sakura Soul Apartment",\
            "accountNumber":"012-3-45678-9","promptPayId":"081-234-5678"}""";

    /** เลขห้องตามผังตึกที่เทสนี้สร้าง: ชั้น 8 สิบสองห้อง ชั้น 9 สิบเอ็ดห้อง และ 1001 */
    private static final List<String> LAYOUT = layout();

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JdbcClient jdbc;

    @Autowired
    private LeaseRepository leaseRepository;

    @Autowired
    private TenantRepository tenantRepository;

    @Autowired
    private RoomRepository roomRepository;

    private final List<Room> rooms = new ArrayList<>();
    private final List<Tenant> tenants = new ArrayList<>();

    static boolean dockerAvailable() {
        return DockerClientFactory.instance().isDockerAvailable();
    }

    @AfterEach
    void clearData() {
        BillingTables.clear(jdbc);
        leaseRepository.deleteAll();
        tenantRepository.deleteAll(tenants);
        roomRepository.deleteAll(rooms);
        jdbc.sql("""
                UPDATE apartment_config
                SET bank_name = NULL, bank_account_name = NULL, bank_account_number = NULL, bank_prompt_pay_id = NULL
                WHERE id = 1""").update();
    }

    /**
     * AC ของการ์ด: 24 ใบของเดือนหนึ่งได้ 24 หน้าตามผังตึก แต่ละหน้าเหมือนไฟล์ใบเดี่ยว ฟอนต์ไทยทุกหน้า และไม่เกิน 10 วินาที
     * จับเวลาครั้งที่สองหลังอุ่นเครื่องแล้ว (โหลด class เตรียมฟอนต์และ template) ตัวเลขพิมพ์ไว้ใน output ของเทส
     */
    @Test
    @DisplayName("SSK-169 ทั้งเดือน 24 ใบได้ 24 หน้าตามผังตึก แต่ละหน้าเหมือนไฟล์ใบเดี่ยว ฟอนต์ไทยทุกหน้า ภายใน 10 วินาที")
    void aWholeMonthPrintsInBuildingOrderLikeTheSingleFiles() throws Exception {
        Map<String, Long> receiptByRoom = new LinkedHashMap<>();
        for (String room : shuffledLayout()) {
            receiptByRoom.put(room, issue(lease(room), "2026-09"));
        }
        print("{\"month\":\"2026-09\"}").andExpect(status().isOk());

        long started = System.nanoTime();
        byte[] pdf = print("{\"month\":\"2026-09\"}")
                .andExpect(status().isOk())
                .andExpect(content().contentType(MediaType.APPLICATION_PDF))
                .andExpect(header().string("Content-Disposition", "attachment; filename=\"receipts-2026-09.pdf\""))
                .andReturn().getResponse().getContentAsByteArray();
        long millis = TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - started);
        System.out.println("SSK-169 print 24 receipts took " + millis + " ms, " + pdf.length + " bytes");

        assertThat(millis).as("เวลาพิมพ์ 24 ใบ").isLessThan(10_000);
        assertThat(PdfText.pages(pdf)).isEqualTo(24);
        for (int page = 1; page <= 24; page++) {
            String room = LAYOUT.get(page - 1);
            byte[] single = singlePdf(receiptByRoom.get(room));
            assertThat(PdfText.textOfPage(pdf, page)).as("หน้า %d ห้อง %s", page, room)
                    .contains("Unit " + room)
                    .isEqualTo(PdfText.textOfPage(single, 1));
            assertThat(PdfText.fontNamesOfPage(pdf, page)).as("หน้า %d", page).anyMatch(name -> name.contains("Sarabun"));
        }
    }

    /**
     * สี่สถานะในคำขอเดียว เรียงสลับและมี id ซ้ำ: ใบ ก.ย. ที่ถูกยกยอด กับใบ ต.ค. ที่ต้องจ่ายของห้อง 801 ใบที่จ่ายครบของห้อง 802
     * และใบที่ออกก่อนตั้งบัญชีของห้อง 803 มีรูป QR รูปเดียวในไฟล์ บนหน้าของใบ ต.ค. ห้อง 801
     */
    @Test
    @DisplayName("SSK-169 เลือกใบเองพิมพ์ได้ทุกสถานะ id ซ้ำพิมพ์ครั้งเดียว เรียงตามห้อง และ QR อยู่เฉพาะหน้าของใบที่ต้องจ่าย")
    void selectedReceiptsOfEveryStatusPrintOnceInRoomOrder() throws Exception {
        long noBank = issue(lease("803"), "2026-09");
        setBankAccount(KASIKORN);
        long lease801 = lease("801");
        long carried = issue(lease801, "2026-09");
        long due = issue(lease801, "2026-10");
        long paid = issue(lease("802"), "2026-09");
        pay(paid, 4425).andExpect(jsonPath("$.status").value("PAID"));

        byte[] pdf = print("{\"receiptIds\":[%d,%d,%d,%d,%d]}".formatted(due, noBank, paid, carried, due))
                .andExpect(status().isOk())
                .andExpect(header().string("Content-Disposition", "attachment; filename=\"receipts.pdf\""))
                .andReturn().getResponse().getContentAsByteArray();

        List<Long> expectedOrder = List.of(carried, due, paid, noBank);
        assertThat(PdfText.pages(pdf)).isEqualTo(4);
        for (int page = 1; page <= 4; page++) {
            assertThat(PdfText.textOfPage(pdf, page)).as("หน้า %d", page)
                    .isEqualTo(PdfText.textOfPage(singlePdf(expectedOrder.get(page - 1)), 1));
        }
        List<List<BufferedImage>> images = PdfImages.byPage(pdf);
        assertThat(images.get(0)).as("ใบที่ถูกยกยอด").isEmpty();
        assertThat(images.get(1)).singleElement()
                .satisfies(image -> assertThat(QrCodes.decode(image)).isEqualTo(payloadOf(due)));
        assertThat(images.get(2)).as("ใบที่จ่ายครบ").isEmpty();
        assertThat(images.get(3)).as("ใบที่ออกก่อนตั้งบัญชี").isEmpty();
    }

    @Test
    @DisplayName("SSK-169 ทั้งเดือนกรองด้วย status ได้ ไม่มีใบตามตัวกรองได้ 400 ไม่ใช่ PDF เปล่า")
    void theMonthFormFiltersByStatus() throws Exception {
        long paid = issue(lease("801"), "2026-09");
        issue(lease("802"), "2026-09");
        pay(paid, 4425);

        byte[] pdf = print("{\"month\":\"2026-09\",\"status\":\"PAID\"}")
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsByteArray();
        assertThat(PdfText.pages(pdf)).isEqualTo(1);
        assertThat(PdfText.textOfPage(pdf, 1)).contains("Unit 801", "Paid on 3 Oct 2026");

        assertDetail(print("{\"month\":\"2026-09\",\"status\":\"PARTIAL\"}"), "No receipts to print for 2026-09");
    }

    @Test
    @DisplayName("SSK-169 บาง id ไม่มีได้ 404 บอกทุก id ที่ขาดเรียงตามตัวเลข ไม่พิมพ์ไฟล์ที่ไม่ครบ")
    void missingReceiptsAreAllReported() throws Exception {
        long existing = issue(lease("801"), "2026-09");

        print("{\"receiptIds\":[%d,999998,999997]}".formatted(existing))
                .andExpect(status().isNotFound())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.detail").value("Receipts not found: 999997, 999998"));
    }

    @Test
    @DisplayName("SSK-169 คำขอที่ผิดได้ 400 เป็น problem+json พร้อมข้อความตามสัญญาทุกแบบ")
    void badRequestsGetTheContractMessages() throws Exception {
        String hundredAndOne = LongStream.rangeClosed(1, 101).mapToObj(String::valueOf)
                .collect(Collectors.joining(",", "{\"receiptIds\":[", "]}"));
        Map<String, String> cases = new LinkedHashMap<>();
        cases.put("{}", "Choose either receipts or a month to print");
        cases.put("{\"receiptIds\":[]}", "Choose either receipts or a month to print");
        cases.put("{\"receiptIds\":[1],\"month\":\"2026-09\"}", "Choose either receipts or a month to print");
        cases.put(hundredAndOne, "Choose at most 100 receipts");
        cases.put("{\"month\":\"2026-13\"}", "The billing month must be in YYYY-MM format");
        cases.put("{\"month\":\"2026-09\",\"status\":\"DONE\"}", "status must be PENDING, PARTIAL or PAID");
        cases.put("{\"month\":\"2031-01\"}", "No receipts to print for 2031-01");

        for (Map.Entry<String, String> bad : cases.entrySet()) {
            assertDetail(print(bad.getKey()), bad.getValue());
        }
        assertDetail(mockMvc.perform(post("/api/receipts/print")), "Choose either receipts or a month to print");
    }

    /**
     * จำนวนคำสั่ง SQL ไม่โตตามจำนวนใบ ทั้งแบบเลือกใบเองและแบบทั้งเดือน (ไม่มี N+1 ของบรรทัด ผู้เช่า ห้อง หรือการชำระ)
     * ทุกใบมีการชำระ สองใบแรกจ่ายครบ ที่เหลือจ่ายบางส่วน การโหลดการชำระกับการตัดยอดจึงอยู่ในตัวเลขด้วย
     * และตัวกรอง PAID ได้สองใบของเดือนเดียวกันไว้เทียบกับทั้งเดือน
     * <p>
     * บรรทัดของใบกับการตัดยอดโหลดเป็นชุดละ 50 (@BatchSize) สองใบกับยี่สิบสี่ใบอยู่ในชุดเดียวกัน ตัวเลขจึงต้องเท่ากันพอดี
     * นับเฉพาะคำสั่งของคำขอนั้น ({@link SqlStatementCounter}) งานเบื้องหลังที่ตื่นทุกนาทีจึงไม่ปนเข้ามา
     */
    @Test
    @DisplayName("SSK-169 พิมพ์ 2 ใบกับ 24 ใบใช้คำสั่ง SQL เท่ากัน ทั้งเลือกใบเองและทั้งเดือน รวมการชำระ")
    void theQueryCountDoesNotGrowWithTheReceipts() throws Exception {
        List<Long> ids = new ArrayList<>();
        for (String room : LAYOUT) {
            long receipt = issue(lease(room), "2026-09");
            pay(receipt, ids.size() < 2 ? 4425 : 1000);
            ids.add(receipt);
        }

        int twoById = statementsFor(idsBody(ids.subList(0, 2)));
        int allById = statementsFor(idsBody(ids));
        int twoByMonth = statementsFor("{\"month\":\"2026-09\",\"status\":\"PAID\"}");
        int allByMonth = statementsFor("{\"month\":\"2026-09\"}");
        System.out.printf("SSK-169 SQL statements: by id 2=%d 24=%d, by month 2=%d 24=%d%n",
                twoById, allById, twoByMonth, allByMonth);

        assertThat(twoById).isPositive();
        assertThat(allById).as("เลือกใบเอง").isEqualTo(twoById);
        assertThat(allByMonth).as("ทั้งเดือน").isEqualTo(twoByMonth);
    }

    /**
     * fetch ของหน้าเว็บ (send ใน client.ts) ตั้ง Accept: application/json ให้ทุกคำขอ endpoint นี้จึงไม่ประกาศ produces
     * ถ้าประกาศ คำขอแบบนั้นได้ 406 ทุกครั้ง แม้แต่ตอน error ที่ข้อความจริงจะหายไป
     */
    @Test
    @DisplayName("SSK-169 ส่ง Accept เป็น JSON หรือ PDF ก็ได้ไฟล์ PDF และ error ยังเป็น problem+json พร้อมข้อความจริง")
    void anyAcceptHeaderGetsThePdfOrTheRealError() throws Exception {
        long receipt = issue(lease("801"), "2026-09");

        for (MediaType accept : List.of(MediaType.APPLICATION_JSON, MediaType.APPLICATION_PDF)) {
            mockMvc.perform(post("/api/receipts/print").accept(accept)
                            .contentType(MediaType.APPLICATION_JSON).content(idsBody(List.of(receipt))))
                    .andExpect(status().isOk())
                    .andExpect(content().contentType(MediaType.APPLICATION_PDF));
            mockMvc.perform(post("/api/receipts/print").accept(accept)
                            .contentType(MediaType.APPLICATION_JSON).content("{\"receiptIds\":[999999]}"))
                    .andExpect(status().isNotFound())
                    .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                    .andExpect(jsonPath("$.detail").value("Receipts not found: 999999"));
        }
    }

    @Test
    @DisplayName("SSK-169 ไม่ได้ล็อกอินได้ 401")
    void signedOutRequestsAreRejected() throws Exception {
        mockMvc.perform(post("/api/receipts/print").with(anonymous())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"month\":\"2026-09\"}"))
                .andExpect(status().isUnauthorized());
    }

    private int statementsFor(String body) throws Exception {
        return SqlStatementCounter.count(() -> print(body).andExpect(status().isOk()));
    }

    private static String idsBody(List<Long> ids) {
        return ids.stream().map(String::valueOf).collect(Collectors.joining(",", "{\"receiptIds\":[", "]}"));
    }

    private ResultActions print(String body) throws Exception {
        return mockMvc.perform(post("/api/receipts/print").contentType(MediaType.APPLICATION_JSON).content(body));
    }

    private void assertDetail(ResultActions response, String detail) throws Exception {
        response.andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.detail").value(detail));
    }

    private byte[] singlePdf(long receiptId) throws Exception {
        return mockMvc.perform(get("/api/receipts/{id}/pdf", receiptId))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsByteArray();
    }

    private String payloadOf(long receiptId) throws Exception {
        return JsonPath.read(mockMvc.perform(get("/api/receipts/{id}", receiptId))
                .andReturn().getResponse().getContentAsString(), "$.promptPayPayload");
    }

    private void setBankAccount(String body) throws Exception {
        mockMvc.perform(put("/api/apartment-config/bank-account").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk());
    }

    /** สัญญาใหม่ในห้องที่เทสนี้สร้างเอง ห้องเดี่ยวค่าเช่า 3,500 */
    private long lease(String roomNumber) throws Exception {
        int floor = Integer.parseInt(roomNumber.substring(0, roomNumber.length() - 2));
        Room room = roomRepository.saveAndFlush(new Room(roomNumber, (short) floor, RoomType.SINGLE));
        rooms.add(room);
        Tenant tenant = tenantRepository.saveAndFlush(new Tenant("มานี รักเรียน",
                String.format("27%011d", tenants.size() + 1), null, "082-270-0001", null));
        tenants.add(tenant);
        String json = mockMvc.perform(post("/api/leases").contentType(MediaType.APPLICATION_JSON)
                        .content(LEASE_BODY.formatted(room.getId(), tenant.getId())))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return ((Number) JsonPath.read(json, "$.id")).longValue();
    }

    /** ไฟ 50 หน่วย น้ำ 5 หน่วย ได้ 3,500 + 350 + 475 + 100 = 4,425.00 */
    private long issue(long leaseId, String month) throws Exception {
        String json = mockMvc.perform(post("/api/receipts").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"leaseId\":%d,\"billingMonth\":\"%s\",\"electricUnits\":50,\"waterUnits\":5}"
                                .formatted(leaseId, month)))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return ((Number) JsonPath.read(json, "$.id")).longValue();
    }

    private ResultActions pay(long receiptId, int amount) throws Exception {
        return mockMvc.perform(post("/api/receipts/{id}/payments", receiptId).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"amount\":%d,\"paidOn\":\"2026-10-03\",\"method\":\"CASH\"}".formatted(amount)))
                .andExpect(status().isCreated());
    }

    private static List<String> layout() {
        List<String> rooms = new ArrayList<>();
        for (int n = 1; n <= 12; n++) {
            rooms.add(String.format("8%02d", n));
        }
        for (int n = 1; n <= 11; n++) {
            rooms.add(String.format("9%02d", n));
        }
        rooms.add("1001");
        return List.copyOf(rooms);
    }

    /** ลำดับที่สร้างไม่ตรงกับผังตึก ห้อง 1001 มาก่อน ชั้น 9 มาก่อนชั้น 8 ให้ลำดับในไฟล์มาจากการเรียงจริง */
    private static List<String> shuffledLayout() {
        List<String> rooms = new ArrayList<>(LAYOUT);
        java.util.Collections.reverse(rooms);
        return rooms;
    }
}
