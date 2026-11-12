package com.sakurasoul.apartment.extracharge;

import com.jayway.jsonpath.JsonPath;
import com.sakurasoul.apartment.TestcontainersConfiguration;
import com.sakurasoul.apartment.buildingconfig.BuildingConfigDtos.BuildingConfigRequest;
import com.sakurasoul.apartment.buildingconfig.BuildingConfigService;
import com.sakurasoul.apartment.room.Room;
import com.sakurasoul.apartment.room.RoomRepository;
import com.sakurasoul.apartment.tenant.Tenant;
import com.sakurasoul.apartment.tenant.TenantRepository;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIf;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.ResultMatcher;
import org.testcontainers.DockerClientFactory;

import java.math.BigDecimal;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.anonymous;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * ค่าใช้จ่ายพิเศษต่อห้อง (SSK-165) ยิงผ่าน HTTP ถึง PostgreSQL ตัวจริง ตามสี่ข้อที่สัญญา API ขอ
 * คือ endpoint ของห้อง การคัดลอกลงสัญญา บรรทัดในบิล และ PDF ใบเสร็จ
 * <p>
 * ใช้ห้อง 109 (id 9) กับห้อง 106 (id 6) จาก V2 เพราะไม่มีเทสคลาสอื่นทำสัญญาในสองห้องนี้ และล้างทุกอย่างของสองห้องนี้
 * ทุกเทส รายการที่ค้างไว้จะติดไปกับสัญญาใหม่ของห้องนั้น บิลของเดือนในอนาคตออกไม่ได้ เทสที่ออกบิลจึงใช้ปี 2025
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
@EnabledIf("dockerAvailable")
@WithMockUser
class ExtraChargeApiTest {

    /** ห้อง 109 กับ 106 มาจาก migration V2 ห้ามลบ */
    private static final long ROOM_109 = 9L;
    private static final long ROOM_106 = 6L;

    /** body ที่ฟอร์มสร้างสัญญาส่งจริง ห้อง 109 เป็น SINGLE ค่าเช่า 3,500 ตามชนิดห้อง */
    private static final String LEASE_BODY = """
            {"roomId":%d,"tenantId":%d,"startDate":"%s","endDate":"%s","monthlyRent":1,\
            "billingCycle":"MONTHLY","securityDeposit":7000,\
            "electricRatePerUnit":8,"waterRatePerUnit":18,"commonAreaFee":300,"internetFee":250}""";

    /**
     * ยอดห้าบรรทัดมาตรฐานของบิลที่ issueReceipt ออก ไฟ 100 หน่วย น้ำ 10 หน่วย
     * 3,500 ค่าเช่า + 300 ส่วนกลาง + 250 อินเทอร์เน็ต + 800 ค่าไฟ + 180 ค่าน้ำ
     */
    private static final double STANDARD_TOTAL = 5030.0;

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

    /** เลขบัตรขึ้นต้นด้วย 22 ไม่ชนกับเทสคลาสอื่นที่ใช้ container เดียวกัน (tenant_national_id_uk ใน V6) */
    @BeforeEach
    void createTenant() {
        tenant = tenantRepository.saveAndFlush(
                new Tenant("จอดรถ ค่าใช้จ่ายพิเศษ", "2200000000001", null, "082-165-0001", null));
    }

    /** ลบตามลำดับ foreign key ของห้อง 109 กับ 106 เท่านั้น ข้อมูลของเทสคลาสอื่นไม่ถูกแตะ */
    @AfterEach
    void clearRooms() {
        String leases = "SELECT id FROM lease WHERE room_id IN (6, 9)";
        jdbc.update("DELETE FROM payment_allocation WHERE lease_id IN (" + leases + ")");
        jdbc.update("DELETE FROM payment WHERE lease_id IN (" + leases + ")");
        jdbc.update("DELETE FROM receipt_line WHERE lease_id IN (" + leases + ")");
        jdbc.update("DELETE FROM receipt WHERE lease_id IN (" + leases + ")");
        jdbc.update("DELETE FROM lease_extra_charge WHERE lease_id IN (" + leases + ")");
        jdbc.update("DELETE FROM lease WHERE room_id IN (6, 9)");
        jdbc.update("DELETE FROM room_extra_charge WHERE room_id IN (6, 9)");
        tenantRepository.delete(tenant);
    }

    @Test
    @DisplayName("SSK-165 เพิ่ม อ่าน แก้ ลบรายการของห้อง ทุกห้องเรียงตามผังตึก ชื่อถูกตัดช่องว่าง ค่าครั้งเดียวไม่มีเดือนสุดท้าย")
    void roomChargesCanBeAddedListedEditedAndDeleted() throws Exception {
        long parking = addCharge(ROOM_109, "  Parking space  ", 500, "MONTHLY", "2025-01", "\"\"")
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.roomId").value(ROOM_109))
                .andExpect(jsonPath("$.label").value("Parking space"))
                .andExpect(jsonPath("$.amount").value(500.0))
                .andExpect(jsonPath("$.recurrence").value("MONTHLY"))
                .andExpect(jsonPath("$.startMonth").value("2025-01"))
                .andExpect(jsonPath("$.endMonth").value(nullValue()))
                .andExpect(jsonPath("$.active").value(true))
                .andReturnId();
        long keyCard = addCharge(ROOM_109, "Key card", 200, "ONE_TIME", "2025-01", "\"2025-06\"")
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.endMonth").value(nullValue()))
                .andReturnId();
        long fan = addCharge(ROOM_106, "Fan rental", 150, "MONTHLY", "2025-03", "\"2025-09\"")
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.endMonth").value("2025-09"))
                .andReturnId();

        mockMvc.perform(get("/api/rooms/{id}/extra-charges", ROOM_109))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[*].id", contains((int) parking, (int) keyCard)));
        // ห้อง 106 มาก่อนห้อง 109 ตามผังตึก ถึงรายการของห้อง 109 จะถูกเพิ่มก่อนก็ตาม
        mockMvc.perform(get("/api/extra-charges"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[*].id", contains((int) fan, (int) parking, (int) keyCard)));

        // ปิดรายการพร้อมแก้ชื่อกับยอด แล้วแก้อีกรอบโดยไม่ส่ง active สถานะต้องคงปิดไว้ ไม่เปิดกลับมาเก็บเงินเอง
        mockMvc.perform(put("/api/rooms/{id}/extra-charges/{chargeId}", ROOM_109, parking)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(chargeBody("Parking B", 650, "MONTHLY", "2025-02", "\"2025-12\"", "false")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.label").value("Parking B"))
                .andExpect(jsonPath("$.amount").value(650.0))
                .andExpect(jsonPath("$.endMonth").value("2025-12"))
                .andExpect(jsonPath("$.active").value(false));
        mockMvc.perform(put("/api/rooms/{id}/extra-charges/{chargeId}", ROOM_109, parking)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(chargeBody("Parking C", 650, "MONTHLY", "2025-02", "null", null)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.label").value("Parking C"))
                .andExpect(jsonPath("$.active").value(false));

        mockMvc.perform(delete("/api/rooms/{id}/extra-charges/{chargeId}", ROOM_109, keyCard))
                .andExpect(status().isNoContent());
        mockMvc.perform(delete("/api/rooms/{id}/extra-charges/{chargeId}", ROOM_109, keyCard))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.detail").value("No extra charge with id " + keyCard + " for unit 109"));
        mockMvc.perform(get("/api/rooms/{id}/extra-charges", ROOM_109))
                .andExpect(jsonPath("$[*].id", contains((int) parking)));
    }

    @Test
    @DisplayName("SSK-165 ค่าที่ผิดได้ 400 ข้อความตรงกับหน้าเว็บ ห้องที่ไม่มีหรือรายการของห้องอื่นได้ 404 ก่อนตรวจค่า")
    void invalidInputAndUnknownIds() throws Exception {
        addCharge(ROOM_109, " ", 500, "MONTHLY", "2025-01", "null")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value("Please describe the charge"));
        addCharge(ROOM_109, "Parking", -1, "MONTHLY", "2025-01", "null")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value("Amount cannot be negative"));
        addCharge(ROOM_109, "Parking", 500, "WEEKLY", "2025-01", "null")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value("Frequency must be ONE_TIME or MONTHLY"));
        addCharge(ROOM_109, "Parking", 500, "MONTHLY", "2025-1", "null")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value("Please choose the first month to charge (YYYY-MM)"));
        addCharge(ROOM_109, "Parking", 500, "MONTHLY", "2025-05", "\"2025-04\"")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value("The last month cannot be before the first month"));
        // ยอดที่เป็นข้อความผ่านตัวอ่าน JSON กลางของทั้งระบบ ไม่ใช่ตัวเลขได้ข้อความของตัวอ่าน สตริงตัวเลขรับได้
        // หน้าเว็บส่งยอดเป็นตัวเลขเสมอ สองกรณีนี้จึงมาจากที่อื่นเท่านั้น (ดูจุดที่ต่างในเอกสาร)
        postRawCharge("{\"label\":\"Parking\",\"amount\":\"abc\",\"recurrence\":\"MONTHLY\",\"startMonth\":\"2025-01\"}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value("The amount field must be a number"));
        postRawCharge("{\"label\":\"Parking\",\"amount\":\"500\",\"recurrence\":\"MONTHLY\",\"startMonth\":\"2025-01\"}")
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.amount").value(500.0));

        // ห้องที่ไม่มีได้ 404 ก่อนตรวจค่า ถึง body จะผิดด้วยก็ตาม ลำดับเดียวกับ backend จำลอง
        addCharge(9999L, " ", -1, "WEEKLY", "x", "null")
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.detail").value("No unit with id 9999"));
        mockMvc.perform(get("/api/rooms/{id}/extra-charges", 9999L))
                .andExpect(status().isNotFound());

        // id ของรายการห้อง 109 ที่ส่งมาทางห้อง 106 ต้องหาไม่เจอ ไม่ใช่ไปแก้หรือลบของห้องอื่น
        long parking = addCharge(ROOM_109, "Parking", 500, "MONTHLY", "2025-01", "null")
                .andExpect(status().isCreated())
                .andReturnId();
        mockMvc.perform(put("/api/rooms/{id}/extra-charges/{chargeId}", ROOM_106, parking)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(chargeBody(" ", -1, "WEEKLY", "x", "null", null)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.detail").value("No extra charge with id " + parking + " for unit 106"));
        mockMvc.perform(delete("/api/rooms/{id}/extra-charges/{chargeId}", ROOM_106, parking))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("SSK-165 สัญญาใหม่คัดลอกเฉพาะรายการที่เปิดอยู่ รายการที่เพิ่มทีหลังไม่ติดไป และรายการที่อยู่ในสัญญาแล้วลบไม่ได้")
    void aLeaseCopiesTheActiveChargesAndKeepsThemFromBeingDeleted() throws Exception {
        long parking = addCharge(ROOM_109, "Parking space", 500, "MONTHLY", "2025-01", "null")
                .andExpect(status().isCreated()).andReturnId();
        addCharge(ROOM_109, "Old locker", 100, "MONTHLY", "2025-01", "null", "false")
                .andExpect(status().isCreated());
        long keyCard = addCharge(ROOM_109, "Key card", 200, "ONE_TIME", "2025-01", "null")
                .andExpect(status().isCreated()).andReturnId();

        String lease = signLease("2025-01-01", "2025-12-31")
                .andExpect(jsonPath("$.extraCharges.length()").value(2))
                .andExpect(jsonPath("$.extraCharges[0].chargeId").value(parking))
                .andExpect(jsonPath("$.extraCharges[0].label").value("Parking space"))
                .andExpect(jsonPath("$.extraCharges[0].amount").value(500.0))
                .andExpect(jsonPath("$.extraCharges[0].recurrence").value("MONTHLY"))
                .andExpect(jsonPath("$.extraCharges[0].startMonth").value("2025-01"))
                .andExpect(jsonPath("$.extraCharges[0].endMonth").value(nullValue()))
                .andExpect(jsonPath("$.extraCharges[0].active").value(true))
                .andExpect(jsonPath("$.extraCharges[1].chargeId").value(keyCard))
                .andReturn().getResponse().getContentAsString();
        long leaseId = ((Number) JsonPath.read(lease, "$.id")).longValue();

        long storage = addCharge(ROOM_109, "Storage", 300, "MONTHLY", "2025-01", "null")
                .andExpect(status().isCreated()).andReturnId();
        // แก้ชื่อกับยอดที่ห้อง สำเนาในสัญญาคงค่าวันเซ็น ส่วน active ตามรายการต้นทาง
        mockMvc.perform(put("/api/rooms/{id}/extra-charges/{chargeId}", ROOM_109, parking)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(chargeBody("Parking B", 800, "MONTHLY", "2025-01", "null", "false")))
                .andExpect(status().isOk());

        String agreed = "$[?(@.id == " + leaseId + ")].extraCharges[0]";
        mockMvc.perform(get("/api/leases").param("roomId", String.valueOf(ROOM_109)))
                .andExpect(jsonPath("$[?(@.id == " + leaseId + ")].extraCharges[*].chargeId",
                        contains((int) parking, (int) keyCard)))
                .andExpect(jsonPath(agreed + ".label").value("Parking space"))
                .andExpect(jsonPath(agreed + ".amount").value(500.0))
                .andExpect(jsonPath(agreed + ".active").value(false));

        mockMvc.perform(delete("/api/rooms/{id}/extra-charges/{chargeId}", ROOM_109, parking))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.detail")
                        .value("\"Parking B\" is part of a contract or bill. Deactivate it instead."));
        mockMvc.perform(delete("/api/rooms/{id}/extra-charges/{chargeId}", ROOM_109, storage))
                .andExpect(status().isNoContent());
    }

    /**
     * จ่ายแต่ละบิลก่อนออกบิลถัดไป บิลจึงไม่มียอดยกมา (SSK-164) และเห็นเฉพาะบรรทัดของเดือนนั้น
     * การแก้ใบทำได้เฉพาะใบล่าสุดที่ยังไม่มีการชำระ (SSK-163) จึงย้ายเดือนของใบล่าสุดไปแล้วย้ายกลับก่อนรับชำระ
     */
    @Test
    @DisplayName("SSK-165 บิลเก็บรายเดือนตามช่วง ค่าครั้งเดียวครั้งเดียว ปิดแล้วหยุดเก็บ บิลเก่าไม่เปลี่ยน แก้บิลแล้วบรรทัดยังอยู่")
    void billsChargeWhatTheLeaseAgreedTo() throws Exception {
        long parking = addCharge(ROOM_109, "Parking space", 500, "MONTHLY", "2025-01", "null")
                .andExpect(status().isCreated()).andReturnId();
        long keyCard = addCharge(ROOM_109, "Key card", 200, "ONE_TIME", "2025-01", "null")
                .andExpect(status().isCreated()).andReturnId();
        addCharge(ROOM_109, "Locker", 100, "MONTHLY", "2025-01", "\"2025-02\"")
                .andExpect(status().isCreated());
        long leaseId = createLease();

        long january = issueReceipt(leaseId, "2025-01")
                .andExpect(jsonPath("$.items.length()").value(8))
                .andExpect(jsonPath("$.items[0].chargeId").value(nullValue()))
                .andExpect(jsonPath("$.items[5].item").value("Parking space"))
                .andExpect(jsonPath("$.items[5].detail").value("Monthly"))
                .andExpect(jsonPath("$.items[5].amount").value(500.0))
                .andExpect(jsonPath("$.items[5].chargeId").value(parking))
                .andExpect(jsonPath("$.items[6].item").value("Key card"))
                .andExpect(jsonPath("$.items[6].detail").value("One-time"))
                .andExpect(jsonPath("$.items[6].chargeId").value(keyCard))
                .andExpect(jsonPath("$.items[7].item").value("Locker"))
                .andExpect(jsonPath("$.totalAmount").value(STANDARD_TOTAL + 500 + 200 + 100))
                .andReturnId();
        payInFull(january);
        // ค่าครั้งเดียวเก็บไปแล้ว ค่าล็อกเกอร์ยังไม่หมดช่วง
        long february = issueReceipt(leaseId, "2025-02")
                .andExpect(jsonPath("$.items[5:].item", contains("Parking space", "Locker")))
                .andExpect(jsonPath("$.totalAmount").value(STANDARD_TOTAL + 500 + 100))
                .andReturnId();

        // เปลี่ยนเดือนของบิลไม่คิดบรรทัดใหม่ เหมือน backend จำลอง ใบ ก.พ. ย้ายไป มิ.ย. ยังมีล็อกเกอร์ที่หมดช่วงไปแล้ว
        moveReceipt(february, "2025-06")
                .andExpect(jsonPath("$.items[5:].item", contains("Parking space", "Locker")))
                .andExpect(jsonPath("$.totalAmount").value(STANDARD_TOTAL + 500 + 100));
        moveReceipt(february, "2025-02");
        payInFull(february);

        // ปิดที่จอดรถ บิลใหม่หยุดเก็บ ส่วนบิลเดือน ม.ค. ที่ออกไปแล้วยังมีบรรทัดเดิมครบ
        setActive(parking, "Parking space", false);
        long march = issueReceipt(leaseId, "2025-03")
                .andExpect(jsonPath("$.items.length()").value(5))
                .andExpect(jsonPath("$.totalAmount").value(STANDARD_TOTAL))
                .andReturnId();
        mockMvc.perform(get("/api/receipts/{id}", january))
                .andExpect(jsonPath("$.items.length()").value(8))
                .andExpect(jsonPath("$.totalAmount").value(STANDARD_TOTAL + 800));

        // เปิดกลับมาก็เก็บต่อ ชื่อกับยอดตามที่ตกลงในสัญญา ไม่ใช่ชื่อใหม่ที่เพิ่งแก้ที่ห้อง
        mockMvc.perform(put("/api/rooms/{id}/extra-charges/{chargeId}", ROOM_109, parking)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(chargeBody("Parking B", 800, "MONTHLY", "2025-01", "null", "true")))
                .andExpect(status().isOk());
        // ใบ มี.ค. ที่ไม่มีบรรทัดย้ายไป พ.ค. ก็ไม่ได้ที่จอดรถเพิ่ม ทั้งที่ พ.ค. ถึงรอบ
        moveReceipt(march, "2025-05")
                .andExpect(jsonPath("$.items.length()").value(5))
                .andExpect(jsonPath("$.totalAmount").value(STANDARD_TOTAL));
        moveReceipt(march, "2025-03");
        payInFull(march);
        long april = issueReceipt(leaseId, "2025-04")
                .andExpect(jsonPath("$.items[5:].item", contains("Parking space")))
                .andExpect(jsonPath("$.totalAmount").value(STANDARD_TOTAL + 500))
                .andReturnId();

        // แก้หน่วยของบิล (SSK-155) บรรทัดค่าใช้จ่ายพิเศษยังอยู่และยังรวมในยอด ไฟ 200 หน่วยเพิ่มค่าไฟ 800
        mockMvc.perform(put("/api/receipts/{id}", april)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"billingMonth\":\"2025-04\",\"electricUnits\":200,\"waterUnits\":10}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[5].item").value("Parking space"))
                .andExpect(jsonPath("$.totalAmount").value(STANDARD_TOTAL + 800 + 500));

        // รายการใบเสร็จกับการส่งอีเมลโหลดบรรทัดผ่านเส้นทางของตัวเอง ต้องได้ครบเหมือนอ่านทีละใบ
        // ผู้เช่าของเทสนี้ไม่มีอีเมล การส่งจึงข้ามใบนี้ แต่ต้องประกอบใบได้ก่อนตัดสินว่าข้าม
        mockMvc.perform(get("/api/receipts").param("leaseId", String.valueOf(leaseId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.id == " + january + ")].items[*].item", contains("Room rent",
                        "Common area fee", "Internet", "Electricity", "Water", "Parking space", "Key card", "Locker")));
        mockMvc.perform(post("/api/receipts/send")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"receiptIds\":[" + january + "]}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.skipped[0].receiptId").value(january))
                .andExpect(jsonPath("$.skipped[0].reason").value("NO_EMAIL"));

        String json = mockMvc.perform(get("/api/receipts/{id}", january))
                .andReturn().getResponse().getContentAsString();
        assertThat(json).as("บรรทัดมาตรฐานส่ง chargeId เป็น null ไม่ใช่ไม่ส่ง").contains("\"chargeId\":null");
    }

    /**
     * ค่าครั้งเดียวนับต่อสัญญา ไม่ใช่ต่อห้อง ผู้เช่าคนถัดไปของห้องเดิมต้องโดนเก็บของตัวเองอีกครั้ง
     * <p>
     * unique index ที่กันเก็บซ้ำในสัญญาเดียวกันต้องมีอยู่จริงในชื่อที่ ReceiptService ใช้ตัดสินว่าชนแล้วลองออกใหม่
     * เทสระดับ service ปลอมข้อความ error เอง ถ้าชื่อในฐานข้อมูลเปลี่ยน ที่นี่ต้องพัง
     */
    @Test
    @DisplayName("SSK-165 ค่าครั้งเดียวเก็บครั้งเดียวต่อสัญญา ฐานข้อมูลกันเก็บซ้ำ และสัญญาใหม่ของห้องเดิมเก็บอีกครั้ง")
    void aOneTimeChargeIsBilledOncePerLease() throws Exception {
        long keyCard = addCharge(ROOM_109, "Key card", 200, "ONE_TIME", "2025-01", "null")
                .andExpect(status().isCreated()).andReturnId();
        long first = createLease("2025-01-01", "2025-03-31");
        long january = issueReceipt(first, "2025-01")
                .andExpect(jsonPath("$.items[5:].item", contains("Key card")))
                .andReturnId();
        // จ่ายก่อนออกใบถัดไป ใบ ก.พ. จึงไม่มียอดยกมา (SSK-164) เหลือห้าบรรทัดมาตรฐานพอดี
        payInFull(january);
        long february = issueReceipt(first, "2025-02")
                .andExpect(jsonPath("$.items.length()").value(5))
                .andReturnId();

        assertThatThrownBy(() -> jdbc.update("""
                INSERT INTO receipt_line (receipt_id, lease_id, charge_id, label, recurrence, amount)
                VALUES (?, ?, ?, 'Key card', 'ONE_TIME', 200)""", february, first, keyCard))
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("receipt_line_one_time_uk");

        long second = createLease("2025-04-01", "2025-12-31");
        issueReceipt(second, "2025-04")
                .andExpect(jsonPath("$.items[5:].item", contains("Key card")))
                .andExpect(jsonPath("$.totalAmount").value(STANDARD_TOTAL + 200));
    }

    @Test
    @DisplayName("SSK-165 PDF ใบเสร็จมีบรรทัดค่าใช้จ่ายพิเศษกับยอดรวมที่นับบรรทัดนั้นแล้ว")
    void theReceiptPdfShowsTheExtraCharges() throws Exception {
        addCharge(ROOM_109, "Parking space", 500, "MONTHLY", "2025-01", "null")
                .andExpect(status().isCreated());
        long receipt = issueReceipt(createLease(), "2025-01").andReturnId();

        byte[] pdf = mockMvc.perform(get("/api/receipts/{id}/pdf", receipt))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsByteArray();

        try (PDDocument document = PDDocument.load(pdf)) {
            assertThat(new PDFTextStripper().getText(document))
                    .contains("Parking space")
                    .contains("5,530.00");
        }
    }

    @Test
    @DisplayName("SSK-165 รายการเป็นค่าตั้งของห้อง ลบห้องหรือลดผังตึกแล้วรายการหายไปด้วย ไม่ได้ 409")
    void deletingUnitsDeletesTheirCharges() throws Exception {
        try {
            buildingConfigService.update(new BuildingConfigRequest(
                    BigDecimal.valueOf(3), BigDecimal.valueOf(12), "SINGLE"));
            long room301 = roomId("301");
            long room302 = roomId("302");
            addCharge(room301, "Parking", 500, "MONTHLY", "2025-01", "null").andExpect(status().isCreated());
            addCharge(room302, "Parking", 500, "MONTHLY", "2025-01", "null").andExpect(status().isCreated());

            mockMvc.perform(delete("/api/rooms/{id}", room302)).andExpect(status().isNoContent());
            assertThat(chargesOf(room302)).isZero();

            buildingConfigService.update(new BuildingConfigRequest(
                    BigDecimal.valueOf(2), BigDecimal.valueOf(12), "SINGLE"));
            assertThat(chargesOf(room301)).isZero();
        } finally {
            buildingConfigService.update(new BuildingConfigRequest(
                    BigDecimal.valueOf(2), BigDecimal.valueOf(12), "SINGLE"));
        }
    }

    @Test
    @DisplayName("SSK-165 ไม่ได้ล็อกอินได้ 401 ทั้งอ่านและเขียน")
    void signedOutRequestsAreRejected() throws Exception {
        mockMvc.perform(get("/api/extra-charges").with(anonymous()))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(post("/api/rooms/{id}/extra-charges", ROOM_109).with(anonymous())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isUnauthorized());
    }

    private ApiResult addCharge(long roomId, String label, double amount, String recurrence, String startMonth,
            String endMonthJson) throws Exception {
        return addCharge(roomId, label, amount, recurrence, startMonth, endMonthJson, null);
    }

    private ApiResult addCharge(long roomId, String label, double amount, String recurrence, String startMonth,
            String endMonthJson, String activeJson) throws Exception {
        return new ApiResult(mockMvc.perform(post("/api/rooms/{id}/extra-charges", roomId)
                .contentType(MediaType.APPLICATION_JSON)
                .content(chargeBody(label, amount, recurrence, startMonth, endMonthJson, activeJson))));
    }

    private ResultActions postRawCharge(String json) throws Exception {
        return mockMvc.perform(post("/api/rooms/{id}/extra-charges", ROOM_109)
                .contentType(MediaType.APPLICATION_JSON)
                .content(json));
    }

    private void setActive(long chargeId, String label, boolean active) throws Exception {
        mockMvc.perform(put("/api/rooms/{id}/extra-charges/{chargeId}", ROOM_109, chargeId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(chargeBody(label, 500, "MONTHLY", "2025-01", "null", String.valueOf(active))))
                .andExpect(status().isOk());
    }

    /** activeJson เป็น null คือไม่ส่งช่อง active มาเลย */
    private static String chargeBody(String label, double amount, String recurrence, String startMonth,
            String endMonthJson, String activeJson) {
        String active = activeJson == null ? "" : ",\"active\":" + activeJson;
        return """
                {"label":"%s","amount":%s,"recurrence":"%s","startMonth":"%s","endMonth":%s%s}"""
                .formatted(label, amount, recurrence, startMonth, endMonthJson, active);
    }

    private ResultActions signLease(String startDate, String endDate) throws Exception {
        return mockMvc.perform(post("/api/leases")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(LEASE_BODY.formatted(ROOM_109, tenant.getId(), startDate, endDate)))
                .andExpect(status().isCreated());
    }

    /** สัญญาทั้งปี 2025 ของห้อง 109 */
    private long createLease() throws Exception {
        return createLease("2025-01-01", "2025-12-31");
    }

    private long createLease(String startDate, String endDate) throws Exception {
        String json = signLease(startDate, endDate).andReturn().getResponse().getContentAsString();
        return ((Number) JsonPath.read(json, "$.id")).longValue();
    }

    /** รับชำระเต็มยอดที่เหลือ (SSK-163) ใบถัดไปของสัญญาจึงไม่มียอดยกมา */
    private void payInFull(long receiptId) throws Exception {
        mockMvc.perform(post("/api/receipts/{id}/pay", receiptId)).andExpect(status().isOk());
    }

    /** แก้เดือนของบิล (SSK-155) หน่วยเท่าเดิมกับที่ issueReceipt ออก */
    private ResultActions moveReceipt(long receiptId, String billingMonth) throws Exception {
        return mockMvc.perform(put("/api/receipts/{id}", receiptId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"billingMonth\":\"%s\",\"electricUnits\":100,\"waterUnits\":10}"
                                .formatted(billingMonth)))
                .andExpect(status().isOk());
    }

    private ApiResult issueReceipt(long leaseId, String billingMonth) throws Exception {
        return new ApiResult(mockMvc.perform(post("/api/receipts")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"leaseId":%d,"billingMonth":"%s","electricUnits":100,"waterUnits":10}"""
                                .formatted(leaseId, billingMonth)))
                .andExpect(status().isCreated()));
    }

    private long roomId(String roomNumber) {
        return roomRepository.findAllInLayoutOrder().stream()
                .filter(room -> room.getRoomNumber().equals(roomNumber))
                .map(Room::getId)
                .findFirst()
                .orElseThrow();
    }

    private int chargesOf(long roomId) {
        return jdbc.queryForObject("SELECT count(*) FROM room_extra_charge WHERE room_id = ?", Integer.class, roomId);
    }

    /** ห่อ ResultActions ให้ต่อ assertion แล้วอ่าน id ที่ได้กลับมาในประโยคเดียวได้ */
    private record ApiResult(ResultActions result) {

        ApiResult andExpect(ResultMatcher matcher) throws Exception {
            result.andExpect(matcher);
            return this;
        }

        long andReturnId() throws Exception {
            String json = result.andReturn().getResponse().getContentAsString();
            return ((Number) JsonPath.read(json, "$.id")).longValue();
        }
    }
}
