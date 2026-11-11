package com.sakurasoul.apartment.document;

import com.jayway.jsonpath.JsonPath;
import com.sakurasoul.apartment.TestcontainersConfiguration;
import com.sakurasoul.apartment.billing.BillingTables;
import com.sakurasoul.apartment.lease.LeaseRepository;
import com.sakurasoul.apartment.room.Room;
import com.sakurasoul.apartment.room.RoomRepository;
import com.sakurasoul.apartment.tenant.Tenant;
import com.sakurasoul.apartment.tenant.TenantRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIf;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockMultipartHttpServletRequestBuilder;
import org.testcontainers.DockerClientFactory;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.anonymous;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * คลังเอกสารสแกน (SSK-172) ผ่าน HTTP แบบ multipart ถึง PostgreSQL ตัวจริง ไล่ตาม AC ของการ์ด
 * <p>
 * ทุกเทสล้างสัญญา ใบเสร็จ และใบแจ้งซ่อมของตัวเองหลังจบ เอกสารกับไฟล์หายตาม ON DELETE CASCADE
 * รายการเอกสารจึงเห็นแค่เอกสารของเทสนั้น
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
@EnabledIf("dockerAvailable")
@WithMockUser(username = "admin")
class DocumentApiTest {

    private static final byte[] PDF = "%PDF-1.7\nรายงานซ่อม\n%%EOF".getBytes(StandardCharsets.UTF_8);
    private static final byte[] JPEG = {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF, (byte) 0xE0, 0, 16, 'J', 'F', 'I', 'F'};

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JdbcClient jdbc;

    @Autowired
    private LeaseRepository leaseRepository;

    @Autowired
    private TenantRepository tenantRepository;

    @Autowired
    private RoomRepository roomRepository;

    private final List<Tenant> tenants = new ArrayList<>();
    private final List<Long> tickets = new ArrayList<>();

    static boolean dockerAvailable() {
        return DockerClientFactory.instance().isDockerAvailable();
    }

    @AfterEach
    void clearData() {
        for (Long ticket : tickets) {
            jdbc.sql("DELETE FROM maintenance_ticket WHERE id = :id").param("id", ticket).update();
        }
        tickets.clear();
        List<Room> rooms = roomRepository.findAll();
        rooms.forEach(Room::releaseFromMaintenance);
        roomRepository.saveAll(rooms);
        BillingTables.clear(jdbc);
        leaseRepository.deleteAll();
        tenantRepository.deleteAll(tenants);
        tenants.clear();
    }

    @Test
    @DisplayName("SSK-172 อัปโหลดสแกนสัญญา ได้เจ้าของพร้อมห้องและผู้เช่า SHA-256 ตรงกับไฟล์ที่ดาวน์โหลดจาก contentUrl")
    void aContractScan() throws Exception {
        Tenant tenant = tenant("มานี รักเรียน");
        long lease = lease("110", tenant);

        String json = upload(file("lease-110.pdf", PDF), "CONTRACT_SCAN", "2026-11-01", " สัญญาหน้า 1-3 ",
                Map.of("leaseId", lease))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.type").value("CONTRACT_SCAN"))
                .andExpect(jsonPath("$.description").value("สัญญาหน้า 1-3"))
                .andExpect(jsonPath("$.scanDate").value("2026-11-01"))
                .andExpect(jsonPath("$.owner.kind").value("LEASE"))
                .andExpect(jsonPath("$.owner.id").value(lease))
                .andExpect(jsonPath("$.owner.roomId").value(roomId("110")))
                .andExpect(jsonPath("$.owner.roomNumber").value("110"))
                .andExpect(jsonPath("$.owner.tenantId").value(tenant.getId()))
                .andExpect(jsonPath("$.owner.tenantName").value("มานี รักเรียน"))
                .andExpect(jsonPath("$.fileName").value("lease-110.pdf"))
                .andExpect(jsonPath("$.contentType").value("application/pdf"))
                .andExpect(jsonPath("$.sizeBytes").value(PDF.length))
                .andExpect(jsonPath("$.sha256").value(sha256(PDF)))
                .andExpect(jsonPath("$.uploadedBy").value("admin"))
                .andReturn().getResponse().getContentAsString();

        long attachmentId = ((Number) JsonPath.read(json, "$.attachmentId")).longValue();
        assertThat(JsonPath.<String>read(json, "$.contentUrl")).isEqualTo("/api/attachments/" + attachmentId + "/content");
        byte[] downloaded = mockMvc.perform(get("/api/attachments/{id}/content", attachmentId))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsByteArray();
        assertThat(sha256(downloaded)).isEqualTo(sha256(PDF));
    }

    @Test
    @DisplayName("SSK-172 AC: แนบรายงานกับใบแจ้งซ่อมที่ปิดงานแล้วได้ ใบแจ้งซ่อมไม่มีผู้เช่า ใบเสร็จได้ผู้เช่าจากสัญญา")
    void ticketsAndReceipts() throws Exception {
        long ticket = ticket("112");
        mockMvc.perform(patch("/api/maintenance/{id}", ticket).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"status\":\"DONE\"}"))
                .andExpect(status().isOk());
        upload(file("aircon.pdf", PDF), "MAINTENANCE_REPORT", "2026-11-02", "รายงานซ่อมแอร์",
                Map.of("ticketId", ticket))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.owner.kind").value("MAINTENANCE_TICKET"))
                .andExpect(jsonPath("$.owner.id").value(ticket))
                .andExpect(jsonPath("$.owner.roomNumber").value("112"))
                .andExpect(jsonPath("$.owner.tenantId").value(nullValue()))
                .andExpect(jsonPath("$.owner.tenantName").value(nullValue()));

        Tenant tenant = tenant("สมชาย ใจดี");
        long receipt = issue(lease("111", tenant), "2026-08");
        upload(file("receipt.jpg", JPEG), "RECEIPT_SCAN", "2026-11-03", null, Map.of("receiptId", receipt))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.description").value(nullValue()))
                .andExpect(jsonPath("$.contentType").value("image/jpeg"))
                .andExpect(jsonPath("$.owner.kind").value("RECEIPT"))
                .andExpect(jsonPath("$.owner.roomNumber").value("111"))
                .andExpect(jsonPath("$.owner.tenantName").value("สมชาย ใจดี"));
    }

    @Test
    @DisplayName("SSK-172 ค้นตามชนิด ห้อง (ข้ามเจ้าของ) ผู้เช่า ช่วงวันที่ และคำค้น เรียงวันที่สแกนใหม่สุดก่อน")
    void searching() throws Exception {
        Tenant manee = tenant("มานี รักเรียน");
        long lease110 = lease("110", manee);
        long ticket110 = ticket("110");
        long lease111 = lease("111", tenant("Somchai Jaidee"));
        long contract = documentId(upload(file("lease-110.pdf", PDF), "CONTRACT_SCAN", "2026-10-01", "สัญญา",
                Map.of("leaseId", lease110)));
        long report = documentId(upload(file("AirCon-110.pdf", PDF), "MAINTENANCE_REPORT", "2026-11-05",
                "Fixed 50% of the units", Map.of("ticketId", ticket110)));
        long other = documentId(upload(file("other.jpg", JPEG), "CONTRACT_SCAN", "2026-11-05", null,
                Map.of("leaseId", lease111)));

        list("").andExpect(jsonPath("$[*].id").value(contains((int) other, (int) report, (int) contract)));
        list("type=CONTRACT_SCAN").andExpect(jsonPath("$[*].id").value(contains((int) other, (int) contract)));
        list("roomId=" + roomId("110")).andExpect(jsonPath("$[*].id").value(contains((int) report, (int) contract)));
        list("tenantId=" + manee.getId()).andExpect(jsonPath("$[*].id").value(contains((int) contract)));
        list("from=2026-11-05&to=2026-11-05").andExpect(jsonPath("$[*].id").value(contains((int) other, (int) report)));
        list("to=2026-10-01").andExpect(jsonPath("$[*].id").value(contains((int) contract)));
        list("q=aircon").andExpect(jsonPath("$[*].id").value(contains((int) report)));
        list("q=50%25").andExpect(jsonPath("$[*].id").value(contains((int) report)));
        list("q=5_%25").andExpect(jsonPath("$").value(hasSize(0)));
        list("q=somchai").andExpect(jsonPath("$[*].id").value(contains((int) other)));
        list("q=111").andExpect(jsonPath("$[*].id").value(contains((int) other)));
        list("roomId=999999").andExpect(status().isOk()).andExpect(jsonPath("$").value(hasSize(0)));

        list("type=Contract").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail")
                        .value("Document type must be CONTRACT_SCAN, MAINTENANCE_REPORT or RECEIPT_SCAN"));
        list("from=2026-11-06&to=2026-11-05").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value("from and to must be YYYY-MM-DD with from not after to"));
    }

    @Test
    @DisplayName("SSK-172 AC: ลบเอกสารแล้วหายจากรายการ ไฟล์เปิดไม่ได้ ลบซ้ำได้ 404 แต่ร่องรอยการลบยังอยู่")
    void deletingKeepsTheTrail() throws Exception {
        long lease = lease("110", tenant("หนึ่ง"));
        String json = upload(file("id-card.jpg", JPEG), "CONTRACT_SCAN", "2026-11-01", null, Map.of("leaseId", lease))
                .andReturn().getResponse().getContentAsString();
        long id = ((Number) JsonPath.read(json, "$.id")).longValue();
        long attachmentId = ((Number) JsonPath.read(json, "$.attachmentId")).longValue();

        mockMvc.perform(delete("/api/documents/{id}", id)).andExpect(status().isNoContent());

        list("").andExpect(jsonPath("$").value(hasSize(0)));
        mockMvc.perform(get("/api/attachments/{id}/content", attachmentId)).andExpect(status().isNotFound());
        mockMvc.perform(delete("/api/documents/{id}", id))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.detail").value("No document with id " + id));
        assertThat(jdbc.sql("SELECT deleted_by FROM attachment WHERE id = :id").param("id", attachmentId)
                .query(String.class).single()).isEqualTo("admin");
        assertThat(jdbc.sql("SELECT count(*) FROM document WHERE id = :id").param("id", id).query(Long.class)
                .single()).isEqualTo(1);
        assertThat(jdbc.sql("SELECT data FROM attachment_content WHERE attachment_id = :id").param("id", attachmentId)
                .query(byte[].class).single()).isEqualTo(JPEG);
    }

    @Test
    @DisplayName("SSK-172 ไฟล์ของเอกสารไม่อยู่ในรายการไฟล์แนบ และลบผ่าน /api/attachments ไม่ได้ (409)")
    void documentFilesAreNotLooseAttachments() throws Exception {
        long lease = lease("110", tenant("หนึ่ง"));
        long attachmentId = ((Number) JsonPath.read(upload(file("scan.pdf", PDF), "CONTRACT_SCAN", "2026-11-01",
                null, Map.of("leaseId", lease)).andReturn().getResponse().getContentAsString(), "$.attachmentId"))
                .longValue();

        mockMvc.perform(get("/api/attachments").param("ownerType", "LEASE").param("ownerId", String.valueOf(lease)))
                .andExpect(jsonPath("$").value(hasSize(0)));
        mockMvc.perform(delete("/api/attachments/{id}", attachmentId))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.detail").value("This file belongs to a document. Delete the document instead"));
        list("").andExpect(jsonPath("$").value(hasSize(1)));
    }

    @Test
    @DisplayName("SSK-172 ข้อความ error ตามสัญญา ตรวจตามลำดับ ไฟล์ → ค่าในฟอร์ม → เจ้าของ → ขนาด → ชนิด")
    void errors() throws Exception {
        long lease = lease("110", tenant("หนึ่ง"));
        String tomorrow = LocalDate.now(ZoneId.of("Asia/Bangkok")).plusDays(1).toString();
        byte[] exe = {'M', 'Z', 0, 0};
        byte[] big = new byte[5 * 1024 * 1024 + 1];
        System.arraycopy(exe, 0, big, 0, exe.length);

        Map<ResultActions, String> badRequests = new LinkedHashMap<>();
        badRequests.put(mockMvc.perform(multipart("/api/documents").param("type", "PHOTO")), "Please choose a file");
        badRequests.put(upload(file("a.pdf", PDF), "PHOTO", "bad", null, Map.of()),
                "Document type must be CONTRACT_SCAN, MAINTENANCE_REPORT or RECEIPT_SCAN");
        badRequests.put(upload(file("a.pdf", PDF), "CONTRACT_SCAN", "01/11/2026", null, Map.of("leaseId", lease)),
                "Please choose the scan date (YYYY-MM-DD)");
        badRequests.put(upload(file("a.pdf", PDF), "CONTRACT_SCAN", tomorrow, null, Map.of("leaseId", lease)),
                "The scan date cannot be in the future");
        badRequests.put(upload(file("a.pdf", PDF), "CONTRACT_SCAN", "2026-11-01", null,
                Map.of("leaseId", lease, "ticketId", 1L)), "Choose one lease, ticket or receipt for this document");
        badRequests.put(upload(file("a.pdf", PDF), "CONTRACT_SCAN", "2026-11-01", "x".repeat(201),
                Map.of("leaseId", lease)), "The description must be 200 characters or fewer");
        for (Map.Entry<ResultActions, String> bad : badRequests.entrySet()) {
            bad.getKey().andExpect(status().isBadRequest())
                    .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                    .andExpect(jsonPath("$.detail").value(bad.getValue()));
        }

        upload(file("big.exe", big), "CONTRACT_SCAN", "2026-11-01", null, Map.of("receiptId", 999_999L))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.detail").value("No receipt with id 999999"));
        upload(file("big.exe", big), "CONTRACT_SCAN", "2026-11-01", null, Map.of("leaseId", lease))
                .andExpect(status().isContentTooLarge())
                .andExpect(jsonPath("$.detail").value("The file is larger than 5 MB"));
        upload(file("scan.pdf", exe), "CONTRACT_SCAN", "2026-11-01", null, Map.of("leaseId", lease))
                .andExpect(status().isUnsupportedMediaType())
                .andExpect(jsonPath("$.detail").value("Only PDF, PNG and JPEG files are allowed"));
        mockMvc.perform(delete("/api/documents/{id}", 999_999))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.detail").value("No document with id 999999"));
        assertThat(jdbc.sql("SELECT count(*) FROM attachment WHERE lease_id = :id").param("id", lease)
                .query(Long.class).single()).isZero();
    }

    @Test
    @DisplayName("SSK-172 AC: ไม่ได้ล็อกอินได้ 401 ทั้งอัปโหลด ค้น ลบ และ URL ของไฟล์")
    void signedOutRequestsAreRejected() throws Exception {
        long lease = lease("110", tenant("หนึ่ง"));
        String json = upload(file("scan.pdf", PDF), "CONTRACT_SCAN", "2026-11-01", null, Map.of("leaseId", lease))
                .andReturn().getResponse().getContentAsString();

        mockMvc.perform(get(JsonPath.<String>read(json, "$.contentUrl")).with(anonymous()))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.detail").value("Please sign in"));
        mockMvc.perform(get("/api/documents").with(anonymous())).andExpect(status().isUnauthorized());
        mockMvc.perform(delete("/api/documents/{id}", ((Number) JsonPath.read(json, "$.id")).longValue())
                .with(anonymous())).andExpect(status().isUnauthorized());
        mockMvc.perform(multipart("/api/documents").file(file("scan.pdf", PDF)).param("type", "CONTRACT_SCAN")
                        .param("scanDate", "2026-11-01").param("leaseId", String.valueOf(lease)).with(anonymous()))
                .andExpect(status().isUnauthorized());
        list("").andExpect(jsonPath("$").value(hasSize(1)));
    }

    private ResultActions upload(MockMultipartFile file, String type, String scanDate, String description,
            Map<String, Long> owners) throws Exception {
        MockMultipartHttpServletRequestBuilder request = multipart("/api/documents").file(file);
        request.param("type", type).param("scanDate", scanDate);
        if (description != null) {
            request.param("description", description);
        }
        owners.forEach((name, id) -> request.param(name, String.valueOf(id)));
        return mockMvc.perform(request);
    }

    private ResultActions list(String query) throws Exception {
        // URI สำเร็จรูป ไม่ใช่ template ไม่งั้น %25 ในคำค้นถูกเข้ารหัสซ้ำเป็น %2525
        return mockMvc.perform(get(URI.create("/api/documents?" + query)));
    }

    private static long documentId(ResultActions upload) throws Exception {
        return ((Number) JsonPath.read(upload.andExpect(status().isCreated()).andReturn().getResponse()
                .getContentAsString(), "$.id")).longValue();
    }

    private static MockMultipartFile file(String name, byte[] content) {
        return new MockMultipartFile("file", name, "application/octet-stream", content);
    }

    private static String sha256(byte[] content) throws Exception {
        return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(content));
    }

    /** เลขบัตรขึ้นต้นด้วย 32 ไม่ชนกับเทสคลาสอื่น (tenant_national_id_uk) */
    private Tenant tenant(String name) {
        Tenant tenant = tenantRepository.saveAndFlush(new Tenant(name,
                String.format("32%011d", tenants.size() + 1), null, "082-320-0001", null));
        tenants.add(tenant);
        return tenant;
    }

    private long lease(String roomNumber, Tenant tenant) throws Exception {
        return ((Number) JsonPath.read(mockMvc.perform(post("/api/leases").contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"roomId":%d,"tenantId":%d,"startDate":"2026-07-01","endDate":null,\
                                "monthlyRent":9999,"billingCycle":"MONTHLY"}"""
                                .formatted(roomId(roomNumber), tenant.getId())))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString(), "$.id")).longValue();
    }

    private long issue(long leaseId, String month) throws Exception {
        return ((Number) JsonPath.read(mockMvc.perform(post("/api/receipts").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"leaseId\":%d,\"billingMonth\":\"%s\",\"electricUnits\":85,\"waterUnits\":15}"
                                .formatted(leaseId, month)))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString(), "$.id")).longValue();
    }

    private long ticket(String roomNumber) throws Exception {
        long id = ((Number) JsonPath.read(mockMvc.perform(post("/api/maintenance")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"roomId\":%d,\"title\":\"SSK-172 แอร์ไม่เย็น\"}".formatted(roomId(roomNumber))))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString(), "$.id")).longValue();
        tickets.add(id);
        return id;
    }

    private long roomId(String roomNumber) {
        return roomRepository.findByRoomNumber(roomNumber).map(Room::getId).orElseThrow();
    }
}
