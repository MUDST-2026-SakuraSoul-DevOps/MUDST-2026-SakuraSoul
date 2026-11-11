package com.sakurasoul.apartment.usage;

import com.jayway.jsonpath.JsonPath;
import com.sakurasoul.apartment.TestcontainersConfiguration;
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
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.testcontainers.DockerClientFactory;

import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.anonymous;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * ภาพรวมการใช้น้ำไฟทั้งตึก (SSK-181) ผ่าน HTTP ถึง PostgreSQL จริง
 * <p>
 * ข้อมูลอยู่ในปี ค.ศ. 2013-2014 ที่ไม่มีเทสคลาสอื่นใช้ ยอดทั้งตึกจึงไม่ปนข้อมูลของเทสอื่น อัตราไฟ 8 น้ำ 18
 * <ul>
 *   <li>ห้อง 106 สัญญา ม.ค.-มี.ค. 2014 ค่ามิเตอร์ ม.ค. 100/10 ก.พ. 0/0 ใบเสร็จ ม.ค. 999/99.9 (ค่ามิเตอร์ชนะ เงินจากใบ)
 *       และค่ามิเตอร์ ม.ค. 2013 80/8 ไว้เทียบปีก่อน</li>
 *   <li>ห้อง 109 สัญญาเริ่ม 31 ม.ค. จบ 1 ก.พ. ใบเสร็จ ม.ค. 50/5 นับว่ามีคนอยู่ทั้ง ม.ค. และ ก.พ. ไม่นับ มี.ค.</li>
 *   <li>ห้อง 205 สองสัญญาใน ม.ค. (1-15 กับ 16 ม.ค.-31 ธ.ค.) ใบเสร็จ 10/1 กับ 20/2 รวมเป็นห้องเดียว</li>
 *   <li>ห้อง 206 ว่าง แต่มีค่ามิเตอร์ มี.ค. 5/1</li>
 * </ul>
 * ม.ค. 2014: ไฟ 100 + 50 + 30 = 180 น้ำ 18 เงินไฟ 7,992 + 400 + 240 = 8,632.00 เงินน้ำ 1,798.20 + 90 + 54 = 1,942.20
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
@EnabledIf("dockerAvailable")
@WithMockUser
class BuildingUsageApiTest {

    private static final String LEASE_BODY = """
            {"roomId":%d,"tenantId":%d,"startDate":"%s","endDate":"%s","billingCycle":"MONTHLY",\
            "securityDeposit":7000,"electricRatePerUnit":8,"waterRatePerUnit":18,"commonAreaFee":300,"internetFee":250}""";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JdbcTemplate jdbc;

    @Autowired
    private TenantRepository tenantRepository;

    @Autowired
    private RoomRepository roomRepository;

    private Tenant tenant;

    static boolean dockerAvailable() {
        return DockerClientFactory.instance().isDockerAvailable();
    }

    /** เลขบัตรขึ้นต้นด้วย 33 ไม่ชนกับเทสคลาสอื่นที่ใช้ container เดียวกัน */
    @BeforeEach
    void seedUsage() throws Exception {
        tenant = tenantRepository.saveAndFlush(
                new Tenant("ภาพรวม ทั้งตึก", "3300000000001", null, "082-181-0001", null));
        importReadings("""
                room_number,month,electric_units,water_units
                106,2013-01,80,8
                106,2014-01,100,10
                106,2014-02,0,0
                206,2014-03,5,1
                """);
        issueReceipt(createLease(roomId("106"), "2014-01-01", "2014-03-31"), "2014-01", 999, 99.9);
        issueReceipt(createLease(roomId("109"), "2014-01-31", "2014-02-01"), "2014-01", 50, 5);
        long room205 = roomId("205");
        issueReceipt(createLease(room205, "2014-01-01", "2014-01-15"), "2014-01", 10, 1);
        issueReceipt(createLease(room205, "2014-01-16", "2014-12-31"), "2014-01", 20, 2);
    }

    /** ลบเฉพาะสัญญากับใบเสร็จของผู้เช่าคนนี้ และค่ามิเตอร์ปี 2013-2015 ที่มีแต่คลาสนี้ใช้ */
    @AfterEach
    void clearUsage() {
        String leases = "SELECT id FROM lease WHERE tenant_id = ?";
        jdbc.update("DELETE FROM meter_reading WHERE reading_month BETWEEN DATE '2013-01-01' AND DATE '2015-12-01'");
        jdbc.update("DELETE FROM receipt_line WHERE lease_id IN (" + leases + ")", tenant.getId());
        jdbc.update("DELETE FROM receipt WHERE lease_id IN (" + leases + ")", tenant.getId());
        jdbc.update("DELETE FROM lease_extra_charge WHERE lease_id IN (" + leases + ")", tenant.getId());
        jdbc.update("DELETE FROM lease WHERE tenant_id = ?", tenant.getId());
        tenantRepository.delete(tenant);
    }

    @Test
    @DisplayName("SSK-181 รายเดือน: ค่ามิเตอร์ชนะใบเสร็จ เงินจากใบ สองสัญญาในเดือนเดียวเป็นห้องเดียว ไม่มีข้อมูลเป็น null")
    void monthlyPoints() throws Exception {
        building("from=2014-01&to=2014-04")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.from").value("2014-01"))
                .andExpect(jsonPath("$.metric").value("both"))
                .andExpect(jsonPath("$.granularity").value("month"))
                .andExpect(jsonPath("$.compare").value(nullValue()))
                .andExpect(jsonPath("$.totalRooms").value(roomRepository.count()))
                .andExpect(jsonPath("$.points[*].period").value(contains("2014-01", "2014-02", "2014-03", "2014-04")))
                // ม.ค. ทุกห้องมีข้อมูลและมีใบ
                .andExpect(jsonPath("$.points[0].electricUnits").value(180.00))
                .andExpect(jsonPath("$.points[0].waterUnits").value(18.00))
                .andExpect(jsonPath("$.points[0].electricAmount").value(8632.00))
                .andExpect(jsonPath("$.points[0].waterAmount").value(1942.20))
                .andExpect(jsonPath("$.points[0].occupiedRooms").value(3))
                .andExpect(jsonPath("$.points[0].roomsWithData").value(3))
                .andExpect(jsonPath("$.points[0].roomsWithAmount").value(3))
                .andExpect(jsonPath("$.points[0].yoy").value(nullValue()))
                // ก.พ. ใช้ศูนย์จริงแต่ยังไม่มีใบ เงินเป็น null ห้อง 109 ที่จบ 1 ก.พ. ยังนับว่ามีคนอยู่
                .andExpect(jsonPath("$.points[1].electricUnits").value(0.00))
                .andExpect(jsonPath("$.points[1].electricAmount").value(nullValue()))
                .andExpect(jsonPath("$.points[1].occupiedRooms").value(3))
                .andExpect(jsonPath("$.points[1].roomsWithData").value(1))
                .andExpect(jsonPath("$.points[1].roomsWithAmount").value(0))
                // มี.ค. ห้องว่างที่มีค่ามิเตอร์ ห้อง 109 ไม่นับแล้ว
                .andExpect(jsonPath("$.points[2].electricUnits").value(5.00))
                .andExpect(jsonPath("$.points[2].occupiedRooms").value(2))
                .andExpect(jsonPath("$.points[2].roomsWithData").value(1))
                // เม.ย. ไม่มีข้อมูลเลย
                .andExpect(jsonPath("$.points[3].electricUnits").value(nullValue()))
                .andExpect(jsonPath("$.points[3].waterAmount").value(nullValue()))
                .andExpect(jsonPath("$.points[3].occupiedRooms").value(1))
                .andExpect(jsonPath("$.points[3].roomsWithData").value(0))
                .andExpect(jsonPath("$.points[3].monthsWithData").value(0))
                .andExpect(jsonPath("$.summary.electricUnits").value(185.00))
                .andExpect(jsonPath("$.summary.monthsWithData").value(3))
                .andExpect(jsonPath("$.summary.months").value(4))
                .andExpect(jsonPath("$.summary.averageElectricUnitsPerMonth").value(61.67))
                .andExpect(jsonPath("$.summary.peakElectric.period").value("2014-01"))
                .andExpect(content().string(containsString("\"electricUnits\":0.00,")));
    }

    @Test
    @DisplayName("SSK-181 เทียบปีก่อน: ปีแรกของช่วงอ่านเดือนของปีก่อนมาเทียบ ปีก่อนไม่มีเงินได้ null")
    void yearOverYear() throws Exception {
        building("from=2014-01&to=2014-02&compare=yoy")
                .andExpect(jsonPath("$.compare").value("yoy"))
                .andExpect(jsonPath("$.points[0].yoy.previousPeriod").value("2013-01"))
                .andExpect(jsonPath("$.points[0].yoy.previousMonthsWithData").value(1))
                .andExpect(jsonPath("$.points[0].yoy.electricUnits.previous").value(80.00))
                .andExpect(jsonPath("$.points[0].yoy.electricUnits.difference").value(100.00))
                .andExpect(jsonPath("$.points[0].yoy.electricUnits.percent").value(125.00))
                .andExpect(jsonPath("$.points[0].yoy.electricAmount.previous").value(nullValue()))
                .andExpect(jsonPath("$.points[0].yoy.electricAmount.difference").value(nullValue()))
                .andExpect(jsonPath("$.points[1].yoy.previousMonthsWithData").value(0))
                // ช่วงที่ขอเริ่ม 2014 สรุปไม่รวมเดือนของปีก่อนที่อ่านมาเทียบ
                .andExpect(jsonPath("$.summary.electricUnits").value(180.00))
                .andExpect(jsonPath("$.summary.months").value(2));
    }

    @Test
    @DisplayName("SSK-181 รายปีรวมเดือนในช่วง จำนวนห้องใช้เดือนที่มากที่สุด metric=water ค่าไฟเป็น null")
    void yearlyAndMetric() throws Exception {
        building("from=2013-01&to=2014-04&granularity=year")
                .andExpect(jsonPath("$.points[*].period").value(contains("2013", "2014")))
                .andExpect(jsonPath("$.points[0].electricUnits").value(80.00))
                .andExpect(jsonPath("$.points[0].months").value(12))
                .andExpect(jsonPath("$.points[0].monthsWithData").value(1))
                .andExpect(jsonPath("$.points[1].electricUnits").value(185.00))
                .andExpect(jsonPath("$.points[1].months").value(4))
                .andExpect(jsonPath("$.points[1].monthsWithData").value(3))
                .andExpect(jsonPath("$.points[1].occupiedRooms").value(3))
                .andExpect(jsonPath("$.points[1].electricAmount").value(8632.00));
        // ปี 2014 มีข้อมูลสามเดือน ปี 2013 มีแค่ ม.ค. เทียบได้เฉพาะ ม.ค.
        building("from=2014-01&to=2014-12&granularity=year&compare=yoy")
                .andExpect(jsonPath("$.points[0].yoy.previousPeriod").value("2013"))
                .andExpect(jsonPath("$.points[0].yoy.previousMonthsWithData").value(1))
                .andExpect(jsonPath("$.points[0].yoy.comparedMonths").value(1))
                .andExpect(jsonPath("$.points[0].yoy.electricUnits.previous").value(80.00))
                .andExpect(jsonPath("$.points[0].yoy.electricUnits.difference").value(100.00));
        building("from=2014-01&to=2014-01&metric=water")
                .andExpect(jsonPath("$.metric").value("water"))
                .andExpect(jsonPath("$.points[0].electricUnits").value(nullValue()))
                .andExpect(jsonPath("$.points[0].electricAmount").value(nullValue()))
                .andExpect(jsonPath("$.points[0].waterUnits").value(18.00))
                .andExpect(jsonPath("$.summary.peakElectric").value(nullValue()));
    }

    @Test
    @DisplayName("SSK-181 พารามิเตอร์ผิดได้ 400 ตามลำดับ ไม่ได้ล็อกอินได้ 401")
    void errors() throws Exception {
        Map<String, String> badRequests = new LinkedHashMap<>();
        badRequests.put("from=2014-01&to=2014-02&metric=gas", "metric must be electric, water or both");
        badRequests.put("from=2014-01&to=2014-02&granularity=week", "granularity must be month or year");
        badRequests.put("from=2014-01&to=2014-02&compare=mom", "compare must be yoy");
        badRequests.put("from=2014-13&to=2014-02", "from and to must be YYYY-MM with from not after to");
        badRequests.put("to=2014-02", "from and to must be YYYY-MM with from not after to");
        badRequests.put("from=2004-01&to=2014-01", "The range can be at most 10 years");
        for (Map.Entry<String, String> bad : badRequests.entrySet()) {
            building(bad.getKey())
                    .andExpect(status().isBadRequest())
                    .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                    .andExpect(jsonPath("$.detail").value(bad.getValue()));
        }
        mockMvc.perform(get("/api/usage/building?from=2014-01&to=2014-02").with(anonymous()))
                .andExpect(status().isUnauthorized());
    }

    /**
     * fetch ของหน้าเว็บ (send ใน client.ts) ส่ง Accept: application/json ทุกครั้ง endpoint ของไฟล์จึงไม่ประกาศ produces
     */
    @Test
    @DisplayName("SSK-181 CSV มี BOM ชื่อไฟล์ตามช่วง แถว Total ส่ง Accept เป็น JSON ก็ได้ไฟล์ error เป็น problem+json")
    void theCsvFile() throws Exception {
        byte[] file = mockMvc.perform(get("/api/usage/building.csv?from=2014-01&to=2014-02&metric=electric")
                        .accept(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(content().contentType("text/csv;charset=UTF-8"))
                .andExpect(header()
                        .string("Content-Disposition",
                                "attachment; filename=\"building-usage-month-2014-01-2014-02.csv\""))
                .andReturn().getResponse().getContentAsByteArray();

        assertThat(new String(file, StandardCharsets.UTF_8)).isEqualTo("\uFEFF"
                + "period,occupied_rooms,rooms_with_data,rooms_with_amount,months_with_data,electric_units,electric_amount\r\n"
                + "2014-01,3,3,3,1,180.00,8632.00\r\n"
                + "2014-02,3,1,0,1,0.00,\r\n"
                + "Total,,,,2,180.00,8632.00\r\n");
        mockMvc.perform(get("/api/usage/building.csv?from=2014-02&to=2014-01").accept(MediaType.APPLICATION_JSON))
                .andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.detail").value("from and to must be YYYY-MM with from not after to"));
        mockMvc.perform(get("/api/usage/building.csv?from=2014-01&to=2014-02").with(anonymous()))
                .andExpect(status().isUnauthorized());
    }

    private ResultActions building(String query) throws Exception {
        return mockMvc.perform(get("/api/usage/building?" + query));
    }

    private void importReadings(String csv) throws Exception {
        mockMvc.perform(multipart("/api/meter-readings/import")
                        .file(new MockMultipartFile("file", "usage.csv", "text/csv",
                                csv.getBytes(StandardCharsets.UTF_8)))
                        .param("dryRun", "false"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.errors.length()").value(0));
    }

    private long createLease(long roomId, String startDate, String endDate) throws Exception {
        String json = mockMvc.perform(post("/api/leases")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(LEASE_BODY.formatted(roomId, tenant.getId(), startDate, endDate)))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return ((Number) JsonPath.read(json, "$.id")).longValue();
    }

    private void issueReceipt(long leaseId, String billingMonth, double electricUnits, double waterUnits)
            throws Exception {
        mockMvc.perform(post("/api/receipts")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"leaseId":%d,"billingMonth":"%s","electricUnits":%s,"waterUnits":%s}"""
                                .formatted(leaseId, billingMonth, electricUnits, waterUnits)))
                .andExpect(status().isCreated());
    }

    private long roomId(String roomNumber) {
        return roomRepository.findAllInLayoutOrder().stream()
                .filter(room -> room.getRoomNumber().equals(roomNumber))
                .map(Room::getId)
                .findFirst()
                .orElseThrow();
    }
}
