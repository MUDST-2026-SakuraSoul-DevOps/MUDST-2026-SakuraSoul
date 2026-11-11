package com.sakurasoul.apartment.reports;

import com.jayway.jsonpath.JsonPath;
import com.sakurasoul.apartment.SqlStatementCounter;
import com.sakurasoul.apartment.TestcontainersConfiguration;
import com.sakurasoul.apartment.billing.BillingTables;
import com.sakurasoul.apartment.lease.LeaseRepository;
import com.sakurasoul.apartment.room.Room;
import com.sakurasoul.apartment.room.RoomRepository;
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
import org.testcontainers.DockerClientFactory;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.anonymous;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * รายงานสรุป (SSK-170) ผ่าน API ถึง PostgreSQL จริง
 * <p>
 * เรื่องเดียวกับตัวอย่างในสัญญา API เลื่อนมาเป็น ส.ค. ก.ย. 2569 แบบ CarryForwardApiTest ให้ทุกเดือนอยู่ในอดีตเสมอ
 * สัญญาใช้อัตราตั้งต้นของตึก (ไฟ 8 น้ำ 18 ส่วนกลาง 300 อินเทอร์เน็ต 250) ห้องชั้น 1 ค่าเช่า 3,500 ตามชนิดห้อง
 * ใบ ส.ค. (ไฟ 85 น้ำ 15) ค่าใช้จ่าย 5,000.00 ใบ ก.ย. (ไฟ 102 น้ำ 13) 5,100.00 ดอกเบี้ย 1.50% ไม่มีวันผ่อนผัน
 * ตัวเลขดอกเบี้ยไม่ขึ้นกับวันที่รันเทส ดูเหตุผลที่ CarryForwardApiTest
 * <p>
 * ทุกเทสล้างใบเสร็จทั้งหมดหลังจบ รายงานจึงเห็นแค่ใบของเทสนั้น
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
@EnabledIf("dockerAvailable")
@WithMockUser
class SummaryReportApiTest {

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

    private final List<Tenant> tenants = new ArrayList<>();

    static boolean dockerAvailable() {
        return DockerClientFactory.instance().isDockerAvailable();
    }

    @BeforeEach
    void chargeLateInterest() throws Exception {
        setLateInterest("1.5");
    }

    /** ลบตามลำดับ foreign key แล้วคืนดอกเบี้ยตั้งต้น สัญญาของเทสคลาสอื่นคัดลอกค่านี้ */
    @AfterEach
    void clearData() throws Exception {
        BillingTables.clear(jdbc);
        jdbc.sql("DELETE FROM lease_extra_charge").update();
        leaseRepository.deleteAll();
        jdbc.sql("DELETE FROM room_extra_charge WHERE label = 'Parking'").update();
        tenantRepository.deleteAll(tenants);
        tenants.clear();
        setLateInterest("0");
    }

    @Test
    @DisplayName("SSK-170 เรื่องในสัญญา API: สองเดือนของห้องเดียว billed 10,145 received 5,000 outstanding 5,145 "
            + "เงินที่รับบนบิล ก.ย. นับเป็นของใบ ส.ค.")
    void theContractExample() throws Exception {
        long lease = lease("110", "มานี รักเรียน", "2026-07-01", null);
        long august = issue(lease, "2026-08", "85", "15");
        pay(august, "2000");
        long september = issue(lease, "2026-09", "102", "13");
        pay(september, "3000");

        summary("groupBy=unit&from=2026-08&to=2026-09")
                .andExpect(status().isOk())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                .andExpect(jsonPath("$.groupBy").value("unit"))
                .andExpect(jsonPath("$.from").value("2026-08"))
                .andExpect(jsonPath("$.to").value("2026-09"))
                .andExpect(jsonPath("$.rows").value(hasSize(1)))
                .andExpect(jsonPath("$.rows[0].key").value("110"))
                .andExpect(jsonPath("$.rows[0].label").value("110"))
                .andExpect(jsonPath("$.rows[0].receiptCount").value(2))
                .andExpect(jsonPath("$.rows[0].rent").value(7000.00))
                .andExpect(jsonPath("$.rows[0].electricUnits").value(187.00))
                .andExpect(jsonPath("$.rows[0].electricAmount").value(1496.00))
                .andExpect(jsonPath("$.rows[0].waterUnits").value(28.00))
                .andExpect(jsonPath("$.rows[0].waterAmount").value(504.00))
                .andExpect(jsonPath("$.rows[0].commonAreaFee").value(600.00))
                .andExpect(jsonPath("$.rows[0].internetFee").value(500.00))
                .andExpect(jsonPath("$.rows[0].extraCharges").value(0.00))
                .andExpect(jsonPath("$.rows[0].lateInterest").value(45.00))
                .andExpect(jsonPath("$.rows[0].billed").value(10145.00))
                .andExpect(jsonPath("$.rows[0].received").value(5000.00))
                .andExpect(jsonPath("$.rows[0].outstanding").value(5145.00))
                .andExpect(jsonPath("$.total.receiptCount").value(2))
                .andExpect(jsonPath("$.total.billed").value(10145.00))
                .andExpect(jsonPath("$.total.received").value(5000.00))
                .andExpect(jsonPath("$.total.outstanding").value(5145.00))
                .andExpect(jsonPath("$.total.key").doesNotExist());

        summary("groupBy=month&from=2026-08&to=2026-09")
                .andExpect(jsonPath("$.rows[0].key").value("2026-08"))
                .andExpect(jsonPath("$.rows[0].label").value("Aug 2026"))
                .andExpect(jsonPath("$.rows[0].billed").value(5000.00))
                .andExpect(jsonPath("$.rows[0].received").value(5000.00))
                .andExpect(jsonPath("$.rows[0].outstanding").value(0.00))
                .andExpect(jsonPath("$.rows[1].key").value("2026-09"))
                .andExpect(jsonPath("$.rows[1].label").value("Sep 2026"))
                .andExpect(jsonPath("$.rows[1].billed").value(5145.00))
                .andExpect(jsonPath("$.rows[1].received").value(0.00))
                .andExpect(jsonPath("$.rows[1].outstanding").value(5145.00));
    }

    @Test
    @DisplayName("SSK-170 ผลรวมตามห้อง ตามผู้เช่า ตามเดือนเท่ากัน ผู้เช่าที่ย้ายออกแล้วยังอยู่ในรายงาน")
    void everyGroupingAddsUpTheSameAndMovedOutTenantsStay() throws Exception {
        long movedOut = lease("110", "สมชาย ย้ายออก", "2026-07-01", "2026-08-31");
        long stays = lease("111", "อนงค์ อยู่ต่อ", "2026-07-01", null);
        long upstairs = lease("201", tenants.get(1), "2026-08-01", null);
        pay(issue(movedOut, "2026-08", "85", "15"), "5000");
        issue(stays, "2026-08", "85", "15");
        pay(issue(stays, "2026-09", "102", "13"), "1234.50");
        issue(upstairs, "2026-09", "60", "8");

        Map<String, String> totals = new LinkedHashMap<>();
        for (String groupBy : List.of("unit", "tenant", "month")) {
            String json = summary("groupBy=" + groupBy + "&from=2026-07&to=2026-10")
                    .andExpect(status().isOk())
                    .andReturn().getResponse().getContentAsString();
            totals.put(groupBy, JsonPath.parse(json).read("$.total").toString());
        }
        assertThat(totals.values()).as("total ของทั้งสามแบบ").containsOnly(totals.get("unit"));

        summary("groupBy=unit&from=2026-07&to=2026-10")
                .andExpect(jsonPath("$.rows[*].key").value(contains("110", "111", "201")))
                .andExpect(jsonPath("$.total.receiptCount").value(4));
        // ผู้เช่าคนเดียวสองสัญญาสองห้องเป็นแถวเดียว ผู้เช่าที่ย้ายออกแล้วยังมีแถว เรียงตามชื่อ
        summary("groupBy=tenant&from=2026-07&to=2026-10")
                .andExpect(jsonPath("$.rows[*].label").value(contains("สมชาย ย้ายออก", "อนงค์ อยู่ต่อ")))
                .andExpect(jsonPath("$.rows[0].key").value(String.valueOf(tenants.get(0).getId())))
                .andExpect(jsonPath("$.rows[0].outstanding").value(0.00))
                .andExpect(jsonPath("$.rows[1].receiptCount").value(3));
    }

    @Test
    @DisplayName("SSK-170 ยอดค้างรวมของช่วงที่ครอบทุกใบเท่ากับผลรวม balanceDue ของหน้าหนี้ค้าง")
    void outstandingMatchesTheDebtsPage() throws Exception {
        long first = lease("110", "หนึ่ง", "2026-07-01", null);
        long second = lease("111", "สอง", "2026-07-01", null);
        long august = issue(first, "2026-08", "85", "15");
        pay(august, "1500");
        issue(first, "2026-09", "102", "13");
        pay(issue(second, "2026-08", "85", "15"), "5000");
        issue(second, "2026-09", "102", "13");

        String debts = mockMvc.perform(get("/api/debts")).andReturn().getResponse().getContentAsString();
        List<Number> balances = JsonPath.read(debts, "$[*].balanceDue");
        BigDecimal debtTotal = balances.stream().map(value -> new BigDecimal(value.toString()))
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        String report = summary("groupBy=unit&from=2017-01&to=2026-12").andReturn().getResponse().getContentAsString();

        assertThat(new BigDecimal(JsonPath.read(report, "$.total.outstanding").toString()))
                .isEqualByComparingTo(debtTotal)
                .isPositive();
    }

    @Test
    @DisplayName("SSK-170 บรรทัดค่าใช้จ่ายพิเศษอยู่ในช่อง extraCharges และใน billed")
    void extraChargesAreTheirOwnColumn() throws Exception {
        long room = roomId("112");
        mockMvc.perform(post("/api/rooms/{id}/extra-charges", room).contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"label":"Parking","amount":500,"recurrence":"MONTHLY","startMonth":"2026-08",\
                                "endMonth":null}"""))
                .andExpect(status().isCreated());
        long lease = lease("112", "จอดรถ", "2026-08-01", null);
        issue(lease, "2026-08", "85", "15");
        issue(lease, "2026-09", "102", "13");

        summary("groupBy=month&from=2026-08&to=2026-09")
                .andExpect(jsonPath("$.rows[0].extraCharges").value(500.00))
                .andExpect(jsonPath("$.rows[0].billed").value(5500.00))
                .andExpect(jsonPath("$.total.extraCharges").value(1000.00))
                // ยอดยกมา 5,500 ไม่ถูกนับซ้ำ ดอกเบี้ย 1.5% ของ 5,500 = 82.50
                .andExpect(jsonPath("$.total.lateInterest").value(82.50))
                .andExpect(jsonPath("$.total.billed").value(11182.50));
    }

    @Test
    @DisplayName("SSK-170 ตัวกรองชั้น ห้อง ผู้เช่า สถานะ AND กัน ชุดที่ขัดกันเองได้รายงานว่าง")
    void filters() throws Exception {
        long downstairs = lease("110", "ชั้นล่าง", "2026-07-01", null);
        long upstairs = lease("201", "ชั้นบน", "2026-07-01", null);
        pay(issue(downstairs, "2026-08", "85", "15"), "5000");
        issue(upstairs, "2026-08", "85", "15");
        String range = "groupBy=unit&from=2026-08&to=2026-08";

        summary(range + "&floor=2").andExpect(jsonPath("$.rows[*].key").value(contains("201")));
        summary(range + "&roomId=" + roomId("110")).andExpect(jsonPath("$.rows[*].key").value(contains("110")));
        summary(range + "&tenantId=" + tenants.get(1).getId())
                .andExpect(jsonPath("$.rows[*].key").value(contains("201")));
        summary(range + "&status=PAID").andExpect(jsonPath("$.rows[*].key").value(contains("110")));
        summary(range + "&status=PENDING&floor=1").andExpect(jsonPath("$.rows").value(hasSize(0)));
        summary(range + "&floor=1&roomId=" + roomId("201"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.rows").value(hasSize(0)))
                .andExpect(jsonPath("$.total.receiptCount").value(0))
                .andExpect(jsonPath("$.total.billed").value(0.00));
    }

    @Test
    @DisplayName("SSK-170 พารามิเตอร์ผิดได้ 400 ตัวกรองที่ชี้ของที่ไม่มีได้ 404 ข้อความตามสัญญา API ทุกตัวเป็น problem+json")
    void errors() throws Exception {
        Map<String, String> badRequests = new LinkedHashMap<>();
        badRequests.put("from=2026-08&to=2026-09", "groupBy must be unit, tenant or month");
        badRequests.put("groupBy=room&from=2026-08&to=2026-09", "groupBy must be unit, tenant or month");
        badRequests.put("groupBy=unit&to=2026-09", "from and to must be YYYY-MM with from not after to");
        badRequests.put("groupBy=unit&from=2026-13&to=2026-09", "from and to must be YYYY-MM with from not after to");
        badRequests.put("groupBy=unit&from=2026-10&to=2026-09", "from and to must be YYYY-MM with from not after to");
        badRequests.put("groupBy=unit&from=2016-12&to=2026-12", "The range can be at most 10 years");
        badRequests.put("groupBy=unit&from=2026-08&to=2026-09&status=DONE", "status must be PENDING, PARTIAL or PAID");
        for (Map.Entry<String, String> request : badRequests.entrySet()) {
            summary(request.getKey())
                    .andExpect(status().isBadRequest())
                    .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                    .andExpect(jsonPath("$.detail").value(request.getValue()));
        }

        String range = "groupBy=unit&from=2026-08&to=2026-09";
        summary(range + "&roomId=999999").andExpect(status().isNotFound())
                .andExpect(jsonPath("$.detail").value("No unit with id 999999"));
        summary(range + "&floor=77").andExpect(status().isNotFound())
                .andExpect(jsonPath("$.detail").value("Floor 77 does not exist"));
        summary(range + "&tenantId=999999").andExpect(status().isNotFound())
                .andExpect(jsonPath("$.detail").value("No tenant with id 999999"));
        summary(range + "&roomId=abc").andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("SSK-170 ไม่มีใบในช่วง ได้ 200 แถวว่าง total เป็นศูนย์")
    void anEmptyRange() throws Exception {
        summary("groupBy=tenant&from=2019-01&to=2019-12")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.rows").value(hasSize(0)))
                .andExpect(jsonPath("$.total.receiptCount").value(0))
                .andExpect(jsonPath("$.total.outstanding").value(0.00));
    }

    /**
     * จำนวนคำสั่ง SQL ไม่โตตามจำนวนใบ ทั้งใบที่มีการชำระ ยอดยกมา และบรรทัดค่าใช้จ่ายพิเศษ
     * นับเฉพาะคำสั่งของคำขอนั้น ({@link SqlStatementCounter}) งานเบื้องหลังที่ตื่นทุกนาทีจึงไม่ปนเข้ามา
     */
    @Test
    @DisplayName("SSK-170 รายงาน 2 ใบกับ 24 ใบใช้คำสั่ง SQL เท่ากัน")
    void theQueryCountDoesNotGrowWithTheReceipts() throws Exception {
        mockMvc.perform(post("/api/rooms/{id}/extra-charges", roomId("112")).contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"label":"Parking","amount":500,"recurrence":"MONTHLY","startMonth":"2026-08",\
                                "endMonth":null}"""))
                .andExpect(status().isCreated());
        for (int n = 1; n <= 12; n++) {
            long lease = lease(String.valueOf(100 + n), "ห้อง " + n, "2026-07-01", null);
            pay(issue(lease, "2026-08", "85", "15"), "1000");
            pay(issue(lease, "2026-09", "102", "13"), "1000");
        }

        long room101 = roomId("101");
        int two = SqlStatementCounter.count(() -> summary("groupBy=unit&from=2026-08&to=2026-09&roomId=" + room101)
                .andExpect(jsonPath("$.total.receiptCount").value(2)));
        int all = SqlStatementCounter.count(() -> summary("groupBy=unit&from=2026-08&to=2026-09")
                .andExpect(jsonPath("$.total.receiptCount").value(24)));
        System.out.printf("SSK-170 SQL statements: 2 receipts=%d, 24 receipts=%d%n", two, all);

        // ตัวกรองห้องเพิ่มคำสั่งตรวจว่าห้องมีจริงหนึ่งคำสั่ง
        assertThat(all).isEqualTo(two - 1);
    }

    @Test
    @DisplayName("SSK-170 ไม่ได้ล็อกอินได้ 401")
    void signedOutRequestsAreRejected() throws Exception {
        mockMvc.perform(get("/api/reports/summary?groupBy=unit&from=2026-08&to=2026-09").with(anonymous()))
                .andExpect(status().isUnauthorized());
    }

    private ResultActions summary(String query) throws Exception {
        return mockMvc.perform(get("/api/reports/summary?" + query));
    }

    private long roomId(String roomNumber) {
        return roomRepository.findByRoomNumber(roomNumber).map(Room::getId).orElseThrow();
    }

    /** สัญญาตามอัตราตั้งต้นของตึก เลขบัตรขึ้นต้นด้วย 29 ไม่ชนกับเทสคลาสอื่น (tenant_national_id_uk) */
    private long lease(String roomNumber, String tenantName, String startDate, String endDate) throws Exception {
        Tenant tenant = tenantRepository.saveAndFlush(new Tenant(tenantName,
                String.format("29%011d", tenants.size() + 1), null, "082-290-0001", null));
        tenants.add(tenant);
        return lease(roomNumber, tenant, startDate, endDate);
    }

    /** สัญญาที่สองของผู้เช่าที่มีอยู่แล้ว */
    private long lease(String roomNumber, Tenant tenant, String startDate, String endDate) throws Exception {
        String json = mockMvc.perform(post("/api/leases").contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"roomId":%d,"tenantId":%d,"startDate":"%s","endDate":%s,\
                                "monthlyRent":9999,"billingCycle":"MONTHLY"}"""
                                .formatted(roomId(roomNumber), tenant.getId(), startDate,
                                        endDate == null ? "null" : "\"" + endDate + "\"")))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return ((Number) JsonPath.read(json, "$.id")).longValue();
    }

    private long issue(long leaseId, String month, String electricUnits, String waterUnits) throws Exception {
        String json = mockMvc.perform(post("/api/receipts").contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"leaseId":%d,"billingMonth":"%s","electricUnits":%s,"waterUnits":%s}"""
                                .formatted(leaseId, month, electricUnits, waterUnits)))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return ((Number) JsonPath.read(json, "$.id")).longValue();
    }

    private void pay(long receiptId, String amount) throws Exception {
        mockMvc.perform(post("/api/receipts/{id}/payments", receiptId).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"amount\":%s,\"method\":\"CASH\"}".formatted(amount)))
                .andExpect(status().isCreated());
    }

    private void setLateInterest(String percent) throws Exception {
        mockMvc.perform(put("/api/apartment-config/late-interest").with(user("admin"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"lateInterestPercentPerMonth\":%s,\"graceDays\":0}".formatted(percent)))
                .andExpect(status().isOk());
    }
}
