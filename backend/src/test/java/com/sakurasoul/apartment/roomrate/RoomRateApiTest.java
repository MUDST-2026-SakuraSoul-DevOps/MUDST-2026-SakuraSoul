package com.sakurasoul.apartment.roomrate;

import com.jayway.jsonpath.JsonPath;
import com.sakurasoul.apartment.TestcontainersConfiguration;
import com.sakurasoul.apartment.buildingconfig.BuildingConfigDtos.BuildingConfigRequest;
import com.sakurasoul.apartment.buildingconfig.BuildingConfigService;
import com.sakurasoul.apartment.common.AppTime;
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
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.testcontainers.DockerClientFactory;

import java.math.BigDecimal;
import java.time.YearMonth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.matchesPattern;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.anonymous;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * อัตราต่อห้องตามช่วงเวลา (SSK-162) ยิงผ่าน HTTP ถึง PostgreSQL ตัวจริง ตามเกณฑ์ตรวจในการ์ด
 * <p>
 * ใช้ห้อง 112 (id 12 จาก V2) เพราะไม่มีเทสคลาสอื่นใช้ และล้างอัตรา ใบเสร็จ สัญญา กับผู้เช่าของคลาสนี้ทุกเทส
 * อัตราที่ค้างไว้จะเปลี่ยน baseRent กับค่าเช่าของสัญญาใหม่ที่เทสคลาสอื่นคาดไว้ จึงห้ามเหลือแม้แต่แถวเดียว
 * <p>
 * เทสที่ตั้งอัตราไว้ล่วงหน้าใช้ปี 2031 ส่วนเทสที่ต้องออกบิลใช้ปี 2025 เพราะออกบิลของเดือนในอนาคตไม่ได้
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
@EnabledIf("dockerAvailable")
@WithMockUser
class RoomRateApiTest {

    /** ห้อง 112 มาจาก migration V2 ห้ามลบ */
    private static final long ROOM_112 = 12L;

    /** body ที่ฟอร์มสร้างสัญญาส่งจริง คืออัตราของ Apartment Config มาครบสี่ตัว ค่าเช่าที่ส่งมาไม่เคยถูกใช้ */
    private static final String LEASE_BODY = """
            {"roomId":%d,"tenantId":%d,"startDate":"%s","endDate":%s,"monthlyRent":1,\
            "billingCycle":"MONTHLY","securityDeposit":7000,\
            "electricRatePerUnit":8,"waterRatePerUnit":18,"commonAreaFee":300,"internetFee":250}""";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JdbcTemplate jdbc;

    @Autowired
    private TenantRepository tenantRepository;

    @Autowired
    private RoomRepository roomRepository;

    @Autowired
    private BuildingConfigService buildingConfigService;

    private Tenant tenant;

    static boolean dockerAvailable() {
        return DockerClientFactory.instance().isDockerAvailable();
    }

    /** เลขบัตรขึ้นต้นด้วย 21 ไม่ชนกับเทสคลาสอื่นที่ใช้ container เดียวกัน (tenant_national_id_uk ใน V6) */
    @BeforeEach
    void createTenant() {
        tenant = tenantRepository.saveAndFlush(
                new Tenant("ราตรี อัตราห้อง", "2100000000001", null, "082-162-0001", null));
    }

    /** ลบตามลำดับ foreign key ของห้อง 112 เท่านั้น ข้อมูลของเทสคลาสอื่นไม่ถูกแตะ */
    @AfterEach
    void clearRoom112() {
        jdbc.update("DELETE FROM receipt WHERE lease_id IN (SELECT id FROM lease WHERE room_id = ?)", ROOM_112);
        jdbc.update("DELETE FROM lease WHERE room_id = ?", ROOM_112);
        jdbc.update("DELETE FROM room_rate WHERE room_id = ?", ROOM_112);
        tenantRepository.delete(tenant);
    }

    @Test
    @DisplayName("SSK-162 ประวัติอัตราของห้องเรียงใหม่ก่อนเก่า ส่วนอัตราของทุกห้องเรียงเก่าก่อนใหม่และกรองด้วย from ได้")
    void historyIsNewestFirstAndTheBuildingListIsOldestFirst() throws Exception {
        addRate(ROOM_112, "2031-01", 3900, 9).andExpect(status().isCreated())
                .andExpect(jsonPath("$.roomId").value(ROOM_112))
                .andExpect(jsonPath("$.effectiveFrom").value("2031-01"))
                .andExpect(jsonPath("$.monthlyRent").value(3900.0))
                .andExpect(jsonPath("$.electricRatePerUnit").value(9.0))
                .andExpect(jsonPath("$.note").value("Annual rate adjustment"))
                .andExpect(jsonPath("$.createdAt")
                        .value(matchesPattern("^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z$")));
        addRate(ROOM_112, "2030-06", 3800, 8.5).andExpect(status().isCreated());

        mockMvc.perform(get("/api/rooms/{id}/rates", ROOM_112))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[0].effectiveFrom").value("2031-01"))
                .andExpect(jsonPath("$[1].effectiveFrom").value("2030-06"));

        mockMvc.perform(get("/api/room-rates").param("from", "2030-01"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[0].effectiveFrom").value("2030-06"))
                .andExpect(jsonPath("$[1].effectiveFrom").value("2031-01"));
        mockMvc.perform(get("/api/room-rates").param("from", "2030-07"))
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].effectiveFrom").value("2031-01"));
    }

    @Test
    @DisplayName("SSK-162 สัญญาใหม่ได้อัตราของเดือนเริ่มสัญญาครบห้าตัว (พ.ย. ได้ 8 ธ.ค. ได้ 9) และสัญญาเดิมไม่เปลี่ยนตาม")
    void aNewLeaseTakesTheRateOfItsStartMonthAndOldLeasesKeepTheirs() throws Exception {
        long november = createLease("2031-11-01", "\"2031-11-30\"");
        addRate(ROOM_112, "2031-12", 3800, 9).andExpect(status().isCreated());
        long december = createLease("2031-12-01", "null");

        String novemberLease = "$[?(@.id == " + november + ")]";
        String decemberLease = "$[?(@.id == " + december + ")]";
        mockMvc.perform(get("/api/leases").param("roomId", String.valueOf(ROOM_112)))
                .andExpect(status().isOk())
                // สัญญาที่เริ่มก่อนเดือนของอัตราใหม่ได้ค่าเช่าตามชนิดห้องกับอัตราที่ฟอร์มส่งมา และไม่เปลี่ยนหลังตั้งอัตรา
                .andExpect(jsonPath(novemberLease + ".monthlyRent").value(3500.0))
                .andExpect(jsonPath(novemberLease + ".electricRatePerUnit").value(8.0))
                // สัญญาที่เริ่มเดือนของอัตราใหม่ได้ค่าทั้งห้าจากอัตรานั้น ถึงฟอร์มจะส่งอัตราของ Apartment Config มาก็ตาม
                .andExpect(jsonPath(decemberLease + ".monthlyRent").value(3800.0))
                .andExpect(jsonPath(decemberLease + ".electricRatePerUnit").value(9.0))
                .andExpect(jsonPath(decemberLease + ".waterRatePerUnit").value(20.0))
                .andExpect(jsonPath(decemberLease + ".commonAreaFee").value(350.0))
                .andExpect(jsonPath(decemberLease + ".internetFee").value(300.0))
                .andExpect(jsonPath(decemberLease + ".securityDeposit").value(7000.0));
    }

    @Test
    @DisplayName("SSK-162 ตั้งอัตราย้อนหลังทับเดือนที่ห้องออกบิลแล้วได้ 409 ข้อความย้อนหลังมาก่อนข้อความเดือนซ้ำ เดือนถัดไปตั้งได้")
    void aRetroactiveRateIsRejectedOnceTheMonthIsBilled() throws Exception {
        long lease = createLease("2025-01-01", "\"2025-03-31\"");
        addRate(ROOM_112, "2025-03", 3800, 9).andExpect(status().isCreated());
        issueReceipt(lease, "2025-03");

        assertConflict(addRate(ROOM_112, "2025-02", 3800, 9),
                "A bill for 2025-02 or later has already been issued for this unit. Choose a later month.");
        // เดือน 2025-03 ชนทั้งสองกฎ (มีบิลแล้วและมีอัตราเดือนนี้แล้ว) ต้องได้ข้อความย้อนหลังแบบ backend จำลอง
        assertConflict(addRate(ROOM_112, "2025-03", 3800, 9),
                "A bill for 2025-03 or later has already been issued for this unit. Choose a later month.");
        addRate(ROOM_112, "2025-04", 3800, 9).andExpect(status().isCreated());
        assertConflict(addRate(ROOM_112, "2025-04", 3900, 9), "A rate starting 2025-04 already exists for this unit");
    }

    @Test
    @DisplayName("SSK-162 ค่าที่ผิดได้ 400 ข้อความตรงกับหน้าเว็บ ห้องที่ไม่มีได้ 404")
    void invalidInputAndUnknownUnits() throws Exception {
        mockMvc.perform(post("/api/rooms/{id}/rates", ROOM_112)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"effectiveFrom":"12/2031","monthlyRent":3800,"electricRatePerUnit":9,\
                                "waterRatePerUnit":18,"commonAreaFee":300,"internetFee":250}"""))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value("Please choose the month the rate starts (YYYY-MM)"));
        mockMvc.perform(post("/api/rooms/{id}/rates", ROOM_112)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"effectiveFrom":"2031-12","monthlyRent":-1,"electricRatePerUnit":9,\
                                "waterRatePerUnit":18,"commonAreaFee":300,"internetFee":250}"""))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value("Monthly rent cannot be negative"));

        addRate(9999L, "2031-12", 3800, 9)
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.detail").value("No unit with id 9999"));
        mockMvc.perform(get("/api/rooms/{id}/rates", 9999L))
                .andExpect(status().isNotFound());
        mockMvc.perform(get("/api/room-rates").param("from", "2031-13"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value("from must be YYYY-MM"));
    }

    @Test
    @DisplayName("SSK-162 baseRent ของรายการห้องใช้อัตราที่มีผลเดือนนี้ อัตราที่ตั้งไว้สำหรับเดือนหน้ายังไม่มีผล")
    void baseRentUsesTheRateInEffectThisMonthOnly() throws Exception {
        YearMonth thisMonth = YearMonth.from(AppTime.today());
        addRate(ROOM_112, thisMonth.toString(), 3777, 9).andExpect(status().isCreated());
        addRate(ROOM_112, thisMonth.plusMonths(1).toString(), 3999, 9).andExpect(status().isCreated());

        mockMvc.perform(get("/api/rooms"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.id == 12)].baseRent").value(3777.0))
                // ห้องข้าง ๆ ที่ไม่มีอัตราเฉพาะยังได้ค่าตามชนิดห้อง
                .andExpect(jsonPath("$[?(@.id == 10)].baseRent").value(3500.0));
        mockMvc.perform(get("/api/rooms/{id}", ROOM_112))
                .andExpect(jsonPath("$.baseRent").value(3777.0));
    }

    @Test
    @DisplayName("SSK-162 อัตราเป็นค่าตั้งของห้อง ลดผังตึกแล้วอัตราของห้องที่ถูกลบหายไปด้วย ไม่ได้ 409")
    void shrinkingTheLayoutDeletesTheRatesOfRemovedUnits() throws Exception {
        try {
            buildingConfigService.update(new BuildingConfigRequest(
                    BigDecimal.valueOf(3), BigDecimal.valueOf(12), "SINGLE"));
            Room room301 = roomRepository.findAllInLayoutOrder().stream()
                    .filter(room -> room.getRoomNumber().equals("301"))
                    .findFirst()
                    .orElseThrow();
            addRate(room301.getId(), "2031-12", 3800, 9).andExpect(status().isCreated());

            buildingConfigService.update(new BuildingConfigRequest(
                    BigDecimal.valueOf(2), BigDecimal.valueOf(12), "SINGLE"));

            assertThat(jdbc.queryForObject("SELECT count(*) FROM room_rate WHERE room_id = ?",
                    Integer.class, room301.getId())).isZero();
        } finally {
            buildingConfigService.update(new BuildingConfigRequest(
                    BigDecimal.valueOf(2), BigDecimal.valueOf(12), "SINGLE"));
        }
    }

    @Test
    @DisplayName("SSK-162 ไม่ได้ล็อกอินได้ 401 ทั้งอ่านและตั้งอัตรา")
    void signedOutRequestsAreRejected() throws Exception {
        mockMvc.perform(get("/api/rooms/{id}/rates", ROOM_112).with(anonymous()))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(post("/api/rooms/{id}/rates", ROOM_112).with(anonymous())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isUnauthorized());
    }

    private ResultActions addRate(long roomId, String month, int rent, double electric) throws Exception {
        return mockMvc.perform(post("/api/rooms/{id}/rates", roomId)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {"effectiveFrom":"%s","monthlyRent":%d,"electricRatePerUnit":%s,"waterRatePerUnit":20,\
                        "commonAreaFee":350,"internetFee":300,"note":"  Annual rate adjustment  "}"""
                        .formatted(month, rent, electric)));
    }

    private long createLease(String startDate, String endDate) throws Exception {
        String json = mockMvc.perform(post("/api/leases")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(LEASE_BODY.formatted(ROOM_112, tenant.getId(), startDate, endDate)))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return ((Number) JsonPath.read(json, "$.id")).longValue();
    }

    private void issueReceipt(long leaseId, String billingMonth) throws Exception {
        mockMvc.perform(post("/api/receipts")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"leaseId":%d,"billingMonth":"%s","electricUnits":100,"waterUnits":10}"""
                                .formatted(leaseId, billingMonth)))
                .andExpect(status().isCreated());
    }

    private static void assertConflict(ResultActions result, String detail) throws Exception {
        result.andExpect(status().isConflict())
                .andExpect(jsonPath("$.detail").value(detail));
    }
}
