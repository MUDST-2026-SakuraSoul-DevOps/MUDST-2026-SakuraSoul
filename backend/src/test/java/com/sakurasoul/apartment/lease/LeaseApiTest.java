package com.sakurasoul.apartment.lease;

import com.jayway.jsonpath.JsonPath;
import com.sakurasoul.apartment.TestcontainersConfiguration;
import com.sakurasoul.apartment.room.RoomType;
import com.sakurasoul.apartment.room.RoomTypeRate;
import com.sakurasoul.apartment.room.RoomTypeRateRepository;
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
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * เทสของ US-04 US-05 และ US-06 ระดับ HTTP ยิงผ่าน MockMvc ทะลุถึง PostgreSQL ตัวจริง
 * <p>
 * ชุดของ US-06 ตรงกับ describe("แก้ไขและปิดสัญญา") ใน frontend/src/api/client.test.ts
 * ที่หน้าเว็บเขียนไว้กับ backend จำลอง สองฝั่งจึงต้องตอบเหมือนกันทั้งรหัสสถานะและข้อความ
 * <p>
 * ที่ต้องมีชั้นนี้เพิ่มจาก LeaseServiceTest เพราะสิ่งที่หน้าเว็บเห็นจริงคือ JSON ไม่ใช่
 * record ฝั่ง Java เรื่องที่พังได้เฉพาะตอนแปลงเป็น JSON จับได้ที่ชั้นนี้ชั้นเดียว คือ
 * body หกช่องที่ฟอร์มส่งมาจริงผ่าน bean validation ได้ไหม อัตราที่ server เติมให้เอง
 * ออกมาเป็นตัวเลขกี่ตำแหน่ง และ ProblemDetail ที่ออกมาตอนกรอกผิดหน้าตาตรงกับที่
 * docs/api-contract-lease.md สัญญาไว้หรือเปล่า
 * <p>
 * เครื่องที่ไม่ได้เปิด Docker จะข้ามเทสชุดนี้ ไม่ใช่ล้ม ส่วน CI มี Docker อยู่แล้วจะรันจริง
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
@EnabledIf("dockerAvailable")
// ทุก endpoint ต้องล็อกอินแล้วตั้งแต่ SSK-28 ชุดนี้จึงยิงในนามผู้ใช้ปลอม เพราะสิ่งที่เทสคือ US-04 ถึง US-06 ไม่ใช่ระบบ login
@WithMockUser
class LeaseApiTest {

    /** ห้อง 101 กับ 102 มาจาก migration V2 ห้ามลบทิ้งตอนล้างข้อมูล */
    private static final long ROOM_101 = 1L;
    private static final long ROOM_102 = 2L;

    /**
     * ห้อง 201 ชั้น 2 จึงเป็น DOUBLE ตาม V11 ใช้พิสูจน์ว่าค่าเช่าอ่านจากชนิดของห้องใบนั้นจริง
     * ไม่ใช่ค่าคงที่ที่บังเอิญถูกสำหรับห้องชั้น 1 ทุกห้อง เทสที่ใช้ตัวนี้ assert roomNumber ด้วย
     * เผื่อลำดับ id ที่ V2 ออกให้เปลี่ยนไป จะได้แดงตรงจุดแทนที่จะเงียบ ๆ ไปเทสห้องผิดใบ
     */
    private static final long ROOM_201 = 13L;

    /** อยู่ก่อนวันนี้และไม่กำหนดวันจบ สัญญาจึงครอบวันนี้ ห้องต้องขึ้น OCCUPIED */
    private static final String STARTED = "2026-09-01";

    /** วันที่ผู้เช่าย้ายออกในเทสของ US-06 อยู่หลังวันเริ่มสัญญาจึงตั้งเป็นวันสิ้นสุดได้ */
    private static final String CHECK_OUT = "2026-09-30";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private LeaseRepository leaseRepository;

    @Autowired
    private RoomTypeRateRepository roomTypeRateRepository;

    @Autowired
    private TenantRepository tenantRepository;

    private Tenant yuki;
    private Tenant somchai;

    static boolean dockerAvailable() {
        return DockerClientFactory.instance().isDockerAvailable();
    }

    @BeforeEach
    void createTenants() {
        // เลขบัตรขึ้นต้นด้วย 11 เพื่อไม่ให้ชนกับเทสคลาสอื่นที่ใช้ container เดียวกัน เพราะ V6
        // ตั้ง tenant_national_id_uk ไว้ เลขซ้ำข้าม container จะพังตอน saveAndFlush ทันที
        yuki = tenantRepository.saveAndFlush(
                new Tenant("ยูกิ ทานากะ", "1100000000001", "yuki.t", "081-000-0000", "yuki.t@example.com"));
        somchai = tenantRepository.saveAndFlush(
                new Tenant("สมชาย ใจดี", "1100000000002", "somchai.j", "089-000-0000", null));
    }

    /**
     * ลบสัญญาก่อนผู้เช่าเสมอ เพราะ lease มี foreign key ไปที่ tenant
     * <p>
     * ลบเฉพาะผู้เช่าที่เทสนี้สร้างเอง ส่วนห้อง 24 ห้องมาจาก migration V2 ซึ่งเป็นข้อมูล
     * จริงของตึก ถ้าลบไปเทสคลาสอื่นที่ใช้ container เดียวกันจะพังตามไปด้วย
     */
    @AfterEach
    void clearLeasesAndTenants() {
        leaseRepository.deleteAll();
        tenantRepository.deleteAll(List.of(yuki, somchai));
    }

    @Test
    @DisplayName("US-04-S1 ส่ง body หกช่องแบบที่ฟอร์มหน้าเว็บส่งจริง ต้องได้ 201 และห้องกลายเป็น OCCUPIED")
    void createWithFrontendBodyFillsRatesFromConfigAndOccupiesTheRoom() throws Exception {
        // ตรงกับ LeaseRequest ใน frontend/src/api/types.ts เป๊ะ ๆ ไม่มีช่องเงินอีกห้าตัว
        createLease("""
                {"roomId":%d,"tenantId":%d,"startDate":"%s","endDate":null,\
                "monthlyRent":9999,"billingCycle":"MONTHLY"}"""
                .formatted(ROOM_101, yuki.getId(), STARTED))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("ACTIVE"))
                .andExpect(jsonPath("$.roomNumber").value("101"))
                .andExpect(jsonPath("$.tenantName").value("ยูกิ ทานากะ"))
                // ส่ง 9,999 มาแต่ต้องได้ 3,500 กลับไป ห้อง 101 อยู่ชั้น 1 จึงเป็น SINGLE
                // ค่าเช่ามาจากชนิดห้องเท่านั้น ไม่ใช่จาก body (V12 / SSK-127)
                .andExpect(jsonPath("$.monthlyRent").value(3500.00))
                // ไม่ได้ส่งมา server จึงเติมให้ มัดจำเป็น 0 อัตราที่เหลือมาจาก apartment_config
                .andExpect(jsonPath("$.securityDeposit").value(0.00))
                .andExpect(jsonPath("$.electricRatePerUnit").value(8.00))
                .andExpect(jsonPath("$.waterRatePerUnit").value(18.00))
                .andExpect(jsonPath("$.commonAreaFee").value(300.00))
                .andExpect(jsonPath("$.internetFee").value(250.00));

        // "Then" ของ US-04-S1 ห้องต้องเปลี่ยนสถานะเองโดยไม่ต้องสั่งแยก
        mockMvc.perform(get("/api/rooms/{id}", ROOM_101))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("OCCUPIED"))
                .andExpect(jsonPath("$.currentLease.tenantName").value("ยูกิ ทานากะ"));
    }

    @Test
    @DisplayName("ส่งอัตรามาเองต้องทับค่าตั้งต้นจาก apartment_config และปัดเหลือสองตำแหน่ง")
    void explicitRatesOverrideTheConfigDefaults() throws Exception {
        createLease("""
                {"roomId":%d,"tenantId":%d,"startDate":"%s","endDate":null,\
                "monthlyRent":9999,"billingCycle":"MONTHLY","securityDeposit":7000,\
                "electricRatePerUnit":9.5,"waterRatePerUnit":20,\
                "commonAreaFee":350,"internetFee":0}"""
                .formatted(ROOM_101, yuki.getId(), STARTED))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.securityDeposit").value(7000.00))
                .andExpect(jsonPath("$.electricRatePerUnit").value(9.50))
                .andExpect(jsonPath("$.waterRatePerUnit").value(20.00))
                .andExpect(jsonPath("$.commonAreaFee").value(350.00))
                // ศูนย์ใช้ได้ หอบางที่ไม่คิดค่าอินเทอร์เน็ต ต้องไม่ตกไปใช้ค่าจาก config
                .andExpect(jsonPath("$.internetFee").value(0.00));
    }

    @Test
    @DisplayName("US-05-S1 สร้างสัญญาทับช่วงเดิมต้องได้ 409 ที่บอกเลขห้องและชื่อผู้เช่าเดิม")
    void overlappingLeaseIsRejectedWithAReadableMessage() throws Exception {
        createLease(body(ROOM_101, yuki.getId(), STARTED, "\"2027-08-31\""))
                .andExpect(status().isCreated());

        createLease(body(ROOM_101, somchai.getId(), "2027-01-01", "null"))
                .andExpect(status().isConflict())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.detail").value(containsString("Unit 101")))
                .andExpect(jsonPath("$.detail").value(containsString("is not available")))
                .andExpect(jsonPath("$.detail").value(containsString("ยูกิ ทานากะ")));

        // ใบที่สองต้องไม่ถูกบันทึกลงไป ห้องนี้ยังมีสัญญาใบเดียวเหมือนเดิม
        mockMvc.perform(get("/api/leases").param("roomId", String.valueOf(ROOM_101)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").value(hasSize(1)));
    }

    @Test
    @DisplayName("วันสิ้นสุดมาก่อนวันเริ่มต้องได้ 400 พร้อมข้อความไทยที่หน้าเว็บเอาไปโชว์ได้")
    void backwardsRangeIsRejected() throws Exception {
        createLease(body(ROOM_101, yuki.getId(), "2026-12-31", "\"2026-01-01\""))
                .andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.detail").value("The end date cannot be before the start date"));
    }

    /**
     * detail ต้องเป็นข้อความของช่องที่ผิด ไม่ใช่ข้อความกลาง ๆ เพราะ client.ts
     * ฝั่งหน้าเว็บอ่านแค่ detail ตัวเดียวไปโชว์ใต้ฟอร์ม ส่วน fields เก็บไว้ครบเหมือนเดิม
     */
    @Test
    @DisplayName("ไม่ส่ง roomId มาต้องได้ 400 ที่ detail บอกชื่อช่องที่ขาด ไม่ใช่ข้อความรวม ๆ")
    void missingRoomIdReportsTheFieldInDetail() throws Exception {
        createLease("""
                {"tenantId":%d,"startDate":"%s","endDate":null,\
                "monthlyRent":9999,"billingCycle":"MONTHLY"}"""
                .formatted(yuki.getId(), STARTED))
                .andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.detail").value("Please choose the unit"))
                .andExpect(jsonPath("$.fields.roomId").value("Please choose the unit"));
    }

    @Test
    @DisplayName("ห้องที่ไม่มีต้องได้ 404 ที่บอกว่าไม่พบอะไร id ไหน")
    void unknownRoomIsNotFound() throws Exception {
        createLease(body(999L, yuki.getId(), STARTED, "null"))
                .andExpect(status().isNotFound())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.detail").value("No unit with id 999"));
    }

    /**
     * US-05-S2 สองคำขอที่เข้ามาพร้อมกันจริง ๆ
     * <p>
     * การเช็คใน LeaseService กันเคสนี้ไม่ได้ เพราะทั้งสอง thread อ่านตารางตอนที่ยังไม่มี
     * สัญญาสักใบแล้วผ่านทั้งคู่ ตัวที่ต้องกันไว้จริงคือ constraint lease_no_overlap
     * แล้วให้ handler แปลง DataIntegrityViolationException ที่หลุดออกมาเป็น 409
     * <p>
     * เทสนี้จึงยืนยันแค่ "หนึ่งผ่าน หนึ่งไม่ผ่าน" ไม่ผูกกับข้อความ เพราะเส้นทางที่แพ้
     * อาจเป็นได้ทั้งเส้น service (ถ้าอีกฝั่ง commit ทัน) และเส้น constraint ซึ่งคนละข้อความ
     * <p>
     * ปล่อยพร้อมกันด้วย CountDownLatch โดยให้ทั้งสอง thread ไปรอตรงหน้า perform()
     * ถ้าปล่อยให้ต่างคนต่างเริ่ม thread ที่ขึ้นก่อนจะทำเสร็จก่อนอีก thread จะเริ่มด้วยซ้ำ
     */
    @Test
    @DisplayName("US-05-S2 ยิงสร้างสัญญาห้องเดียวกันพร้อมกันสองคำขอ ต้องผ่านใบเดียว อีกใบได้ 409")
    void concurrentCreatesLeaveExactlyOneLease() throws Exception {
        CountDownLatch start = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(2);

        try {
            List<Future<Integer>> results = new ArrayList<>();
            for (long tenantId : List.of(yuki.getId(), somchai.getId())) {
                results.add(pool.submit(() -> {
                    start.await();
                    return mockMvc.perform(post("/api/leases")
                                    // @WithMockUser ระดับคลาสตั้ง SecurityContext ไว้ใน thread
                                    // ของเทสเท่านั้น สอง thread ในพูลนี้จึงมองไม่เห็นและจะได้ 401
                                    // ทั้งคู่แทนที่จะได้ 201 กับ 409 ต้องแนบผู้ใช้มากับคำขอตรง ๆ
                                    .with(user("admin"))
                                    .contentType(MediaType.APPLICATION_JSON)
                                    .content(body(ROOM_102, tenantId, STARTED, "null")))
                            .andReturn().getResponse().getStatus();
                }));
            }

            start.countDown();

            List<Integer> statuses = new ArrayList<>();
            for (Future<Integer> result : results) {
                statuses.add(result.get(30, TimeUnit.SECONDS));
            }

            assertThat(statuses).containsExactlyInAnyOrder(201, 409);
        } finally {
            pool.shutdownNow();
        }

        mockMvc.perform(get("/api/leases").param("roomId", String.valueOf(ROOM_102)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").value(hasSize(1)));
    }

    @Test
    @DisplayName("กรองด้วย status กับ tenantId พร้อมกันต้องเหลือเฉพาะสัญญาของผู้เช่าคนนั้น")
    void listAppliesStatusAndTenantFilters() throws Exception {
        createLease(body(ROOM_101, yuki.getId(), STARTED, "null")).andExpect(status().isCreated());
        createLease(body(ROOM_102, somchai.getId(), STARTED, "null")).andExpect(status().isCreated());

        mockMvc.perform(get("/api/leases")
                        .param("status", "ACTIVE")
                        .param("tenantId", String.valueOf(yuki.getId())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").value(hasSize(1)))
                .andExpect(jsonPath("$[0].roomNumber").value("101"))
                .andExpect(jsonPath("$[0].tenantName").value("ยูกิ ทานากะ"));

        // สถานะที่ไม่มีสัญญาไหนเป็นอยู่ ต้องได้ลิสต์ว่าง ไม่ใช่ทั้งหมด
        mockMvc.perform(get("/api/leases")
                        .param("status", "ENDED")
                        .param("tenantId", String.valueOf(yuki.getId())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").value(hasSize(0)));
    }

    @Test
    @DisplayName("US-06-S1 ปิดสัญญาแล้วต้องได้ ENDED และห้องกลับไปว่างเองทันทีโดยไม่ต้องสั่งแยก")
    void terminatingALeaseFreesTheRoomImmediately() throws Exception {
        long leaseId = createdLeaseId(body(ROOM_101, yuki.getId(), STARTED, "null"));

        mockMvc.perform(get("/api/rooms/{id}", ROOM_101))
                .andExpect(jsonPath("$.status").value("OCCUPIED"));

        terminateLease(leaseId, """
                {"endDate":"%s"}""".formatted(CHECK_OUT))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("ENDED"))
                .andExpect(jsonPath("$.endDate").value(CHECK_OUT));

        // "Then" ของ US-06-S1 สถานะห้องคำนวณจากสัญญา ACTIVE ที่ครอบวันนี้เท่านั้น
        // พอใบนี้ไม่ ACTIVE แล้วห้องจึงว่างทันที ไม่ต้องมี endpoint ปลดห้องแยกอีกตัว
        mockMvc.perform(get("/api/rooms/{id}", ROOM_101))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("AVAILABLE"))
                .andExpect(jsonPath("$.currentLease").isEmpty());
    }

    @Test
    @DisplayName("สั่งปิดสัญญาที่ปิดไปแล้วต้องได้ 409 พร้อมข้อความไทยชุดเดียวกับ backend จำลอง")
    void terminatingAnEndedLeaseIsRejected() throws Exception {
        long leaseId = createdLeaseId(body(ROOM_101, yuki.getId(), STARTED, "null"));
        String terminate = """
                {"endDate":"%s"}""".formatted(CHECK_OUT);

        terminateLease(leaseId, terminate).andExpect(status().isOk());

        terminateLease(leaseId, terminate)
                .andExpect(status().isConflict())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.detail").value("This lease has already ended"));
    }

    @Test
    @DisplayName("US-06-S2 แก้วันเริ่มถอยไปทับสัญญา active ใบอื่นของห้องเดียวกันต้องได้ 409")
    void updateThatOverlapsAnotherActiveLeaseIsRejected() throws Exception {
        createLease(body(ROOM_101, yuki.getId(), STARTED, "\"2027-08-31\""))
                .andExpect(status().isCreated());

        // ใบนี้เริ่มหลังใบแรกจบไปแล้วหนึ่งวัน จึงสร้างได้ปกติ
        long future = createdLeaseId(body(ROOM_101, somchai.getId(), "2027-09-01", "\"2028-08-31\""));

        updateLease(future, body(ROOM_101, somchai.getId(), "2027-01-01", "\"2028-08-31\""))
                .andExpect(status().isConflict())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.detail").value(containsString("Unit 101")))
                .andExpect(jsonPath("$.detail").value(containsString("is not available")))
                .andExpect(jsonPath("$.detail").value(containsString("ยูกิ ทานากะ")));

        // ใบที่แก้ไม่ผ่านต้องยังเป็นวันเดิม ไม่ใช่ถูกเขียนทับไปแล้วค่อยฟ้อง
        mockMvc.perform(get("/api/leases").param("roomId", String.valueOf(ROOM_101)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").value(hasSize(2)))
                .andExpect(jsonPath("$[0].startDate").value("2027-09-01"));
    }

    @Test
    @DisplayName("SSK-127 ห้องชั้น 2 เป็น DOUBLE ค่าเช่าต้องเป็น 4,500 ที่มาจาก V12 จริง ๆ")
    void createTakesTheRentFromTheRoomTypeOfThatVeryRoom() throws Exception {
        createLease(body(ROOM_201, yuki.getId(), STARTED, "null"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.roomNumber").value("201"))
                // ห้องนี้เคยเป็น 3,800 ตาม seed V2 ที่แบ่งตามชั้น พอ V12 ย้ายมาผูกกับชนิดห้อง
                // จึงกลายเป็น 4,500 เลขนี้จึงพิสูจน์ทั้งว่าอ่านจากชนิดห้อง และว่า migration
                // ใส่อัตราลงฐานจริงแล้ว ไม่ใช่แค่ entity map ถูก
                .andExpect(jsonPath("$.monthlyRent").value(4500.00));
    }

    @Test
    @DisplayName("SSK-127 ส่งค่าเช่าใหม่มาตอนแก้สัญญา ต้องถูกมองข้าม อัตราที่ล็อกไว้ยังเป็นชุดเดิม")
    void updateIgnoresTheRentInTheRequestAndKeepsTheRatesLockedAtSigning() throws Exception {
        long leaseId = createdLeaseId(body(ROOM_101, yuki.getId(), STARTED, "null"));

        // body หกช่องแบบที่ฟอร์มส่งมาจริง ไม่มีอัตราติดมาด้วย
        updateLease(leaseId, """
                {"roomId":%d,"tenantId":%d,"startDate":"%s","endDate":null,\
                "monthlyRent":4000,"billingCycle":"MONTHLY"}"""
                .formatted(ROOM_101, yuki.getId(), STARTED))
                .andExpect(status().isOk())
                // ส่ง 4000 มาแต่ต้องได้ 3500 กลับไป เพราะค่าเช่ามาจากชนิดห้อง ไม่ใช่จาก body
                // ห้อง 101 อยู่ชั้น 1 จึงเป็น SINGLE = 3,500 ตาม V12__rent_by_room_type.sql
                .andExpect(jsonPath("$.monthlyRent").value(3500.00))
                .andExpect(jsonPath("$.status").value("ACTIVE"))
                // ไม่ได้ส่งมาจึงต้องคงค่าที่ล็อกไว้ตอนเซ็น ไม่ใช่ไปอ่าน apartment_config ใหม่
                .andExpect(jsonPath("$.electricRatePerUnit").value(8.00))
                .andExpect(jsonPath("$.waterRatePerUnit").value(18.00));
    }

    /*
     * ข้อกำหนดหลักของ V12 ที่ต้องมีเทสคุม แก้อัตราของชนิดห้องแล้วสัญญาที่เซ็นไปแล้วต้องไม่ขยับ
     * หลักเดียวกับอัตราค่าน้ำค่าไฟใน US-16-S3 ถ้าไม่มีตัวนี้ วันที่มีคนขึ้นค่าเช่า สัญญาเก่า
     * ทุกใบจะเปลี่ยนยอดตามย้อนหลัง ซึ่งผิดทั้งทางบัญชีและทางกฎหมาย
     */
    @Test
    @DisplayName("SSK-127 ขึ้นค่าเช่าของชนิดห้องแล้ว สัญญาที่เซ็นไปแล้วต้องยังเป็นยอดเดิม")
    void raisingATypeRentDoesNotTouchLeasesAlreadySigned() throws Exception {
        long leaseId = createdLeaseId(body(ROOM_101, yuki.getId(), STARTED, "null"));
        RoomTypeRate before = roomTypeRateRepository.findById(RoomType.SINGLE).orElseThrow();

        try {
            roomTypeRateRepository.saveAndFlush(
                    new RoomTypeRate(RoomType.SINGLE, new BigDecimal("6000.00")));

            // ไม่มี GET /api/leases/{id} จึงอ่านผ่านรายการที่กรองด้วยห้อง เหมือนเทสอื่นในคลาสนี้
            mockMvc.perform(get("/api/leases").param("roomId", String.valueOf(ROOM_101)))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$[0].monthlyRent").value(3500.00));

            // เคสที่หลุดง่ายที่สุดและอันตรายที่สุด แอดมินขึ้นราคาแล้วมากดแก้วันจบสัญญาของใบเก่า
            // ถ้า update ไปคำนวณค่าเช่าใหม่จากชนิดห้อง ใบนี้จะเด้งเป็น 6,000 ย้อนหลังเงียบ ๆ
            // การอ่านเฉย ๆ ไม่มีวันจับได้ เพราะ GET อ่านคอลัมน์ที่ยังไม่มีใครเขียนทับ
            updateLease(leaseId, body(ROOM_101, yuki.getId(), STARTED, "\"2027-08-31\""))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.endDate").value("2027-08-31"))
                    .andExpect(jsonPath("$.monthlyRent").value(3500.00));
        } finally {
            // คืนอัตราเดิม เทสคลาสอื่นใช้ container เดียวกัน
            roomTypeRateRepository.saveAndFlush(before);
        }
    }

    @Test
    @DisplayName("ไม่ส่งช่อง endDate มาเลยถือว่าไม่กำหนดวันจบ แต่ขาด roomId ต้องได้ 400 ที่บอกชื่อช่อง")
    void updateAcceptsMissingEndDateButNotMissingRoomId() throws Exception {
        long leaseId = createdLeaseId(body(ROOM_101, yuki.getId(), STARTED, "\"2027-08-31\""));

        updateLease(leaseId, """
                {"roomId":%d,"tenantId":%d,"startDate":"%s",\
                "monthlyRent":9999,"billingCycle":"MONTHLY"}"""
                .formatted(ROOM_101, yuki.getId(), STARTED))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.endDate").isEmpty());

        updateLease(leaseId, """
                {"tenantId":%d,"startDate":"%s","endDate":null,\
                "monthlyRent":9999,"billingCycle":"MONTHLY"}"""
                .formatted(yuki.getId(), STARTED))
                .andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.detail").value("Please choose the unit"))
                .andExpect(jsonPath("$.fields.roomId").value("Please choose the unit"));
    }

    @Test
    @DisplayName("แก้สัญญาที่ไม่มีต้องได้ 404 ที่บอกว่าไม่พบสัญญา id ไหน")
    void updateOnUnknownLeaseIsNotFound() throws Exception {
        updateLease(999L, body(ROOM_101, yuki.getId(), STARTED, "null"))
                .andExpect(status().isNotFound())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.detail").value("No lease with id 999"));
    }

    @Test
    @DisplayName("สั่งปิดสัญญาโดยไม่ส่งวันสิ้นสุดมาต้องได้ 400 ไม่ใช่เดาวันนี้ให้เงียบ ๆ")
    void terminateWithoutEndDateIsRejected() throws Exception {
        long leaseId = createdLeaseId(body(ROOM_101, yuki.getId(), STARTED, "null"));

        terminateLease(leaseId, "{}")
                .andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.detail").value("Please choose the end date"));

        // ต้องไม่ถูกปิดไปครึ่ง ๆ กลาง ๆ สัญญายังต้อง ACTIVE เหมือนเดิม
        mockMvc.perform(get("/api/leases").param("status", "ACTIVE"))
                .andExpect(jsonPath("$").value(hasSize(1)));
    }

    private ResultActions createLease(String body) throws Exception {
        return mockMvc.perform(post("/api/leases")
                .contentType(MediaType.APPLICATION_JSON)
                .content(body));
    }

    private ResultActions updateLease(long id, String body) throws Exception {
        return mockMvc.perform(put("/api/leases/{id}", id)
                .contentType(MediaType.APPLICATION_JSON)
                .content(body));
    }

    private ResultActions terminateLease(long id, String body) throws Exception {
        return mockMvc.perform(post("/api/leases/{id}/terminate", id)
                .contentType(MediaType.APPLICATION_JSON)
                .content(body));
    }

    /**
     * สร้างสัญญาแล้วคืน id ที่ database ออกให้ เทสของ US-06 ต้องเอาไปยิง PUT กับ terminate ต่อ
     * <p>
     * อ่าน id จาก response แทนที่จะเดาว่าเป็น 1 เพราะ sequence ไม่ได้ถูกรีเซ็ตระหว่างเทส
     * (clearLeasesAndTenants ลบแถวอย่างเดียว) ใบแรกของเทสที่สองจึงไม่ใช่ id 1 อีกแล้ว
     */
    private long createdLeaseId(String body) throws Exception {
        String json = createLease(body)
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return ((Number) JsonPath.read(json, "$.id")).longValue();
    }

    /** endDate ส่งเป็นสตริง JSON ดิบ เพราะรับได้ทั้ง null และวันที่ในเครื่องหมายคำพูด */
    private static String body(long roomId, long tenantId, String startDate, String endDate) {
        return """
                {"roomId":%d,"tenantId":%d,"startDate":"%s","endDate":%s,\
                "monthlyRent":9999,"billingCycle":"MONTHLY"}"""
                .formatted(roomId, tenantId, startDate, endDate);
    }
}
