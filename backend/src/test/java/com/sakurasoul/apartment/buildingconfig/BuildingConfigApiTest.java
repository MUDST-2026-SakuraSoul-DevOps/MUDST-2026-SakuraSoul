package com.sakurasoul.apartment.buildingconfig;

import com.jayway.jsonpath.JsonPath;
import com.sakurasoul.apartment.TestcontainersConfiguration;
import com.sakurasoul.apartment.buildingconfig.BuildingConfigDtos.BuildingConfigRequest;
import com.sakurasoul.apartment.lease.LeaseRepository;
import com.sakurasoul.apartment.maintenance.MaintenanceReminderRepository;
import com.sakurasoul.apartment.maintenance.MaintenanceTicketRepository;
import com.sakurasoul.apartment.room.RoomRepository;
import com.sakurasoul.apartment.tenant.Tenant;
import com.sakurasoul.apartment.tenant.TenantRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.RepeatedTest;
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

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.matchesPattern;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * GET/PUT /api/building-config (SSK-160) ยิงผ่าน MockMvc ถึง PostgreSQL ตัวจริง
 * <p>
 * container ตัวนี้ใช้ร่วมกับเทส API คลาสอื่นที่ฝัง id ของห้อง seed ไว้ (ห้อง 101 = id 1, 201 = id 13 ฯลฯ)
 * เทสชุดนี้จึง <b>ขยายผังอย่างเดียว</b> ใช้ห้องชั้น 3 ขึ้นไปที่สร้างเองเป็นห้องทดลอง ห้ามลดผังจนห้อง seed ถูกลบจริง
 * (ถ้าลบแล้วสร้างใหม่ห้องจะได้ id ใหม่ เทสคลาสอื่นพังตามลำดับการรัน) และคืนผังเป็น 2 x 12 ทุกครั้งใน @AfterEach
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
@EnabledIf("dockerAvailable")
@WithMockUser
class BuildingConfigApiTest {

    /** ห้อง 201 มาจาก V2 (id 13) ใช้พิสูจน์ว่าลดผังจนชนห้อง seed ที่มีสัญญาแล้วไม่มีอะไรเปลี่ยน */
    private static final long ROOM_201 = 13L;

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private BuildingConfigService buildingConfigService;

    @Autowired
    private RoomRepository roomRepository;

    @Autowired
    private LeaseRepository leaseRepository;

    @Autowired
    private MaintenanceTicketRepository ticketRepository;

    @Autowired
    private MaintenanceReminderRepository reminderRepository;

    @Autowired
    private TenantRepository tenantRepository;

    private Tenant tenant;

    static boolean dockerAvailable() {
        return DockerClientFactory.instance().isDockerAvailable();
    }

    /** เลขบัตรขึ้นต้นด้วย 13 ไม่ชนกับเทสคลาสอื่นที่ใช้ container เดียวกัน (tenant_national_id_uk ใน V6) */
    @BeforeEach
    void createTenant() {
        tenant = tenantRepository.saveAndFlush(
                new Tenant("ผังตึก ทดลอง", "1300000000001", null, "083-130-0001", null));
    }

    /**
     * ล้างประวัติที่เทสสร้างก่อน (ใบแจ้งซ่อมอ้างรอบแจ้งเตือนได้ จึงลบใบแจ้งซ่อมก่อน)
     * แล้วคืนผัง 2 x 12 ห้องชั้น 3 ขึ้นไปที่สร้างในเทสจะถูกลบ ห้อง seed ไม่ถูกแตะ
     */
    @AfterEach
    void restoreTheSeededLayout() {
        try {
            leaseRepository.deleteAll();
            ticketRepository.deleteAll();
            reminderRepository.deleteAll();
        } finally {
            // คืนผังเสมอแม้การล้างข้างบนจะพัง ไม่งั้นเทสคลาสถัดไปที่นับห้องจะล้มตามลำดับการรัน
            buildingConfigService.update(new BuildingConfigRequest(
                    BigDecimal.valueOf(2), BigDecimal.valueOf(12), "SINGLE"));
            tenantRepository.delete(tenant);
        }
    }

    @Test
    @DisplayName("SSK-160 ผังตั้งต้นคือ 2 ชั้น ชั้นละ 12 ห้อง รวม 24 ห้อง และ updatedAt เป็นรูปแบบเดียวกับ apartment-config")
    void getReturnsTheSeededLayout() throws Exception {
        mockMvc.perform(get("/api/building-config"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.floors").value(2))
                .andExpect(jsonPath("$.roomsPerFloor").value(12))
                .andExpect(jsonPath("$.totalRooms").value(24))
                .andExpect(jsonPath("$.updatedAt")
                        .value(matchesPattern("^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z$")));
    }

    @Test
    @DisplayName("SSK-160 ตั้งเป็น 3 ชั้น เพิ่มห้อง 301-312 ตามชนิดที่ส่งมา ห้องเดิมไม่ถูกแตะ แล้วลดกลับได้")
    void growingAddsTheMissingFloorAndLeavesExistingRoomsAlone() throws Exception {
        putLayout(3, 12, "DOUBLE")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.floors").value(3))
                .andExpect(jsonPath("$.roomsPerFloor").value(12))
                .andExpect(jsonPath("$.totalRooms").value(36));

        mockMvc.perform(get("/api/rooms"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(36)))
                // ห้องเดิมยังเป็น id เดิมชนิดเดิม
                .andExpect(jsonPath("$[0].id").value(1))
                .andExpect(jsonPath("$[0].roomNumber").value("101"))
                .andExpect(jsonPath("$[0].roomType").value("SINGLE"))
                .andExpect(jsonPath("$[24].roomNumber").value("301"))
                .andExpect(jsonPath("$[24].floor").value(3))
                .andExpect(jsonPath("$[24].roomType").value("DOUBLE"))
                .andExpect(jsonPath("$[35].roomNumber").value("312"));

        putLayout(2, 12, "SINGLE")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalRooms").value(24));
        assertThat(roomRepository.findByRoomNumber("301")).isEmpty();
    }

    @Test
    @DisplayName("SSK-160 ห้องที่เพิ่มใหม่ทำสัญญาได้ และสัญญาทับช่วงเวลาในห้องใหม่ยังได้ 409 (lease_no_overlap)")
    void aNewRoomCanBeLeasedAndStillRejectsOverlaps() throws Exception {
        putLayout(3, 12, "DOUBLE").andExpect(status().isOk());
        long room305 = roomId("305");

        createLease(room305, "2026-09-01", "null")
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.roomNumber").value("305"))
                .andExpect(jsonPath("$.floor").value(3))
                .andExpect(jsonPath("$.roomType").value("DOUBLE"))
                // ค่าเช่าตามชนิดห้องที่ตั้งตอนเพิ่มห้อง (DOUBLE 4,500 จาก V12)
                .andExpect(jsonPath("$.monthlyRent").value(4500.00));

        createLease(room305, "2026-12-01", "null")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.detail").value(containsString("Unit 305")));
    }

    @Test
    @DisplayName("SSK-160 ลดผังจนชนห้องที่มีสัญญาที่ปิดไปแล้ว ต้องได้ 409 ระบุเลขห้อง และผังกับห้องไม่เปลี่ยนเลย")
    void shrinkingIsRefusedWhenARoomHasAnEndedLease() throws Exception {
        putLayout(3, 12, "SINGLE").andExpect(status().isOk());
        long leaseId = createdLeaseId(roomId("305"));
        mockMvc.perform(post("/api/leases/{id}/terminate", leaseId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"endDate":"2026-09-30"}"""))
                .andExpect(status().isOk());

        putLayout(2, 12, "SINGLE")
                .andExpect(status().isConflict())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.detail").value(
                        "Unit 305 has lease or maintenance history and cannot be removed. Nothing was changed."));

        mockMvc.perform(get("/api/building-config"))
                .andExpect(jsonPath("$.floors").value(3))
                .andExpect(jsonPath("$.totalRooms").value(36));
    }

    @Test
    @DisplayName("SSK-160 ห้องที่มีรอบแจ้งเตือนซ่อมกับห้องที่มีใบแจ้งซ่อม ลบไม่ได้ทั้งคู่ ข้อความบอกครบทุกห้องตามลำดับผัง")
    void shrinkingIsRefusedWhenRoomsHaveMaintenanceHistory() throws Exception {
        putLayout(3, 12, "SINGLE").andExpect(status().isOk());
        mockMvc.perform(post("/api/reminders")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"ล้างแอร์","frequency":"MONTHLY","startDate":"2027-01-01","roomId":%d}"""
                                .formatted(roomId("307"))))
                .andExpect(status().isCreated());
        mockMvc.perform(post("/api/maintenance")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"roomId":%d,"title":"ก๊อกน้ำรั่ว"}""".formatted(roomId("306"))))
                .andExpect(status().isCreated());

        putLayout(2, 12, "SINGLE")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.detail").value(
                        "Units 306, 307 have lease or maintenance history and cannot be removed. Nothing was changed."));

        assertThat(roomRepository.findByRoomNumber("312")).isPresent();
    }

    @Test
    @DisplayName("SSK-160 ลดผังจนห้อง seed ที่มีสัญญาต้องถูกลบ ต้องได้ 409 และห้อง 24 ห้องกับผัง 2 x 12 ยังอยู่ครบ")
    void shrinkingBelowTheSeedIsRefusedWhenASeededRoomHasALease() throws Exception {
        createdLeaseId(ROOM_201);

        putLayout(1, 12, "SINGLE")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.detail").value(
                        "Unit 201 has lease or maintenance history and cannot be removed. Nothing was changed."));

        mockMvc.perform(get("/api/rooms")).andExpect(jsonPath("$", hasSize(24)));
        mockMvc.perform(get("/api/building-config"))
                .andExpect(jsonPath("$.floors").value(2))
                .andExpect(jsonPath("$.roomsPerFloor").value(12));
    }

    @Test
    @DisplayName("SSK-160 ค่าผิดได้ 400 ข้อความเดียวกับหน้าเว็บ และผังไม่เปลี่ยน")
    void invalidLayoutsAreRejected() throws Exception {
        assertBadRequest("""
                {"floors":0,"roomsPerFloor":10,"newRoomType":"SINGLE"}""",
                "Number of floors must be a whole number from 1 to 50");
        assertBadRequest("""
                {"floors":51,"roomsPerFloor":10,"newRoomType":"SINGLE"}""",
                "Number of floors must be a whole number from 1 to 50");
        assertBadRequest("""
                {"floors":2.5,"roomsPerFloor":10,"newRoomType":"SINGLE"}""",
                "Number of floors must be a whole number from 1 to 50");
        assertBadRequest("""
                {"roomsPerFloor":10,"newRoomType":"SINGLE"}""",
                "Number of floors must be a whole number from 1 to 50");
        assertBadRequest("""
                {"floors":3,"roomsPerFloor":100,"newRoomType":"SINGLE"}""",
                "Rooms per floor must be a whole number from 1 to 99");
        assertBadRequest("""
                {"floors":3,"roomsPerFloor":10,"newRoomType":"TRIPLE"}""",
                "Room type for new units must be SINGLE or DOUBLE");
        // ไม่ใช่ตัวเลขเลย Jackson อ่านไม่ออกก่อนถึงกฎ ได้ข้อความกลางของ ApiExceptionHandler ที่บอกชื่อช่อง
        assertBadRequest("""
                {"floors":"abc","roomsPerFloor":10,"newRoomType":"SINGLE"}""",
                "The floors field must be a number");

        mockMvc.perform(get("/api/building-config"))
                .andExpect(jsonPath("$.floors").value(2))
                .andExpect(jsonPath("$.totalRooms").value(24));
    }

    /*
     * เรียงแบบข้อความ "1001" จะมาก่อน "912" และก่อน "101" ด้วย GET /api/rooms ต้องเรียงตามชั้นแล้วตามเลขห้อง
     */
    @Test
    @DisplayName("SSK-160 ผัง 10 ชั้น ห้องชั้น 10 (1001-1012) ต้องเรียงหลังห้อง 912 ไม่ใช่ก่อน 101 แบบเรียงข้อความ")
    void roomsAreOrderedByFloorThenNumberAcrossTenFloors() throws Exception {
        putLayout(10, 12, "SINGLE")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalRooms").value(120));

        mockMvc.perform(get("/api/rooms"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(120)))
                .andExpect(jsonPath("$[0].roomNumber").value("101"))
                .andExpect(jsonPath("$[107].roomNumber").value("912"))
                .andExpect(jsonPath("$[108].roomNumber").value("1001"))
                .andExpect(jsonPath("$[108].floor").value(10))
                .andExpect(jsonPath("$[119].roomNumber").value("1012"));
    }

    /*
     * backend มีสอง pod แอดมินสองคนกดบันทึกผังพร้อมกันได้ ถ้าไม่ล็อกแถว building_config ทั้งสองคำขอจะเพิ่มห้อง
     * 301-312 ซ้อนกันแล้วคำขอหนึ่งพังที่ room_number_uk ล็อกแล้วต้องผ่านทั้งคู่ตามลำดับ และผลสุดท้ายต้องตรงกับผัง
     */
    @RepeatedTest(3)
    @DisplayName("SSK-160 สองคำขอปรับผังพร้อมกันต้องผ่านทั้งคู่ และจำนวนห้องสุดท้ายตรงกับผังที่บันทึกล่าสุด")
    void concurrentUpdatesAreSerialised() throws Exception {
        CountDownLatch start = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            List<Future<Integer>> results = new ArrayList<>();
            for (int floors : List.of(3, 4)) {
                results.add(pool.submit(() -> {
                    start.await();
                    // @WithMockUser ตั้ง SecurityContext ไว้ใน thread ของเทสเท่านั้น ต้องแนบผู้ใช้มากับคำขอตรง ๆ
                    return mockMvc.perform(put("/api/building-config")
                                    .with(user("admin"))
                                    .contentType(MediaType.APPLICATION_JSON)
                                    .content(layout(floors, 12, "SINGLE")))
                            .andReturn().getResponse().getStatus();
                }));
            }
            start.countDown();

            List<Integer> statuses = new ArrayList<>();
            for (Future<Integer> result : results) {
                statuses.add(result.get(30, TimeUnit.SECONDS));
            }
            assertThat(statuses).containsExactly(200, 200);
        } finally {
            pool.shutdownNow();
        }

        String json = mockMvc.perform(get("/api/building-config"))
                .andReturn().getResponse().getContentAsString();
        int floors = JsonPath.read(json, "$.floors");
        int totalRooms = JsonPath.read(json, "$.totalRooms");
        assertThat(totalRooms).isEqualTo(floors * 12);
    }

    private ResultActions putLayout(int floors, int roomsPerFloor, String type) throws Exception {
        return mockMvc.perform(put("/api/building-config")
                .contentType(MediaType.APPLICATION_JSON)
                .content(layout(floors, roomsPerFloor, type)));
    }

    private static String layout(int floors, int roomsPerFloor, String type) {
        return """
                {"floors":%d,"roomsPerFloor":%d,"newRoomType":"%s"}""".formatted(floors, roomsPerFloor, type);
    }

    private void assertBadRequest(String body, String detail) throws Exception {
        mockMvc.perform(put("/api/building-config")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.detail").value(detail));
    }

    private long roomId(String roomNumber) {
        return roomRepository.findByRoomNumber(roomNumber).orElseThrow().getId();
    }

    private ResultActions createLease(long roomId, String startDate, String endDate) throws Exception {
        return mockMvc.perform(post("/api/leases")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {"roomId":%d,"tenantId":%d,"startDate":"%s","endDate":%s,"billingCycle":"MONTHLY"}"""
                        .formatted(roomId, tenant.getId(), startDate, endDate)));
    }

    private long createdLeaseId(long roomId) throws Exception {
        String json = createLease(roomId, "2026-09-01", "null")
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return ((Number) JsonPath.read(json, "$.id")).longValue();
    }
}
