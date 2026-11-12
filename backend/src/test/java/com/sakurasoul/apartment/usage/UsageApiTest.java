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

import static org.hamcrest.Matchers.contains;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.anonymous;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * กราฟการใช้น้ำไฟ (SSK-167) ยิงถึง PostgreSQL จริงด้วยข้อมูลจากทั้งสองแหล่ง ค่ามิเตอร์ที่นำเข้ากับหน่วยในใบเสร็จ
 * <p>
 * ข้อมูลอยู่ใน ธ.ค. 2565 ถึง ม.ค. 2566 (ปี ค.ศ. 2022-2023) ที่ไม่มีเทสคลาสอื่นใช้ ยอดรวมทั้งตึกจึงไม่ปนข้อมูลของเทสอื่น
 * <ul>
 *   <li>ห้อง 106 (ชั้น 1) มีค่ามิเตอร์ ธ.ค. 100 / ม.ค. 120 / ก.พ. 0 (ใช้ศูนย์จริง) และใบเสร็จ ธ.ค. 999 ที่ต้องแพ้ค่ามิเตอร์</li>
 *   <li>ห้อง 109 (ชั้น 1) มีค่ามิเตอร์แค่ ก.พ. 40 เดือนอื่นใช้หน่วยในใบเสร็จ ธ.ค. 50 / ม.ค. 60
 *       (ค่ามิเตอร์ชนะเฉพาะเดือนของมันเอง ไม่ใช่ทั้งห้อง)</li>
 *   <li>ห้อง 205 (ชั้น 2) มีสองสัญญาใน ม.ค. (สัญญาแรกจบกลางเดือน) ใบเสร็จ 10 กับ 20 ต้องรวมเป็น 30</li>
 * </ul>
 * ตัวเลขน้ำเป็นหนึ่งในสิบของไฟทุกตัว
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
@EnabledIf("dockerAvailable")
@WithMockUser
class UsageApiTest {

    private static final String RANGE = "&from=2022-11&to=2023-03";

    /** body ที่ฟอร์มสร้างสัญญาส่งจริง */
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

    private long room106;

    static boolean dockerAvailable() {
        return DockerClientFactory.instance().isDockerAvailable();
    }

    /** เลขบัตรขึ้นต้นด้วย 23 ไม่ชนกับเทสคลาสอื่นที่ใช้ container เดียวกัน */
    @BeforeEach
    void seedUsage() throws Exception {
        tenant = tenantRepository.saveAndFlush(
                new Tenant("กราฟ การใช้น้ำไฟ", "2300000000001", null, "082-167-0001", null));
        room106 = roomId("106");

        importReadings("""
                room_number,month,electric_units,water_units
                106,2022-12,100,10
                106,2023-01,120,12
                106,2023-02,0,0
                109,2023-02,40,4
                """);

        long lease106 = createLease(room106, "2022-12-01", "2022-12-31");
        issueReceipt(lease106, "2022-12", 999, 99.9);

        long lease109 = createLease(roomId("109"), "2022-12-01", "2023-02-28");
        issueReceipt(lease109, "2022-12", 50, 5);
        issueReceipt(lease109, "2023-01", 60, 6);

        long room205 = roomId("205");
        issueReceipt(createLease(room205, "2023-01-01", "2023-01-15"), "2023-01", 10, 1);
        issueReceipt(createLease(room205, "2023-01-16", "2023-12-31"), "2023-01", 20, 2);
    }

    /** ลบเฉพาะสัญญากับใบเสร็จของผู้เช่าคนนี้ และค่ามิเตอร์ปี 2022-2023 ที่มีแต่คลาสนี้ใช้ */
    @AfterEach
    void clearUsage() {
        String leases = "SELECT id FROM lease WHERE tenant_id = ?";
        jdbc.update("DELETE FROM meter_reading WHERE reading_month BETWEEN DATE '2022-01-01' AND DATE '2023-12-01'");
        jdbc.update("DELETE FROM receipt_line WHERE lease_id IN (" + leases + ")", tenant.getId());
        jdbc.update("DELETE FROM receipt WHERE lease_id IN (" + leases + ")", tenant.getId());
        jdbc.update("DELETE FROM lease_extra_charge WHERE lease_id IN (" + leases + ")", tenant.getId());
        jdbc.update("DELETE FROM lease WHERE tenant_id = ?", tenant.getId());
        tenantRepository.delete(tenant);
    }

    @Test
    @DisplayName("SSK-167 ห้องเดียวได้ทุกเดือนในช่วง ค่ามิเตอร์ชนะใบเสร็จ ศูนย์จริงได้ hasData true เดือนไม่มีข้อมูลได้ false")
    void aRoomPrefersMeterReadingsAndFillsEveryMonth() throws Exception {
        usage("metric=electric&scope=room&roomId=" + room106 + RANGE)
                .andExpect(jsonPath("$[*].period", contains("2022-11", "2022-12", "2023-01", "2023-02", "2023-03")))
                .andExpect(jsonPath("$[*].scopeId", contains(
                        String.valueOf(room106), String.valueOf(room106), String.valueOf(room106),
                        String.valueOf(room106), String.valueOf(room106))))
                .andExpect(jsonPath("$[*].units", contains(0.0, 100.0, 120.0, 0.0, 0.0)))
                .andExpect(jsonPath("$[*].hasData", contains(false, true, true, true, false)));
        usage("metric=water&scope=room&roomId=" + room106 + RANGE)
                .andExpect(jsonPath("$[*].units", contains(0.0, 10.0, 12.0, 0.0, 0.0)));
    }

    @Test
    @DisplayName("SSK-167 เดือนที่ห้องไม่มีค่ามิเตอร์ใช้หน่วยในใบเสร็จ สองสัญญาในเดือนเดียวกันรวมกัน")
    void receiptsFillMonthsWithoutAReadingAndTwoLeasesInOneMonthAreSummed() throws Exception {
        usage("metric=electric&scope=room&roomId=" + roomId("109") + RANGE)
                .andExpect(jsonPath("$[*].units", contains(0.0, 50.0, 60.0, 40.0, 0.0)))
                .andExpect(jsonPath("$[*].hasData", contains(false, true, true, true, false)));
        usage("metric=electric&scope=room&roomId=" + roomId("205") + RANGE)
                .andExpect(jsonPath("$[*].units", contains(0.0, 0.0, 30.0, 0.0, 0.0)))
                .andExpect(jsonPath("$[*].hasData", contains(false, false, true, false, false)));
    }

    @Test
    @DisplayName("SSK-167 ชั้นรวมทุกห้องในชั้น ทั้งตึกรวมทุกห้อง รายปีรวมเฉพาะเดือนในช่วง")
    void floorsAndTheBuildingAddUpRooms() throws Exception {
        usage("metric=electric&scope=floor&floor=1" + RANGE)
                .andExpect(jsonPath("$[*].scopeId", contains("1", "1", "1", "1", "1")))
                .andExpect(jsonPath("$[*].units", contains(0.0, 150.0, 180.0, 40.0, 0.0)))
                .andExpect(jsonPath("$[*].hasData", contains(false, true, true, true, false)));
        usage("metric=electric&scope=floor&floor=2" + RANGE)
                .andExpect(jsonPath("$[*].units", contains(0.0, 0.0, 30.0, 0.0, 0.0)));
        usage("metric=electric&scope=building" + RANGE)
                .andExpect(jsonPath("$[*].scopeId", contains("building", "building", "building", "building", "building")))
                .andExpect(jsonPath("$[*].units", contains(0.0, 150.0, 210.0, 40.0, 0.0)))
                .andExpect(jsonPath("$[*].hasData", contains(false, true, true, true, false)));
        usage("metric=water&scope=building&granularity=year" + RANGE)
                .andExpect(jsonPath("$[*].period", contains("2022", "2023")))
                .andExpect(jsonPath("$[*].units", contains(15.0, 25.0)))
                .andExpect(jsonPath("$[*].hasData", contains(true, true)));
        usage("metric=electric&scope=room&granularity=year&roomId=" + roomId("205") + "&from=2022-01&to=2023-12")
                .andExpect(jsonPath("$[*].period", contains("2022", "2023")))
                .andExpect(jsonPath("$[*].units", contains(0.0, 30.0)))
                .andExpect(jsonPath("$[*].hasData", contains(false, true)));
    }

    /**
     * ทั้งสองปลายของช่วงต้องนับ ทั้งค่ามิเตอร์และใบเสร็จ ธ.ค. มีค่ามิเตอร์ของ 106 กับใบเสร็จของ 109
     * ม.ค. ก็มีทั้งสองแบบ ขอบของแหล่งไหนหลุด ยอดของเดือนนั้นเปลี่ยนทันที
     */
    @Test
    @DisplayName("SSK-167 เดือนแรกกับเดือนสุดท้ายของช่วงนับรวมด้วย")
    void theRangeIncludesItsFirstAndLastMonth() throws Exception {
        usage("metric=electric&scope=building&from=2022-12&to=2023-01")
                .andExpect(jsonPath("$[*].period", contains("2022-12", "2023-01")))
                .andExpect(jsonPath("$[*].units", contains(150.0, 210.0)))
                .andExpect(jsonPath("$[*].hasData", contains(true, true)));
    }

    @Test
    @DisplayName("SSK-167 ห้องหรือชั้นที่ไม่มีได้ 404 พารามิเตอร์ผิดได้ 400 ข้อความตรงกับหน้าเว็บ ไม่ได้ล็อกอินได้ 401")
    void unknownScopesAndBadParametersAreRejected() throws Exception {
        usage("metric=electric&scope=room&roomId=9999" + RANGE)
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.detail").value("No unit with id 9999"));
        usage("metric=electric&scope=floor&floor=9" + RANGE)
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.detail").value("No floor 9"));
        usage("metric=gas&scope=building" + RANGE)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value("metric must be electric or water"));
        usage("metric=electric&scope=building&from=2012-01&to=2023-03")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value("The range can be at most 10 years"));
        usage("metric=electric&scope=room" + RANGE)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value("roomId is required when scope is room"));
        usage("metric=electric&scope=room&roomId=" + RANGE)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value("roomId is required when scope is room"));
        // roomId ที่ไม่ใช่ตัวเลขถูก Spring ตีกลับตั้งแต่ตอนแปลงชนิด แบบเดียวกับ id ใน path ของ endpoint อื่น
        usage("metric=electric&scope=room&roomId=abc" + RANGE)
                .andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON));
        mockMvc.perform(get("/api/usage?metric=electric&scope=building" + RANGE).with(anonymous()))
                .andExpect(status().isUnauthorized());
    }

    private ResultActions usage(String query) throws Exception {
        return mockMvc.perform(get("/api/usage?" + query));
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
