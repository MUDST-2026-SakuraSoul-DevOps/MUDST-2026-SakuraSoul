package com.sakurasoul.apartment.maintenance;

import com.jayway.jsonpath.JsonPath;
import com.sakurasoul.apartment.TestcontainersConfiguration;
import com.sakurasoul.apartment.room.Room;
import com.sakurasoul.apartment.room.RoomRepository;
import org.junit.jupiter.api.AfterEach;
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

import java.util.List;

import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.notNullValue;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * เทสของ US-12 (บันทึกงานซ่อม) และ US-13 (ประวัติรายห้อง) ระดับ HTTP ยิงผ่าน MockMvc
 * ทะลุถึง PostgreSQL ตัวจริงใน Testcontainers
 * <p>
 * ที่ต้องมีชั้นนี้เพิ่มจาก MaintenanceServiceTest เพราะเรื่องที่พังได้เฉพาะตอนผ่าน HTTP
 * และฐานข้อมูลจริงมีสี่อย่าง คือรูปร่าง JSON ตรงกับ MaintenanceTicket ฝั่งหน้าเว็บไหม
 * entity กับ V8 ตรงกันพอให้ ddl-auto: validate ยอมให้แอปสตาร์ตไหม การตัดสต็อกกับ
 * การบันทึกใบอยู่ใน transaction เดียวกันจริงไหม (ของไม่พอแล้วต้องไม่มีใบค้างไว้)
 * และค่า openMaintenanceCount กับ openMaintenanceTitle ที่การ์ดห้องอ่านมาจากคิวรีจริง
 * <p>
 * เครื่องที่ไม่ได้เปิด Docker จะข้ามเทสชุดนี้ ไม่ใช่ล้ม ส่วน CI มี Docker อยู่แล้วจะรันจริง
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
@EnabledIf("dockerAvailable")
// ทุก endpoint ต้องล็อกอินแล้วตั้งแต่ SSK-28 ชุดนี้จึงยิงในนามผู้ใช้ปลอม เพราะสิ่งที่เทสคือ US-12 กับ US-13 ไม่ใช่ระบบ login
@WithMockUser
class MaintenanceApiTest {

    /** ห้อง 101 กับ 102 มาจาก migration V2 เรียงตามเลขห้องแล้วสองใบแรกคือคู่นี้ */
    private static final long ROOM_101 = 1L;
    private static final long ROOM_102 = 2L;

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private MaintenanceTicketRepository ticketRepository;

    @Autowired
    private MaintenanceSupplyUsageRepository usageRepository;

    @Autowired
    private SupplyItemRepository supplyRepository;

    @Autowired
    private RoomRepository roomRepository;

    static boolean dockerAvailable() {
        return DockerClientFactory.instance().isDockerAvailable();
    }

    /**
     * ลบการเบิกของก่อนใบแจ้งซ่อมและก่อนอุปกรณ์เสมอ เพราะ maintenance_supply_usage
     * มี foreign key ไปทั้งสองตาราง ส่วนห้อง 24 ห้องมาจาก migration V2 ห้ามลบ
     * <p>
     * ปลดธงซ่อมทุกห้องคืนด้วย เพราะเทสเรื่อง "ปิดใบแล้วห้องต้องไม่ถูกปลดล็อก" ล็อกห้องไว้
     * ถ้าปล่อยค้าง เทสคลาสอื่นที่ใช้ container เดียวกันจะเห็นห้องปิดซ่อมโผล่มาแล้วพัง
     * ตามลำดับการรัน ไม่ใช่พังเพราะ logic ผิด
     */
    @AfterEach
    void clearTicketsAndSupplies() {
        usageRepository.deleteAll();
        ticketRepository.deleteAll();
        supplyRepository.deleteAll();

        List<Room> rooms = roomRepository.findAll();
        rooms.forEach(Room::releaseFromMaintenance);
        roomRepository.saveAll(rooms);
    }

    @Test
    @DisplayName("US-12-S1 บันทึกงานซ่อมต้องได้ 201 และการ์ดห้องต้องขึ้นงานค้างหนึ่งใบทันที")
    void creatingATicketShowsUpOnTheRoomCard() throws Exception {
        createTicket("""
                {"roomId":%d,"title":"แอร์ไม่เย็น","detail":"ห้องนอนแอร์ไม่เย็นตั้งแต่เมื่อวาน",\
                "maintenanceType":"แอร์","priority":"HIGH","assignedTo":"ช่างสมศักดิ์",\
                "reportedBy":"ยูกิ ทานากะ","scheduledDate":"2026-10-09","cost":850.5}"""
                .formatted(ROOM_101))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.roomId").value((int) ROOM_101))
                .andExpect(jsonPath("$.roomNumber").value("101"))
                .andExpect(jsonPath("$.title").value("แอร์ไม่เย็น"))
                .andExpect(jsonPath("$.status").value("OPEN"))
                .andExpect(jsonPath("$.priority").value("HIGH"))
                .andExpect(jsonPath("$.maintenanceType").value("แอร์"))
                .andExpect(jsonPath("$.assignedTo").value("ช่างสมศักดิ์"))
                .andExpect(jsonPath("$.scheduledDate").value("2026-10-09"))
                // NUMERIC(10,2) เก็บได้สองตำแหน่ง ค่าที่ตอบกลับต้องตรงกับที่เก็บจริง
                .andExpect(jsonPath("$.cost").value(850.50))
                .andExpect(jsonPath("$.source").value("MANUAL"))
                .andExpect(jsonPath("$.closedAt").value(nullValue()))
                .andExpect(jsonPath("$.reportedAt").value(notNullValue()))
                .andExpect(jsonPath("$.suppliesUsed").value(hasSize(0)));

        // "Then" ของ US-12-S1 การ์ดห้องต้องรู้เองโดยไม่ต้องสั่งอะไรเพิ่ม
        // เรียงตามเลขห้อง ใบแรกจึงเป็นห้อง 101 เสมอ
        mockMvc.perform(get("/api/rooms"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].roomNumber").value("101"))
                .andExpect(jsonPath("$[0].openMaintenanceCount").value(1))
                .andExpect(jsonPath("$[0].openMaintenanceTitle").value("แอร์ไม่เย็น"));
    }

    /**
     * เฟรม Dashboard ใน Figma โชว์ข้อความของงานที่ค้างอยู่บนการ์ด ไม่ใช่ตัวเลขจำนวนใบ
     * และข้อความที่ต้องโชว์คือใบที่ค้างนานที่สุด ไม่ใช่ใบล่าสุด
     */
    @Test
    @DisplayName("US-12 ห้องที่มีงานค้างสองใบ การ์ดต้องนับได้ 2 และโชว์ชื่อใบที่แจ้งไว้ก่อน")
    void theOldestOpenTicketWinsTheCardTitle() throws Exception {
        createTicket(body(ROOM_101, "ก๊อกน้ำรั่ว")).andExpect(status().isCreated());
        createTicket(body(ROOM_101, "หลอดไฟขาด")).andExpect(status().isCreated());

        mockMvc.perform(get("/api/rooms/{id}", ROOM_101))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.openMaintenanceCount").value(2))
                .andExpect(jsonPath("$.openMaintenanceTitle").value("ก๊อกน้ำรั่ว"));
    }

    @Test
    @DisplayName("US-12 ปิดงานต้องตั้งเวลาปิดและการ์ดห้องต้องกลับไปไม่มีงานค้าง")
    void closingATicketStampsClosedAtAndClearsTheCard() throws Exception {
        long ticketId = createdTicketId(body(ROOM_101, "ก๊อกน้ำรั่ว"));

        patchTicket(ticketId, """
                {"status":"DONE","cost":250}""")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("DONE"))
                .andExpect(jsonPath("$.closedAt").value(notNullValue()))
                .andExpect(jsonPath("$.cost").value(250.00));

        mockMvc.perform(get("/api/rooms/{id}", ROOM_101))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.openMaintenanceCount").value(0))
                .andExpect(jsonPath("$.openMaintenanceTitle").value(nullValue()));

        // เปิดใบกลับมาใหม่ต้องล้างเวลาปิดทิ้ง ไม่ใช่ค้างไว้ให้รายงานนับผิด
        patchTicket(ticketId, """
                {"status":"IN_PROGRESS"}""")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("IN_PROGRESS"))
                .andExpect(jsonPath("$.closedAt").value(nullValue()));
    }

    /**
     * การปิดใบแจ้งซ่อมกับการปลดล็อกห้อง (US-15) เป็นคนละเรื่องกันโดยตั้งใจ
     * ห้องที่แอดมินตั้งใจปิดไว้ซ่อมใหญ่ต้องไม่ถูกเปิดคืนเพราะงานย่อยงานหนึ่งเสร็จ
     */
    @Test
    @DisplayName("US-12 ปิดใบแจ้งซ่อมต้องไม่ไปปลดล็อกห้องที่แอดมินตั้งเป็นซ่อมบำรุงไว้")
    void closingATicketDoesNotUnlockTheRoom() throws Exception {
        long ticketId = createdTicketId(body(ROOM_102, "ปูกระเบื้องใหม่"));

        mockMvc.perform(patch("/api/rooms/{id}/status", ROOM_102)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"status\":\"MAINTENANCE\"}"))
                .andExpect(status().isOk());

        patchTicket(ticketId, """
                {"status":"DONE"}""").andExpect(status().isOk());

        mockMvc.perform(get("/api/rooms/{id}", ROOM_102))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("MAINTENANCE"))
                .andExpect(jsonPath("$.openMaintenanceCount").value(0));
    }

    /**
     * ป้าย Wait for Assign บนหน้าจอคำนวณจาก status OPEN บวก assignedTo ที่เป็น null
     * (ดู docs/api-contract-maintenance.md) ใบที่มอบหมายไปแล้วจึงต้องถอนกลับได้
     * และค่าที่ถอนแล้วต้องเป็น null ไม่ใช่สตริงว่าง ไม่งั้นใบจะค้างป้าย Pending
     */
    @Test
    @DisplayName("US-12 ส่ง assignedTo เป็นค่าว่างต้องถอนการมอบหมาย ใบกลับไปเป็นยังไม่มีคนรับ")
    void clearingTheAssigneeSendsItBackToWaitForAssign() throws Exception {
        long ticketId = createdTicketId(body(ROOM_101, "ก๊อกน้ำรั่ว"));

        patchTicket(ticketId, """
                {"assignedTo":"ช่างสมศักดิ์"}""")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.assignedTo").value("ช่างสมศักดิ์"));

        patchTicket(ticketId, """
                {"assignedTo":"  "}""")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("OPEN"))
                .andExpect(jsonPath("$.assignedTo").value(nullValue()));

        // ไม่ส่งช่องนี้มาเลยยังแปลว่า "ไม่แก้" เหมือนเดิม ไม่ใช่ล้างค่า
        patchTicket(ticketId, """
                {"assignedTo":"ช่างสมชาย"}""").andExpect(status().isOk());
        patchTicket(ticketId, """
                {"priority":"HIGH"}""")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.assignedTo").value("ช่างสมชาย"));
    }

    @Test
    @DisplayName("US-13-S1 รายการงานซ่อมต้องเรียงใบใหม่สุดขึ้นก่อน และกรองด้วย status ได้")
    void logIsNewestFirstAndFiltersByStatus() throws Exception {
        long first = createdTicketId(body(ROOM_101, "ก๊อกน้ำรั่ว"));
        createTicket(body(ROOM_102, "หลอดไฟขาด")).andExpect(status().isCreated());

        mockMvc.perform(get("/api/maintenance"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").value(hasSize(2)))
                .andExpect(jsonPath("$[0].title").value("หลอดไฟขาด"))
                .andExpect(jsonPath("$[1].title").value("ก๊อกน้ำรั่ว"));

        patchTicket(first, """
                {"status":"DONE"}""").andExpect(status().isOk());

        mockMvc.perform(get("/api/maintenance").param("status", "DONE"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").value(hasSize(1)))
                .andExpect(jsonPath("$[0].title").value("ก๊อกน้ำรั่ว"));

        mockMvc.perform(get("/api/maintenance").param("status", "OPEN")
                        .param("roomId", String.valueOf(ROOM_102)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").value(hasSize(1)))
                .andExpect(jsonPath("$[0].roomNumber").value("102"));
    }

    @Test
    @DisplayName("US-13-S1 ประวัติของห้องต้องมีเฉพาะใบของห้องนั้น เรียงใบใหม่สุดขึ้นก่อน")
    void roomHistoryReturnsOnlyThatRoomsTickets() throws Exception {
        createTicket(body(ROOM_101, "ก๊อกน้ำรั่ว")).andExpect(status().isCreated());
        createTicket(body(ROOM_101, "หลอดไฟขาด")).andExpect(status().isCreated());
        createTicket(body(ROOM_102, "แอร์ไม่เย็น")).andExpect(status().isCreated());

        mockMvc.perform(get("/api/rooms/{id}/maintenance", ROOM_101))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").value(hasSize(2)))
                .andExpect(jsonPath("$[0].title").value("หลอดไฟขาด"))
                .andExpect(jsonPath("$[1].title").value("ก๊อกน้ำรั่ว"));
    }

    @Test
    @DisplayName("ประวัติของห้องที่ไม่มีต้องได้ 404 ที่บอกว่าไม่พบอะไร id ไหน")
    void roomHistoryOfUnknownRoomIsNotFound() throws Exception {
        mockMvc.perform(get("/api/rooms/{id}/maintenance", 999L))
                .andExpect(status().isNotFound())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.detail").value("No unit with id 999"));
    }

    @Test
    @DisplayName("ไม่ส่งห้องหรือชื่องานมาต้องได้ 400 ที่ detail บอกชื่อช่องที่ขาด")
    void missingRequiredFieldsReportTheFieldInDetail() throws Exception {
        createTicket("""
                {"title":"ก๊อกน้ำรั่ว"}""")
                .andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.detail").value("Please choose the unit"))
                .andExpect(jsonPath("$.fields.roomId").value("Please choose the unit"));

        createTicket("""
                {"roomId":%d,"title":"  "}""".formatted(ROOM_101))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value("Please enter the task title"))
                .andExpect(jsonPath("$.fields.title").value("Please enter the task title"));
    }

    @Test
    @DisplayName("ค่าใช้จ่ายติดลบต้องได้ 400 พร้อมข้อความไทยที่หน้าเว็บเอาไปโชว์ได้")
    void negativeCostIsRejected() throws Exception {
        createTicket("""
                {"roomId":%d,"title":"ก๊อกน้ำรั่ว","cost":-1}""".formatted(ROOM_101))
                .andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.detail").value("The cost cannot be negative"));
    }

    @Test
    @DisplayName("ระดับความสำคัญหรือสถานะที่สะกดผิดต้องได้ 400 ที่บอกค่าที่ใช้ได้ครบ")
    void unknownEnumValuesAreRejectedWithTheAllowedList() throws Exception {
        createTicket("""
                {"roomId":%d,"title":"ก๊อกน้ำรั่ว","priority":"CRITICAL"}""".formatted(ROOM_101))
                .andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.detail")
                        .value("Priority must be LOW, MEDIUM, HIGH or URGENT"));

        long ticketId = createdTicketId(body(ROOM_101, "ก๊อกน้ำรั่ว"));

        patchTicket(ticketId, """
                {"status":"CLOSED"}""")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value("Status must be OPEN, IN_PROGRESS or DONE"));
    }

    @Test
    @DisplayName("แก้ใบที่ไม่มีต้องได้ 404 ที่บอกว่าไม่พบใบแจ้งซ่อม id ไหน")
    void patchingAnUnknownTicketIsNotFound() throws Exception {
        patchTicket(999L, """
                {"status":"DONE"}""")
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.detail").value("No maintenance ticket with id 999"));
    }

    @Test
    @DisplayName("US-12-S1 เบิกของ 2 ชิ้นจากที่มี 5 ต้องเหลือ 3 และใบต้องบอกได้ว่าใช้อะไรไป")
    void usingSuppliesDeductsTheStock() throws Exception {
        long bulbId = createdSupplyId("หลอดไฟ LED", "MT-BULB-01", 5);

        createTicket("""
                {"roomId":%d,"title":"เปลี่ยนหลอดไฟ","suppliesUsed":[{"supplyId":%d,"quantity":2}]}"""
                .formatted(ROOM_101, bulbId))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.suppliesUsed").value(hasSize(1)))
                .andExpect(jsonPath("$.suppliesUsed[0].supplyId").value((int) bulbId))
                .andExpect(jsonPath("$.suppliesUsed[0].name").value("หลอดไฟ LED"))
                .andExpect(jsonPath("$.suppliesUsed[0].quantity").value(2));

        mockMvc.perform(get("/api/supplies"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].stock").value(3));
    }

    /**
     * ของไม่พอต้องทำให้ทั้งใบไม่ถูกบันทึก ไม่ใช่บันทึกใบไว้แล้วค่อยฟ้อง เพราะ transaction
     * เดียวกันทั้งการสร้างใบและการตัดสต็อก เทสจึงต้องเช็คสองอย่าง คือสต็อกไม่ขยับ
     * และไม่มีใบค้างอยู่ในระบบ
     */
    @Test
    @DisplayName("US-12 เบิกของเกินที่มีต้องได้ 400 ที่บอกจำนวนที่เหลือ สต็อกและใบต้องไม่ถูกบันทึกเลย")
    void usingMoreThanTheStockRollsBackTheWholeTicket() throws Exception {
        long bulbId = createdSupplyId("หลอดไฟ LED", "MT-BULB-02", 5);

        createTicket("""
                {"roomId":%d,"title":"เปลี่ยนหลอดไฟ","suppliesUsed":[{"supplyId":%d,"quantity":10}]}"""
                .formatted(ROOM_101, bulbId))
                .andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.detail").value("Not enough หลอดไฟ LED in stock (only 5 left)"));

        mockMvc.perform(get("/api/supplies"))
                .andExpect(jsonPath("$[0].stock").value(5));
        mockMvc.perform(get("/api/maintenance"))
                .andExpect(jsonPath("$").value(hasSize(0)));
    }

    @Test
    @DisplayName("เบิกของที่ไม่มีในคลังต้องได้ 404 ที่บอกว่าไม่พบอุปกรณ์ id ไหน")
    void usingAnUnknownSupplyIsNotFound() throws Exception {
        createTicket("""
                {"roomId":%d,"title":"เปลี่ยนหลอดไฟ","suppliesUsed":[{"supplyId":999,"quantity":1}]}"""
                .formatted(ROOM_101))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.detail").value("No supply with id 999"));
    }

    @Test
    @DisplayName("US-12 เบิกของเพิ่มให้ใบที่เปิดไว้แล้วต้องตัดสต็อกด้วยกฎชุดเดียวกัน")
    void addingSuppliesToAnExistingTicket() throws Exception {
        long bulbId = createdSupplyId("หลอดไฟ LED", "MT-BULB-03", 4);
        long ticketId = createdTicketId(body(ROOM_101, "เปลี่ยนหลอดไฟ"));

        mockMvc.perform(post("/api/maintenance/{id}/supplies", ticketId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"supplyId":%d,"quantity":3}""".formatted(bulbId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.suppliesUsed").value(hasSize(1)))
                .andExpect(jsonPath("$.suppliesUsed[0].quantity").value(3));

        mockMvc.perform(get("/api/supplies"))
                .andExpect(jsonPath("$[0].stock").value(1));
    }

    private ResultActions createTicket(String body) throws Exception {
        return mockMvc.perform(post("/api/maintenance")
                .contentType(MediaType.APPLICATION_JSON)
                .content(body));
    }

    private ResultActions patchTicket(long id, String body) throws Exception {
        return mockMvc.perform(patch("/api/maintenance/{id}", id)
                .contentType(MediaType.APPLICATION_JSON)
                .content(body));
    }

    /**
     * อ่าน id จาก response แทนที่จะเดาว่าเป็น 1 เพราะ sequence ไม่ได้ถูกรีเซ็ตระหว่างเทส
     * (การล้างข้อมูลลบแถวอย่างเดียว) ใบแรกของเทสที่สองจึงไม่ใช่ id 1 อีกแล้ว
     */
    private long createdTicketId(String body) throws Exception {
        String json = createTicket(body)
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return ((Number) JsonPath.read(json, "$.id")).longValue();
    }

    /** รหัส SKU ขึ้นต้นด้วย MT- เพื่อไม่ให้ชนกับเทสคลาสอื่นที่ใช้ container เดียวกัน */
    private long createdSupplyId(String name, String sku, int stock) throws Exception {
        String json = mockMvc.perform(post("/api/supplies")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"%s","sku":"%s","category":"ไฟฟ้า","stock":%d,"minStock":2}"""
                                .formatted(name, sku, stock)))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return ((Number) JsonPath.read(json, "$.id")).longValue();
    }

    private static String body(long roomId, String title) {
        return """
                {"roomId":%d,"title":"%s"}""".formatted(roomId, title);
    }
}
