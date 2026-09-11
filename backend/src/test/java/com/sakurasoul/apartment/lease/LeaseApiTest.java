package com.sakurasoul.apartment.lease;

import com.sakurasoul.apartment.TestcontainersConfiguration;
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
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.testcontainers.DockerClientFactory;

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
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * เทสของ US-04 กับ US-05 ระดับ HTTP ยิงผ่าน MockMvc ทะลุถึง PostgreSQL ตัวจริง
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
class LeaseApiTest {

    /** ห้อง 101 กับ 102 มาจาก migration V2 ห้ามลบทิ้งตอนล้างข้อมูล */
    private static final long ROOM_101 = 1L;
    private static final long ROOM_102 = 2L;

    /** อยู่ก่อนวันนี้และไม่กำหนดวันจบ สัญญาจึงครอบวันนี้ ห้องต้องขึ้น OCCUPIED */
    private static final String STARTED = "2026-09-01";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private LeaseRepository leaseRepository;

    @Autowired
    private TenantRepository tenantRepository;

    private Tenant yuki;
    private Tenant somchai;

    static boolean dockerAvailable() {
        return DockerClientFactory.instance().isDockerAvailable();
    }

    @BeforeEach
    void createTenants() {
        yuki = tenantRepository.saveAndFlush(new Tenant("ยูกิ ทานากะ", "081-000-0000", null));
        somchai = tenantRepository.saveAndFlush(new Tenant("สมชาย ใจดี", "089-000-0000", null));
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
                "monthlyRent":3500,"billingCycle":"MONTHLY"}"""
                .formatted(ROOM_101, yuki.getId(), STARTED))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("ACTIVE"))
                .andExpect(jsonPath("$.roomNumber").value("101"))
                .andExpect(jsonPath("$.tenantName").value("ยูกิ ทานากะ"))
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
                "monthlyRent":3500,"billingCycle":"MONTHLY","securityDeposit":7000,\
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
                .andExpect(jsonPath("$.detail").value(containsString("ห้อง 101")))
                .andExpect(jsonPath("$.detail").value(containsString("ไม่ว่าง")))
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
                .andExpect(jsonPath("$.detail").value("วันสิ้นสุดสัญญาต้องไม่มาก่อนวันเริ่มสัญญา"));
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
                "monthlyRent":3500,"billingCycle":"MONTHLY"}"""
                .formatted(yuki.getId(), STARTED))
                .andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.detail").value("ต้องระบุห้อง"))
                .andExpect(jsonPath("$.fields.roomId").value("ต้องระบุห้อง"));
    }

    @Test
    @DisplayName("ห้องที่ไม่มีต้องได้ 404 ที่บอกว่าไม่พบอะไร id ไหน")
    void unknownRoomIsNotFound() throws Exception {
        createLease(body(999L, yuki.getId(), STARTED, "null"))
                .andExpect(status().isNotFound())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.detail").value("ไม่พบห้อง id 999"));
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

    private ResultActions createLease(String body) throws Exception {
        return mockMvc.perform(post("/api/leases")
                .contentType(MediaType.APPLICATION_JSON)
                .content(body));
    }

    /** endDate ส่งเป็นสตริง JSON ดิบ เพราะรับได้ทั้ง null และวันที่ในเครื่องหมายคำพูด */
    private static String body(long roomId, long tenantId, String startDate, String endDate) {
        return """
                {"roomId":%d,"tenantId":%d,"startDate":"%s","endDate":%s,\
                "monthlyRent":3500,"billingCycle":"MONTHLY"}"""
                .formatted(roomId, tenantId, startDate, endDate);
    }
}
