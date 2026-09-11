package com.sakurasoul.apartment.maintenance;

import com.jayway.jsonpath.JsonPath;
import com.sakurasoul.apartment.TestcontainersConfiguration;
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

import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.notNullValue;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * เทสของ US-17 คลังอุปกรณ์ ระดับ HTTP ยิงผ่าน MockMvc ทะลุถึง PostgreSQL ตัวจริง
 * <p>
 * ครอบทั้งห้า scenario ของ story คือเพิ่มของ (S1) เติมของแล้วนับเข้าการ์ดของสัปดาห์นี้ (S2)
 * ป้าย Low Stock ที่คำนวณจากจำนวน (S3) การค้นหาที่เป็นงานฝั่งหน้าเว็บจึงไม่มี endpoint (S4)
 * และการเติมที่ไม่เกินศูนย์ต้องถูกปฏิเสธ (S5)
 * <p>
 * เครื่องที่ไม่ได้เปิด Docker จะข้ามเทสชุดนี้ ไม่ใช่ล้ม ส่วน CI มี Docker อยู่แล้วจะรันจริง
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
@EnabledIf("dockerAvailable")
// ทุก endpoint ต้องล็อกอินแล้วตั้งแต่ SSK-28 ชุดนี้จึงยิงในนามผู้ใช้ปลอม เพราะสิ่งที่เทสคือ US-17 ไม่ใช่ระบบ login
@WithMockUser
class SupplyApiTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private SupplyItemRepository supplyRepository;

    @Autowired
    private SupplyRestockRepository restockRepository;

    static boolean dockerAvailable() {
        return DockerClientFactory.instance().isDockerAvailable();
    }

    /** ลบประวัติการเติมก่อนตัวของเสมอ เพราะ supply_restock มี foreign key ไปที่ supply_item */
    @AfterEach
    void clearSupplies() {
        restockRepository.deleteAll();
        supplyRepository.deleteAll();
    }

    @Test
    @DisplayName("US-17-S1 เพิ่มอุปกรณ์ต้องได้ 201 และโผล่ในรายการที่เรียงตามชื่อ")
    void addingASupplyShowsUpInTheList() throws Exception {
        createSupply("""
                {"name":"หลอดไฟ LED","sku":"SP-BULB-01","category":"ไฟฟ้า","stock":12,"minStock":5}""")
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.name").value("หลอดไฟ LED"))
                .andExpect(jsonPath("$.sku").value("SP-BULB-01"))
                .andExpect(jsonPath("$.category").value("ไฟฟ้า"))
                .andExpect(jsonPath("$.stock").value(12))
                .andExpect(jsonPath("$.minStock").value(5))
                .andExpect(jsonPath("$.status").value("IN_STOCK"))
                .andExpect(jsonPath("$.createdAt").value(notNullValue()));

        createSupply("""
                {"name":"ก๊อกน้ำ","sku":"SP-TAP-01","category":"ประปา","stock":3,"minStock":2}""")
                .andExpect(status().isCreated());

        // เรียงตามชื่อ ภาษาไทยเรียงตามลำดับอักษร ก. มาก่อน ห.
        mockMvc.perform(get("/api/supplies"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").value(hasSize(2)))
                .andExpect(jsonPath("$[0].name").value("ก๊อกน้ำ"))
                .andExpect(jsonPath("$[1].name").value("หลอดไฟ LED"));
    }

    /**
     * US-17-S3 ป้ายคำนวณจากจำนวนทุกครั้งที่ตอบ ไม่ได้เก็บไว้เป็นคอลัมน์ การแก้จำนวน
     * ให้ต่ำกว่าขั้นต่ำจึงเปลี่ยนป้ายทันทีโดยไม่ต้องไปสั่งอะไรเพิ่ม
     */
    @Test
    @DisplayName("US-17-S3 ของที่เหลือน้อยกว่าขั้นต่ำต้องขึ้น LOW_STOCK และเท่ากับขั้นต่ำยังเป็น IN_STOCK")
    void lowStockIsDerivedFromTheNumbers() throws Exception {
        long id = createdSupplyId("""
                {"name":"ไส้กรองแอร์","sku":"SP-FILTER-01","category":"แอร์","stock":2,"minStock":5}""");

        mockMvc.perform(get("/api/supplies"))
                .andExpect(jsonPath("$[0].status").value("LOW_STOCK"));

        // เท่ากับขั้นต่ำพอดียังไม่นับว่าใกล้หมด กฎเดียวกับ supplyStatus ฝั่งหน้าเว็บ (stock < minStock)
        updateSupply(id, """
                {"name":"ไส้กรองแอร์","sku":"SP-FILTER-01","category":"แอร์","stock":5,"minStock":5}""")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("IN_STOCK"));
    }

    @Test
    @DisplayName("US-17-S2 เติมของต้องบวกเพิ่มจากของเดิม และนับเข้าการ์ดของสัปดาห์นี้")
    void restockAddsToTheStockAndCountsTowardsThisWeek() throws Exception {
        long id = createdSupplyId("""
                {"name":"หลอดไฟ LED","sku":"SP-BULB-02","category":"ไฟฟ้า","stock":4,"minStock":5}""");

        restock(id, """
                {"quantity":10}""")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.stock").value(14))
                // เติมจนพ้นขั้นต่ำแล้ว ป้ายต้องเปลี่ยนเองในคำตอบเดียวกันนั้น
                .andExpect(jsonPath("$.status").value("IN_STOCK"));

        mockMvc.perform(get("/api/supplies/summary"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalItems").value(1))
                .andExpect(jsonPath("$.lowStockItems").value(0))
                .andExpect(jsonPath("$.restockedThisWeek").value(10));
    }

    @Test
    @DisplayName("US-17-S3 การ์ดสรุปต้องนับของที่ต่ำกว่าขั้นต่ำแยกจากจำนวนรายการทั้งหมด")
    void summaryCountsLowStockItems() throws Exception {
        createSupply("""
                {"name":"หลอดไฟ LED","sku":"SP-BULB-03","category":"ไฟฟ้า","stock":1,"minStock":5}""")
                .andExpect(status().isCreated());
        createSupply("""
                {"name":"ก๊อกน้ำ","sku":"SP-TAP-02","category":"ประปา","stock":9,"minStock":2}""")
                .andExpect(status().isCreated());

        mockMvc.perform(get("/api/supplies/summary"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalItems").value(2))
                .andExpect(jsonPath("$.lowStockItems").value(1))
                // ยังไม่มีใครกดเติมของ การ์ดต้องเป็นศูนย์ ไม่ใช่ยอดคงเหลือรวม
                .andExpect(jsonPath("$.restockedThisWeek").value(0));
    }

    @Test
    @DisplayName("US-17-S5 เติมของเป็นศูนย์หรือติดลบหรือไม่ส่งจำนวนมาเลย ต้องได้ 400 ประโยคเดียวกันทั้งสามแบบ")
    void restockingZeroOrLessIsRejected() throws Exception {
        long id = createdSupplyId("""
                {"name":"หลอดไฟ LED","sku":"SP-BULB-04","category":"ไฟฟ้า","stock":4,"minStock":2}""");

        restock(id, """
                {"quantity":0}""")
                .andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.detail").value("The restock amount must be greater than 0"));

        restock(id, """
                {"quantity":-3}""")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value("The restock amount must be greater than 0"));

        restock(id, "{}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value("The restock amount must be greater than 0"));

        // ไม่มีคำขอไหนผ่าน จำนวนต้องเท่าเดิมเป๊ะ
        mockMvc.perform(get("/api/supplies"))
                .andExpect(jsonPath("$[0].stock").value(4));
    }

    /**
     * จำนวนที่ไม่ใช่ตัวเลขไปไม่ถึง service เลย Jackson อ่าน body ไม่ออกตั้งแต่แรก
     * handler เดิมของโปรเจกต์แปลงให้เป็นข้อความไทยที่บอกชื่อช่องอยู่แล้ว
     */
    @Test
    @DisplayName("ส่งจำนวนที่ไม่ใช่ตัวเลขมาต้องได้ 400 ที่บอกชื่อช่อง ไม่ใช่ 500")
    void restockingWithANonNumberIsRejectedByTheBodyReader() throws Exception {
        long id = createdSupplyId("""
                {"name":"หลอดไฟ LED","sku":"SP-BULB-05","category":"ไฟฟ้า","stock":4,"minStock":2}""");

        restock(id, """
                {"quantity":"abc"}""")
                .andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.detail").value("The quantity field must be a number"));
    }

    @Test
    @DisplayName("US-17-S1 ไม่กรอกชื่อหรือหมวดหมู่ หรือจำนวนติดลบ ต้องได้ 400 ข้อความเดียวกับที่หน้าเว็บตรวจ")
    void invalidSupplyBodiesAreRejected() throws Exception {
        createSupply("""
                {"name":"  ","category":"ไฟฟ้า","stock":1,"minStock":1}""")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value("Please enter the item name"));

        createSupply("""
                {"name":"หลอดไฟ LED","category":"","stock":1,"minStock":1}""")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value("Please enter the category"));

        createSupply("""
                {"name":"หลอดไฟ LED","category":"ไฟฟ้า","stock":-1,"minStock":1}""")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value("Quantity cannot be negative"));

        createSupply("""
                {"name":"หลอดไฟ LED","category":"ไฟฟ้า","stock":1,"minStock":-2}""")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value("Minimum stock cannot be negative"));
    }

    @Test
    @DisplayName("US-17 รหัส SKU ซ้ำต้องได้ 409 พร้อมข้อความไทย และของเดิมต้องไม่ถูกแตะ")
    void duplicateSkuIsRejected() throws Exception {
        createSupply("""
                {"name":"หลอดไฟ LED","sku":"SP-DUP-01","category":"ไฟฟ้า","stock":4,"minStock":2}""")
                .andExpect(status().isCreated());

        createSupply("""
                {"name":"หลอดไฟอีกกล่อง","sku":"SP-DUP-01","category":"ไฟฟ้า","stock":9,"minStock":2}""")
                .andExpect(status().isConflict())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.detail").value("An item with this SKU already exists"));

        mockMvc.perform(get("/api/supplies"))
                .andExpect(jsonPath("$").value(hasSize(1)))
                .andExpect(jsonPath("$[0].stock").value(4));
    }

    @Test
    @DisplayName("US-17 ของที่ไม่มีรหัส SKU เพิ่มได้หลายชิ้น เพราะค่าว่างไม่นับว่าซ้ำกัน")
    void itemsWithoutSkuDoNotCollide() throws Exception {
        createSupply("""
                {"name":"เทปพันสายไฟ","category":"ไฟฟ้า","stock":10,"minStock":2}""")
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.sku").value(nullValue()));

        // ส่งมาเป็นช่องว่างล้วนถือว่าไม่ได้กรอก ต้องไม่ไปชนกับใบข้างบน
        createSupply("""
                {"name":"น้ำยาล้างแอร์","sku":"   ","category":"แอร์","stock":6,"minStock":1}""")
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.sku").value(nullValue()));

        mockMvc.perform(get("/api/supplies"))
                .andExpect(jsonPath("$").value(hasSize(2)));
    }

    @Test
    @DisplayName("US-17 แก้ของโดยไม่เปลี่ยนรหัส SKU ต้องได้ 200 ไม่ใช่ฟ้องว่าซ้ำกับตัวเอง")
    void updatingWithoutChangingTheSkuIsAllowed() throws Exception {
        long id = createdSupplyId("""
                {"name":"หลอดไฟ LED","sku":"SP-EDIT-01","category":"ไฟฟ้า","stock":4,"minStock":2}""");

        updateSupply(id, """
                {"name":"หลอดไฟ LED 9 วัตต์","sku":"SP-EDIT-01","category":"ไฟฟ้า","stock":4,"minStock":6}""")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("หลอดไฟ LED 9 วัตต์"))
                .andExpect(jsonPath("$.status").value("LOW_STOCK"));
    }

    @Test
    @DisplayName("เติมของให้ชิ้นที่ไม่มีต้องได้ 404 ที่บอกว่าไม่พบอุปกรณ์ id ไหน")
    void restockingAnUnknownItemIsNotFound() throws Exception {
        restock(999L, """
                {"quantity":5}""")
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.detail").value("No supply with id 999"));
    }

    private ResultActions createSupply(String body) throws Exception {
        return mockMvc.perform(post("/api/supplies")
                .contentType(MediaType.APPLICATION_JSON)
                .content(body));
    }

    private ResultActions updateSupply(long id, String body) throws Exception {
        return mockMvc.perform(put("/api/supplies/{id}", id)
                .contentType(MediaType.APPLICATION_JSON)
                .content(body));
    }

    private ResultActions restock(long id, String body) throws Exception {
        return mockMvc.perform(post("/api/supplies/{id}/restock", id)
                .contentType(MediaType.APPLICATION_JSON)
                .content(body));
    }

    /** อ่าน id จาก response เพราะ sequence ไม่ได้ถูกรีเซ็ตระหว่างเทส */
    private long createdSupplyId(String body) throws Exception {
        String json = createSupply(body)
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return ((Number) JsonPath.read(json, "$.id")).longValue();
    }
}
