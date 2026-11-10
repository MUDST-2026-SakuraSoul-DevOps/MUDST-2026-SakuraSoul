package com.sakurasoul.apartment.lease;

import com.jayway.jsonpath.JsonPath;
import com.sakurasoul.apartment.TestcontainersConfiguration;
import com.sakurasoul.apartment.billing.ReceiptRepository;
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
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.DockerClientFactory;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * เทส golden ของ SSK-180 "สัญญาเก่าต้องไม่เปลี่ยนเมื่อมีการเปลี่ยนแปลงใหม่" ยิงผ่าน HTTP ถึง PostgreSQL ตัวจริง
 * <p>
 * ทำสัญญาแล้วเก็บข้อความใน PDF ไว้ เปลี่ยนเลขห้องกับข้อมูลผู้เช่าทีหลัง แล้วดึง PDF ใบเดิมอีกรอบ
 * ต้องได้ข้อความเท่าเดิมทุกตัวอักษร (เกณฑ์ตรวจในการ์ด SSK-180 และคอมเมนต์ใน SSK-160 ที่ให้ลองเปลี่ยน 101 เป็น A101)
 * <p>
 * เปลี่ยนเลขห้องด้วย SQL ตรง ๆ เพราะยังไม่มี API เปลี่ยนเลขห้อง ที่ทดสอบคือ "ห้องเปลี่ยนไปแล้วด้วยวิธีไหนก็ตาม
 * เอกสารเก่าต้องไม่ตาม" ใช้ห้อง 111 (id 11 จาก V2) เพราะไม่มีเทสคลาสอื่นใช้ และคืนเลขเดิมทุกครั้งใน @AfterEach
 * <p>
 * PDF มีวันที่ออกเอกสารเป็นวันนี้ ทั้งสองรอบจึงต้อง render ในเทสเดียวกัน (ข้ามเที่ยงคืนพอดีเท่านั้นที่จะต่าง)
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
@EnabledIf("dockerAvailable")
@WithMockUser
class LeaseSnapshotApiTest {

    /** ห้อง 111 มาจาก migration V2 ห้ามลบ เปลี่ยนเลขได้ชั่วคราวในเทสแล้วต้องคืน */
    private static final long ROOM_111 = 11L;

    /** อัตราส่งมาครบทุกตัว PDF จะได้ไม่ขึ้นกับอัตราของตึกที่เทสคลาสอื่นอาจแก้ค้างไว้ */
    private static final String LEASE_BODY = """
            {"roomId":%d,"tenantId":%d,"startDate":"2026-09-01","endDate":null,\
            "billingCycle":"MONTHLY","securityDeposit":7000,\
            "electricRatePerUnit":9.5,"waterRatePerUnit":20,\
            "commonAreaFee":350,"internetFee":0}""";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JdbcTemplate jdbc;

    @Autowired
    private ReceiptRepository receiptRepository;

    @Autowired
    private LeaseRepository leaseRepository;

    @Autowired
    private TenantRepository tenantRepository;

    private final List<Tenant> createdTenants = new ArrayList<>();
    private Tenant manee;
    private long leaseId;

    static boolean dockerAvailable() {
        return DockerClientFactory.instance().isDockerAvailable();
    }

    /** เลขบัตรขึ้นต้นด้วย 18 ไม่ชนกับเทสคลาสอื่นที่ใช้ container เดียวกัน (tenant_national_id_uk ใน V6) */
    @BeforeEach
    void createTenantAndLease() throws Exception {
        manee = tenant("มานี มีนา", "1800000000001", "083-180-0001", "manee.m");
        String json = mockMvc.perform(post("/api/leases")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(LEASE_BODY.formatted(ROOM_111, manee.getId())))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        leaseId = ((Number) JsonPath.read(json, "$.id")).longValue();
    }

    /** คืนเลขห้องก่อน แล้วลบใบเสร็จ สัญญา ผู้เช่า ตามลำดับ foreign key */
    @AfterEach
    void restoreRoomAndClear() {
        jdbc.update("UPDATE room SET room_number = '111' WHERE id = ?", ROOM_111);
        receiptRepository.deleteAll();
        leaseRepository.deleteAll();
        tenantRepository.deleteAll(createdTenants);
    }

    @Test
    @DisplayName("SSK-180 เปลี่ยนเลขห้องและแก้ชื่อกับเบอร์ผู้เช่าทีหลัง PDF สัญญาเดิมต้องได้ข้อความเท่าเดิมทุกตัวอักษร")
    void contractPdfStaysTheSameAfterTheRoomAndTenantChange() throws Exception {
        String before = contractText();
        assertThat(before).contains("111", "มานี มีนา", "1800000000001", "083-180-0001", "manee.m");

        jdbc.update("UPDATE room SET room_number = 'A111' WHERE id = ?", ROOM_111);
        manee.setFullName("มานี เปลี่ยนชื่อ");
        manee.setPhone("099-999-9999");
        manee.setLineId("manee.new");
        tenantRepository.saveAndFlush(manee);

        String after = contractText();

        assertThat(after).isEqualTo(before);
        assertThat(after).doesNotContain("A111", "เปลี่ยนชื่อ", "099-999-9999", "manee.new");
    }

    /*
     * หน้าเว็บอ่าน roomNumber ชั้น ชนิดห้อง ของสัญญาจากสำเนา ส่วนห้องเองโชว์เลขปัจจุบัน
     * ใบเสร็จที่ออกหลังเปลี่ยนเลขก็ยังเป็นห้องตามสัญญา เพราะ PDF ใบเสร็จกับอีเมลอ่านจาก ReceiptResponse ตัวเดียวกัน
     */
    @Test
    @DisplayName("SSK-180 ห้องเปลี่ยนเลขแล้ว รายการสัญญากับใบเสร็จยังเป็นห้องตามวันเซ็น ส่วนหน้าห้องเป็นเลขใหม่")
    void leaseListAndReceiptsKeepTheRoomFromTheSnapshot() throws Exception {
        jdbc.update("UPDATE room SET room_number = 'A111' WHERE id = ?", ROOM_111);
        manee.setFullName("มานี เปลี่ยนชื่อ");
        tenantRepository.saveAndFlush(manee);

        mockMvc.perform(get("/api/leases").param("roomId", String.valueOf(ROOM_111)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].roomNumber").value("111"))
                .andExpect(jsonPath("$[0].floor").value(1))
                .andExpect(jsonPath("$[0].roomType").value("SINGLE"))
                // ชื่อในรายการเป็นชื่อปัจจุบัน สำเนาผู้เช่ามีไว้ให้เอกสารสัญญาอย่างเดียว
                .andExpect(jsonPath("$[0].tenantName").value("มานี เปลี่ยนชื่อ"));

        mockMvc.perform(get("/api/rooms/{id}", ROOM_111))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.roomNumber").value("A111"));

        mockMvc.perform(post("/api/receipts")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"leaseId":%d,"billingMonth":"2026-09","electricUnits":120,"waterUnits":15}"""
                                .formatted(leaseId)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.roomNumber").value("111"));
    }

    @Test
    @DisplayName("SSK-180 แก้สัญญาโดยผู้เช่าคนเดิมหลังชื่อในตาราง tenant เปลี่ยน PDF ยังพิมพ์ชื่อตามวันเซ็น")
    void updatingWithTheSameTenantKeepsTheSignedName() throws Exception {
        manee.setFullName("มานี เปลี่ยนชื่อ");
        tenantRepository.saveAndFlush(manee);

        mockMvc.perform(put("/api/leases/{id}", leaseId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(updateBody(manee.getId(), "\"2027-08-31\"")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.endDate").value("2027-08-31"));

        assertThat(contractText()).contains("มานี มีนา").doesNotContain("เปลี่ยนชื่อ");
    }

    /*
     * เปลี่ยนผู้เช่าในสัญญาเป็นอีกคนคือการแก้ที่กรอกผิดคนตอนเซ็น เอกสารต้องพิมพ์ชื่อคนที่ถูก
     */
    @Test
    @DisplayName("SSK-180 แก้สัญญาเปลี่ยนเป็นผู้เช่าอีกคน PDF ต้องพิมพ์ข้อมูลของคนใหม่")
    void updatingToAnotherTenantPrintsTheNewTenant() throws Exception {
        Tenant somsri = tenant("สมศรี ถูกคน", "1800000000002", "083-180-0002", null);

        mockMvc.perform(put("/api/leases/{id}", leaseId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(updateBody(somsri.getId(), "null")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.tenantName").value("สมศรี ถูกคน"));

        assertThat(contractText())
                .contains("สมศรี ถูกคน", "1800000000002", "083-180-0002")
                .doesNotContain("มานี มีนา", "1800000000001");
    }

    private Tenant tenant(String fullName, String nationalId, String phone, String lineId) {
        Tenant tenant = tenantRepository.saveAndFlush(new Tenant(fullName, nationalId, lineId, phone, null));
        createdTenants.add(tenant);
        return tenant;
    }

    /** body ของการแก้สัญญาแบบที่ฟอร์มส่ง ไม่มีช่องเงิน จึงไม่ไปชนกฎล็อกเงื่อนไขการเงิน */
    private static String updateBody(long tenantId, String endDate) {
        return """
                {"roomId":%d,"tenantId":%d,"startDate":"2026-09-01","endDate":%s,"billingCycle":"MONTHLY"}"""
                .formatted(ROOM_111, tenantId, endDate);
    }

    private String contractText() throws Exception {
        byte[] pdf = mockMvc.perform(get("/api/leases/{id}/contract.pdf", leaseId))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsByteArray();
        assertThat(new String(pdf, 0, 4, StandardCharsets.ISO_8859_1)).isEqualTo("%PDF");
        try (PDDocument document = PDDocument.load(pdf)) {
            return new PDFTextStripper().getText(document);
        }
    }
}
