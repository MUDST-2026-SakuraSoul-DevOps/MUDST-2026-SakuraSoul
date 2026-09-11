package com.sakurasoul.apartment.room;

import com.sakurasoul.apartment.TestcontainersConfiguration;
import com.sakurasoul.apartment.common.AppTime;
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
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.testcontainers.DockerClientFactory;

import java.time.LocalDate;
import java.util.List;

import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * เทสของ US-15 ระดับ HTTP ยิงผ่าน MockMvc ทะลุถึง PostgreSQL ตัวจริงใน Testcontainers
 * <p>
 * ชุดนี้คู่กับ describe('US-15 ล็อกสถานะห้องเป็นซ่อมบำรุง') ใน frontend/src/api/client.test.ts
 * เคสต่อเคส ฝั่งนั้นเทสกับ backend จำลอง ฝั่งนี้เทสกับของจริง ถ้าสองฝั่งยังเขียวพร้อมกัน
 * แปลว่าหน้าเว็บสลับไปต่อของจริงได้โดยไม่ต้องแก้โค้ด
 * <p>
 * ที่ต้องมีชั้นนี้เพิ่มจาก RoomServiceTest เพราะเรื่องที่พังได้เฉพาะตอนผ่าน HTTP จริงมี
 * สามอย่าง คือ PATCH ไปถึง controller ไหม (method ใหม่ของโปรเจกต์นี้) ธงถูกเขียนลง
 * ฐานจริงจน GET ครั้งถัดไปเห็นไหม และ entity กับ V5 ตรงกันพอให้ ddl-auto: validate
 * ยอมให้แอปสตาร์ตไหม สามเรื่องนี้ mock จับไม่ได้สักอย่าง
 * <p>
 * เครื่องที่ไม่ได้เปิด Docker จะข้ามเทสชุดนี้ ไม่ใช่ล้ม ส่วน CI มี Docker อยู่แล้วจะรันจริง
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
@EnabledIf("dockerAvailable")
class RoomApiTest {

    /** ห้อง 101 กับ 102 มาจาก migration V2 เรียงตามเลขห้องแล้วสองใบแรกคือคู่นี้ */
    private static final long ROOM_101 = 1L;
    private static final long ROOM_102 = 2L;

    /** ตึกนี้มี 24 ห้องตายตัวตาม V2 ถ้าเลขเปลี่ยนแปลว่า migration ถูกแก้ */
    private static final int ROOM_COUNT = 24;

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private RoomRepository roomRepository;

    @Autowired
    private LeaseRepository leaseRepository;

    @Autowired
    private TenantRepository tenantRepository;

    private Tenant yuki;

    static boolean dockerAvailable() {
        return DockerClientFactory.instance().isDockerAvailable();
    }

    @BeforeEach
    void createTenant() {
        yuki = tenantRepository.saveAndFlush(new Tenant("ยูกิ ทานากะ", "081-000-0000", null));
    }

    /**
     * ปลดธงซ่อมทุกห้องคืน เพราะธงเป็นคอลัมน์ของห้องซึ่งเป็นข้อมูลจริงของตึกที่ใช้ร่วมกัน
     * ทุกเทส ถ้าปล่อยค้างไว้ เทสคลาสอื่นที่ใช้ container เดียวกันจะเห็นห้องปิดซ่อมโผล่มา
     * แล้วพังตามลำดับการรัน ไม่ใช่พังเพราะ logic ผิด
     * <p>
     * ลบสัญญาก่อนผู้เช่าเสมอ เพราะ lease มี foreign key ไปที่ tenant และลบเฉพาะผู้เช่าที่
     * เทสนี้สร้างเอง ส่วนห้อง 24 ห้องมาจาก migration ห้ามลบ
     */
    @AfterEach
    void unlockRoomsAndClearTestData() {
        List<Room> rooms = roomRepository.findAll();
        rooms.forEach(Room::releaseFromMaintenance);
        roomRepository.saveAll(rooms);

        leaseRepository.deleteAll();
        tenantRepository.delete(yuki);
    }

    @Test
    @DisplayName("US-15-S1 ล็อกห้องว่าง ต้องได้ 200 MAINTENANCE และผังห้องต้องเห็นตามนั้น")
    void lockingAnEmptyRoomShowsUpOnTheRoomList() throws Exception {
        patchStatus(ROOM_101, "MAINTENANCE")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value((int) ROOM_101))
                .andExpect(jsonPath("$.roomNumber").value("101"))
                .andExpect(jsonPath("$.status").value("MAINTENANCE"));

        // เรียงตามเลขห้อง ใบแรกจึงเป็นห้อง 101 เสมอ
        mockMvc.perform(get("/api/rooms"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].roomNumber").value("101"))
                .andExpect(jsonPath("$[0].status").value("MAINTENANCE"));
    }

    /**
     * US-15-S1 ห้องที่มีผู้เช่าอยู่ก็ล็อกได้ และสัญญาต้องไม่ถูกแตะ
     * <p>
     * เป็นเคสที่แยกธงซ่อมออกจากสถานะมาไว้ตั้งแต่ต้น ถ้าเก็บเป็นคอลัมน์ status ตัวเดียว
     * การล็อกจะไปทับสถานะมีผู้เช่าทิ้ง แล้วไม่มีทางรู้ว่าต้องกลับไปเป็นอะไรตอนปลดล็อก
     */
    @Test
    @DisplayName("US-15-S1 ล็อกห้องที่มีผู้เช่าอยู่ได้ และสัญญาต้องยังอยู่ในรายการ ACTIVE")
    void lockingAnOccupiedRoomKeepsItsLease() throws Exception {
        createActiveLease(ROOM_102);

        patchStatus(ROOM_102, "MAINTENANCE")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("MAINTENANCE"))
                // สัญญายังผูกกับห้องอยู่ ยังส่งกลับไปให้หน้าเว็บโชว์ได้เหมือนเดิม
                .andExpect(jsonPath("$.currentLease.tenantName").value("ยูกิ ทานากะ"));

        mockMvc.perform(get("/api/leases").param("status", "ACTIVE"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.roomNumber=='102')]", hasSize(1)))
                .andExpect(jsonPath("$[?(@.roomNumber=='102')].status", hasSize(1)));
    }

    @Test
    @DisplayName("US-15-S2 ปลดล็อกห้องที่ไม่มีสัญญา ต้องกลับไปเป็น AVAILABLE")
    void unlockingAnEmptyRoomGoesBackToAvailable() throws Exception {
        patchStatus(ROOM_101, "MAINTENANCE").andExpect(status().isOk());

        patchStatus(ROOM_101, "AVAILABLE")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("AVAILABLE"))
                .andExpect(jsonPath("$.currentLease").value(nullValue()));

        mockMvc.perform(get("/api/rooms/{id}", ROOM_101))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("AVAILABLE"));
    }

    /**
     * หัวใจของ US-15-S2 ส่ง AVAILABLE ไปแต่ต้องได้ OCCUPIED กลับมาในคำตอบเดียวกันนั้น
     * เพราะสิ่งที่สั่งคือปลดธงซ่อม ไม่ใช่ประกาศว่าห้องว่าง สถานะยังคำนวณจากสัญญาเหมือนเดิม
     */
    @Test
    @DisplayName("US-15-S2 ปลดล็อกห้องที่ยังมีสัญญา ต้องได้ OCCUPIED กลับมาทันที ไม่ใช่ AVAILABLE")
    void unlockingAnOccupiedRoomGoesBackToOccupied() throws Exception {
        createActiveLease(ROOM_102);
        patchStatus(ROOM_102, "MAINTENANCE").andExpect(jsonPath("$.status").value("MAINTENANCE"));

        patchStatus(ROOM_102, "AVAILABLE")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("OCCUPIED"))
                .andExpect(jsonPath("$.currentLease.tenantName").value("ยูกิ ทานากะ"));
    }

    @Test
    @DisplayName("US-15 ตั้ง OCCUPIED เองต้องได้ 400 เป็น problem+json พร้อมข้อความไทย และห้องต้องไม่เปลี่ยน")
    void settingOccupiedByHandIsRejectedAndChangesNothing() throws Exception {
        patchStatus(ROOM_101, "OCCUPIED")
                .andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.detail").value("สถานะที่ตั้งเองได้มีแค่ MAINTENANCE กับ AVAILABLE"));

        mockMvc.perform(get("/api/rooms/{id}", ROOM_101))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("AVAILABLE"));
    }

    @Test
    @DisplayName("US-15 ล็อกห้องที่ไม่มีต้องได้ 404 ที่บอกว่าไม่พบอะไร id ไหน")
    void lockingAnUnknownRoomIsNotFound() throws Exception {
        patchStatus(999L, "MAINTENANCE")
                .andExpect(status().isNotFound())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.detail").value("ไม่พบห้อง id 999"));
    }

    /**
     * สองช่องนี้ยังเป็นที่ว่างรอ epic งานซ่อม (CR-05) แต่ต้องมีอยู่ใน JSON ตั้งแต่ตอนนี้
     * เพราะสัญญา API เขียนไว้แล้ว และการ์ดห้องใน Figma อ่านสองช่องนี้ไปแปะบนหน้าจอ
     */
    @Test
    @DisplayName("รายละเอียดห้องต้องมี openMaintenanceCount กับ openMaintenanceTitle ครบตามสัญญา API")
    void roomDetailCarriesTheMaintenanceTicketPlaceholders() throws Exception {
        mockMvc.perform(get("/api/rooms/{id}", ROOM_101))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.openMaintenanceCount").value(0))
                .andExpect(jsonPath("$.openMaintenanceTitle").value(nullValue()));
    }

    @Test
    @DisplayName("ผังห้องต้องยังได้ครบ 24 ห้องและทุกห้องมี status ติดมาด้วย")
    void roomListStillReturnsEveryRoomWithAStatus() throws Exception {
        mockMvc.perform(get("/api/rooms"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(ROOM_COUNT)))
                // ห้องไหนขาด status ไปแม้ห้องเดียว จำนวนที่ดึงได้จะไม่ครบ
                .andExpect(jsonPath("$[*].status", hasSize(ROOM_COUNT)))
                .andExpect(jsonPath("$[*].openMaintenanceCount", hasSize(ROOM_COUNT)));
    }

    private ResultActions patchStatus(long roomId, String status) throws Exception {
        return mockMvc.perform(patch("/api/rooms/{id}/status", roomId)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"status\":\"%s\"}".formatted(status)));
    }

    /**
     * สร้างสัญญาผ่าน POST /api/leases ด้วย body หกช่องแบบที่ฟอร์มหน้าเว็บส่งจริง
     * เริ่มย้อนหลังหนึ่งเดือนและไม่กำหนดวันจบ สัญญาจะได้ครอบวันนี้แน่ ๆ ไม่ว่ารันวันไหน
     */
    private void createActiveLease(long roomId) throws Exception {
        LocalDate startDate = AppTime.today().minusMonths(1);
        mockMvc.perform(post("/api/leases")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"roomId":%d,"tenantId":%d,"startDate":"%s","endDate":null,\
                                "monthlyRent":3500,"billingCycle":"MONTHLY"}"""
                                .formatted(roomId, yuki.getId(), startDate)))
                .andExpect(status().isCreated());
    }
}
