package com.sakurasoul.apartment.attachment;

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
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockMultipartHttpServletRequestBuilder;
import org.testcontainers.DockerClientFactory;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.hamcrest.Matchers.allOf;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.startsWith;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.anonymous;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * ที่เก็บไฟล์กลาง (SSK-161) ผ่าน HTTP แบบ multipart ถึง PostgreSQL ตัวจริง ไล่ตาม AC ของการ์ด
 * <p>
 * MockMvc ไม่ใช้เพดาน multipart ของ Spring ไฟล์เกิน 5 MB จึงมาถึง CheckedFile ซึ่งตอบ 413 เอง
 * เพดาน 6 MB ของ Spring กับ 7m ของ nginx ลองกับ docker compose ตอนตรวจของจริง
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
@EnabledIf("dockerAvailable")
@WithMockUser(username = "admin")
class AttachmentApiTest {

    private static final byte[] PDF = "%PDF-1.7\nสัญญาเช่า\n%%EOF".getBytes(StandardCharsets.UTF_8);
    private static final byte[] PNG = {(byte) 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 13};
    private static final byte[] JPEG = {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF, (byte) 0xE0, 0, 16, 'J', 'F', 'I', 'F'};
    private static final byte[] EXE = {'M', 'Z', (byte) 0x90, 0, 3, 0, 0, 0};

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

    /** ไฟล์ของสัญญา ใบเสร็จ และการชำระหายไปตาม ON DELETE CASCADE เมื่อเจ้าของถูกลบ */
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
    @DisplayName("SSK-161 AC: อัปโหลด 4 MB แล้ว SHA-256 ตรงกันทั้งที่ตอบกลับ ที่ดาวน์โหลด และในฐานข้อมูล")
    void theSha256SurvivesTheRoundTrip() throws Exception {
        long lease = lease("110");
        byte[] fourMegabytes = pdfOfSize(4 * 1024 * 1024);
        String expected = CheckedFile.sha256Of(fourMegabytes);

        String json = upload(file("contract-110.pdf", "application/pdf", fourMegabytes), "LEASE", lease)
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.ownerType").value("LEASE"))
                .andExpect(jsonPath("$.ownerId").value(lease))
                .andExpect(jsonPath("$.fileName").value("contract-110.pdf"))
                .andExpect(jsonPath("$.contentType").value("application/pdf"))
                .andExpect(jsonPath("$.sizeBytes").value(fourMegabytes.length))
                .andExpect(jsonPath("$.sha256").value(expected))
                .andExpect(jsonPath("$.uploadedBy").value("admin"))
                .andReturn().getResponse().getContentAsString();
        long id = idOf(json);

        assertThat(JsonPath.<String>read(json, "$.contentUrl")).isEqualTo("/api/attachments/" + id + "/content");
        byte[] downloaded = mockMvc.perform(get("/api/attachments/{id}/content", id))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsByteArray();
        assertThat(CheckedFile.sha256Of(downloaded)).isEqualTo(expected);
        assertThat(jdbc.sql("SELECT encode(sha256(data), 'hex') FROM attachment_content WHERE attachment_id = :id")
                .param("id", id).query(String.class).single()).isEqualTo(expected);
        assertThat(jdbc.sql("SELECT sha256 FROM attachment WHERE id = :id").param("id", id).query(String.class)
                .single()).isEqualTo(expected);
    }

    /**
     * fetch ของหน้าเว็บ (send ใน client.ts) ส่ง Accept: application/json ทุกครั้ง endpoint จึงไม่ประกาศ produces
     * ชื่อไฟล์ภาษาไทยส่งแบบ filename*=UTF-8''... ตาม RFC 5987
     */
    @Test
    @DisplayName("SSK-161 ดาวน์โหลดได้ Content-Type จริง nosniff inline ชื่อไทย และ no-store แม้ส่ง Accept เป็น JSON")
    void downloadHeaders() throws Exception {
        long lease = lease("110");
        long id = idOf(upload(file("สลิป 1201.jpg", "image/png", JPEG), "LEASE", lease)
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString());

        mockMvc.perform(get("/api/attachments/{id}/content", id).accept(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(header().string("Content-Type", "image/jpeg"))
                .andExpect(header().string("Content-Length", String.valueOf(JPEG.length)))
                .andExpect(header().string("X-Content-Type-Options", "nosniff"))
                .andExpect(header().string("Cache-Control", "private, no-store"))
                .andExpect(header().string("Content-Disposition", allOf(startsWith("inline;"),
                        containsString("filename*=UTF-8''%E0%B8%AA%E0%B8%A5%E0%B8%B4%E0%B8%9B%201201.jpg"))))
                .andExpect(content().bytes(JPEG));
    }

    @Test
    @DisplayName("SSK-161 AC: ไฟล์ .exe ที่เปลี่ยนชื่อเป็น .png GIF และข้อความธรรมดาได้ 415 ไม่มีแถวถูกบันทึก")
    void disguisedAndUnsupportedFilesAreRejected() throws Exception {
        long lease = lease("110");
        byte[] gif = "GIF89a\u0001\u0000".getBytes(StandardCharsets.ISO_8859_1);

        for (MockMultipartFile bad : List.of(file("slip.png", "image/png", EXE), file("slip.gif", "image/gif", gif),
                file("note.pdf", "application/pdf", "hello".getBytes(StandardCharsets.US_ASCII)))) {
            upload(bad, "LEASE", lease)
                    .andExpect(status().isUnsupportedMediaType())
                    .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                    .andExpect(jsonPath("$.detail").value("Only PDF, PNG and JPEG files are allowed"));
        }
        assertThat(attachmentRows()).isZero();

        // ชนิดมาจากเนื้อไฟล์ ไม่ใช่ชื่อหรือ Content-Type ที่ส่งมา
        upload(file("x.exe", "text/plain", PNG), "LEASE", lease)
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.contentType").value("image/png"))
                .andExpect(jsonPath("$.fileName").value("x.exe"));
    }

    @Test
    @DisplayName("SSK-161 AC: 5 MB พอดีผ่าน เกินหนึ่งไบต์ได้ 413 พร้อมข้อความ")
    void fiveMegabytesIsTheLimit() throws Exception {
        long lease = lease("110");

        upload(file("exact.pdf", "application/pdf", pdfOfSize(5 * 1024 * 1024)), "LEASE", lease)
                .andExpect(status().isCreated());
        upload(file("over.pdf", "application/pdf", pdfOfSize(5 * 1024 * 1024 + 1)), "LEASE", lease)
                .andExpect(status().isContentTooLarge())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.detail").value("The file is larger than 5 MB"));
        assertThat(attachmentRows()).isEqualTo(1);
    }

    @Test
    @DisplayName("SSK-161 ลำดับการตรวจ: ไม่มีไฟล์ → เจ้าของผิดรูป → ไม่พบเจ้าของ → ขนาด → ชนิด")
    void validationOrder() throws Exception {
        long lease = lease("110");
        byte[] bigExe = new byte[5 * 1024 * 1024 + 1];
        System.arraycopy(EXE, 0, bigExe, 0, EXE.length);

        mockMvc.perform(multipart("/api/attachments").param("ownerType", "ROOM"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value("Please choose a file"));
        upload(file("empty.pdf", "application/pdf", new byte[0]), "ROOM", lease)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value("Please choose a file"));
        upload(file("big.exe", "application/octet-stream", bigExe), "ROOM", lease)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value("Choose what this file belongs to"));
        mockMvc.perform(multipart("/api/attachments").file(file("a.pdf", "application/pdf", PDF))
                        .param("ownerType", "LEASE"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value("Choose what this file belongs to"));
        upload(file("big.exe", "application/octet-stream", bigExe), "LEASE", 999_999)
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.detail").value("No lease with id 999999"));
        upload(file("big.exe", "application/octet-stream", bigExe), "LEASE", lease)
                .andExpect(status().isContentTooLarge());
        upload(file("small.exe", "application/octet-stream", EXE), "LEASE", lease)
                .andExpect(status().isUnsupportedMediaType());
    }

    @Test
    @DisplayName("SSK-161 แนบได้ทั้งสี่เจ้าของ รวมใบแจ้งซ่อมที่ปิดงานแล้ว ไม่พบเจ้าของได้ 404 ตามชนิด")
    void everyOwnerType() throws Exception {
        long lease = lease("110");
        long receipt = issue(lease, "2026-08");
        long payment = pay(receipt);
        long ticket = ticket("110");
        mockMvc.perform(patch("/api/maintenance/{id}", ticket).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"status\":\"DONE\"}"))
                .andExpect(status().isOk());

        upload(file("lease.pdf", "application/pdf", PDF), "LEASE", lease).andExpect(status().isCreated());
        upload(file("ticket.jpg", "image/jpeg", JPEG), "MAINTENANCE_TICKET", ticket)
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.ownerType").value("MAINTENANCE_TICKET"))
                .andExpect(jsonPath("$.ownerId").value(ticket));
        upload(file("receipt.png", "image/png", PNG), "RECEIPT", receipt).andExpect(status().isCreated());
        upload(file("slip.jpg", "image/jpeg", JPEG), "PAYMENT", payment)
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.ownerType").value("PAYMENT"));

        upload(file("a.pdf", "application/pdf", PDF), "MAINTENANCE_TICKET", 999_999)
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.detail").value("No maintenance ticket with id 999999"));
        upload(file("a.pdf", "application/pdf", PDF), "RECEIPT", 999_999)
                .andExpect(jsonPath("$.detail").value("No receipt with id 999999"));
        upload(file("a.pdf", "application/pdf", PDF), "PAYMENT", 999_999)
                .andExpect(jsonPath("$.detail").value("No payment with id 999999"));
    }

    @Test
    @DisplayName("SSK-161 รายการไฟล์ของเจ้าของ ใหม่สุดก่อน ไม่มีตัวไฟล์ ไฟล์ของเจ้าของอื่นไม่ปน")
    void listByOwner() throws Exception {
        long lease = lease("110");
        long other = lease("111");
        long first = idOf(upload(file("first.pdf", "application/pdf", PDF), "LEASE", lease)
                .andReturn().getResponse().getContentAsString());
        long second = idOf(upload(file("second.png", "image/png", PNG), "LEASE", lease)
                .andReturn().getResponse().getContentAsString());
        upload(file("other.pdf", "application/pdf", PDF), "LEASE", other).andExpect(status().isCreated());

        mockMvc.perform(get("/api/attachments").param("ownerType", "LEASE").param("ownerId", String.valueOf(lease)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[*].id").value(contains((int) second, (int) first)))
                .andExpect(jsonPath("$[0].fileName").value("second.png"))
                .andExpect(jsonPath("$[0].data").doesNotExist());
        mockMvc.perform(get("/api/attachments").param("ownerType", "LEASE").param("ownerId", "999999"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.detail").value("No lease with id 999999"));
        mockMvc.perform(get("/api/attachments").param("ownerType", "TENANT").param("ownerId", "1"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value("Choose what this file belongs to"));
    }

    @Test
    @DisplayName("SSK-161 ลบแบบ soft delete หายจากรายการ ดาวน์โหลดได้ 404 ลบซ้ำได้ 404 แต่ร่องรอยกับไบต์ยังอยู่")
    void softDelete() throws Exception {
        long lease = lease("110");
        long id = idOf(upload(file("slip.jpg", "image/jpeg", JPEG), "LEASE", lease)
                .andReturn().getResponse().getContentAsString());
        Instant before = Instant.now();

        mockMvc.perform(delete("/api/attachments/{id}", id)).andExpect(status().isNoContent());

        mockMvc.perform(get("/api/attachments").param("ownerType", "LEASE").param("ownerId", String.valueOf(lease)))
                .andExpect(jsonPath("$").value(hasSize(0)));
        mockMvc.perform(get("/api/attachments/{id}/content", id))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.detail").value("No attachment with id " + id));
        mockMvc.perform(delete("/api/attachments/{id}", id))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.detail").value("No attachment with id " + id));
        assertThat(jdbc.sql("SELECT deleted_by FROM attachment WHERE id = :id").param("id", id).query(String.class)
                .single()).isEqualTo("admin");
        assertThat(jdbc.sql("SELECT deleted_at FROM attachment WHERE id = :id").param("id", id)
                .query(java.sql.Timestamp.class).single().toInstant()).isAfterOrEqualTo(before.minusSeconds(1));
        assertThat(jdbc.sql("SELECT data FROM attachment_content WHERE attachment_id = :id").param("id", id)
                .query(byte[].class).single()).isEqualTo(JPEG);
    }

    @Test
    @DisplayName("SSK-161 AC: ลบเจ้าของแล้วไม่เหลือแถวกำพร้า ทั้งใบแจ้งซ่อมที่ลบผ่าน API และสัญญา ใบเสร็จ การชำระ")
    void noOrphansAfterTheOwnerIsDeleted() throws Exception {
        long ticket = ticket("112");
        long live = idOf(upload(file("before.jpg", "image/jpeg", JPEG), "MAINTENANCE_TICKET", ticket)
                .andReturn().getResponse().getContentAsString());
        long deleted = idOf(upload(file("old.jpg", "image/jpeg", JPEG), "MAINTENANCE_TICKET", ticket)
                .andReturn().getResponse().getContentAsString());
        mockMvc.perform(delete("/api/attachments/{id}", deleted)).andExpect(status().isNoContent());

        mockMvc.perform(delete("/api/maintenance/{id}", ticket)).andExpect(status().isNoContent());
        tickets.remove(ticket);
        assertThat(rowsOf(List.of(live, deleted))).as("ไฟล์ของใบแจ้งซ่อม").isZero();

        long lease = lease("110");
        long receipt = issue(lease, "2026-08");
        long payment = pay(receipt);
        List<Long> files = new ArrayList<>();
        files.add(idOf(upload(file("l.pdf", "application/pdf", PDF), "LEASE", lease)
                .andReturn().getResponse().getContentAsString()));
        files.add(idOf(upload(file("r.pdf", "application/pdf", PDF), "RECEIPT", receipt)
                .andReturn().getResponse().getContentAsString()));
        files.add(idOf(upload(file("p.jpg", "image/jpeg", JPEG), "PAYMENT", payment)
                .andReturn().getResponse().getContentAsString()));

        jdbc.sql("DELETE FROM payment_allocation").update();
        jdbc.sql("DELETE FROM payment WHERE id = :id").param("id", payment).update();
        assertThat(rowsOf(files.subList(2, 3))).as("ไฟล์ของการชำระ").isZero();
        BillingTables.clear(jdbc);
        assertThat(rowsOf(files.subList(1, 2))).as("ไฟล์ของใบเสร็จ").isZero();
        leaseRepository.deleteAll();
        assertThat(rowsOf(files)).as("ไฟล์ของสัญญา").isZero();
    }

    @Test
    @DisplayName("SSK-161 ฐานข้อมูลไม่รับไฟล์ที่มีเจ้าของสองรายหรือไม่มีเลย")
    void exactlyOneOwnerIsEnforcedByTheDatabase() throws Exception {
        long lease = lease("110");
        long receipt = issue(lease, "2026-08");
        String insert = """
                INSERT INTO attachment (lease_id, receipt_id, file_name, content_type, size_bytes, sha256, uploaded_at,
                                        uploaded_by)
                VALUES (:lease, :receipt, 'x.pdf', 'application/pdf', 1, repeat('a', 64), now(), 'admin')""";

        assertThatThrownBy(() -> jdbc.sql(insert).param("lease", lease).param("receipt", receipt).update())
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("attachment_one_owner_ck");
        assertThatThrownBy(() -> jdbc.sql(insert).param("lease", null).param("receipt", null).update())
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("attachment_one_owner_ck");
    }

    @Test
    @DisplayName("SSK-161 AC: ไม่ได้ล็อกอินได้ 401 ทุก endpoint รวม URL ของตัวไฟล์")
    void signedOutRequestsAreRejected() throws Exception {
        long lease = lease("110");
        long id = idOf(upload(file("a.pdf", "application/pdf", PDF), "LEASE", lease)
                .andReturn().getResponse().getContentAsString());

        mockMvc.perform(get("/api/attachments/{id}/content", id).with(anonymous()))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.detail").value("Please sign in"));
        mockMvc.perform(get("/api/attachments").param("ownerType", "LEASE").param("ownerId", String.valueOf(lease))
                .with(anonymous())).andExpect(status().isUnauthorized());
        mockMvc.perform(delete("/api/attachments/{id}", id).with(anonymous())).andExpect(status().isUnauthorized());
        mockMvc.perform(multipart("/api/attachments").file(file("a.pdf", "application/pdf", PDF))
                        .param("ownerType", "LEASE").param("ownerId", String.valueOf(lease)).with(anonymous()))
                .andExpect(status().isUnauthorized());
        assertThat(attachmentRows()).isEqualTo(1);
    }

    private ResultActions upload(MockMultipartFile file, String ownerType, long ownerId) throws Exception {
        MockMultipartHttpServletRequestBuilder request = multipart("/api/attachments").file(file);
        return mockMvc.perform(request.param("ownerType", ownerType).param("ownerId", String.valueOf(ownerId)));
    }

    private static MockMultipartFile file(String name, String contentType, byte[] content) {
        return new MockMultipartFile("file", name, contentType, content);
    }

    private static byte[] pdfOfSize(int size) {
        byte[] content = new byte[size];
        Arrays.fill(content, (byte) 'x');
        System.arraycopy(PDF, 0, content, 0, 5);
        return content;
    }

    private static long idOf(String json) {
        return ((Number) JsonPath.read(json, "$.id")).longValue();
    }

    private long attachmentRows() {
        return jdbc.sql("SELECT count(*) FROM attachment WHERE lease_id IN (SELECT id FROM lease)")
                .query(Long.class).single();
    }

    /** แถวที่เหลือของไฟล์เหล่านี้ทั้งในตารางข้อมูลของไฟล์และตารางตัวไฟล์ */
    private long rowsOf(List<Long> ids) {
        long total = 0;
        for (Long id : ids) {
            total += jdbc.sql("SELECT (SELECT count(*) FROM attachment WHERE id = :id)"
                    + " + (SELECT count(*) FROM attachment_content WHERE attachment_id = :id)")
                    .param("id", id).query(Long.class).single();
        }
        return total;
    }

    /** สัญญาตามอัตราตั้งต้นของตึก เลขบัตรขึ้นต้นด้วย 31 ไม่ชนกับเทสคลาสอื่น (tenant_national_id_uk) */
    private long lease(String roomNumber) throws Exception {
        Tenant tenant = tenantRepository.saveAndFlush(new Tenant("ไฟล์แนบ " + roomNumber,
                String.format("31%011d", tenants.size() + 1), null, "082-310-0001", null));
        tenants.add(tenant);
        String json = mockMvc.perform(post("/api/leases").contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"roomId":%d,"tenantId":%d,"startDate":"2026-07-01","endDate":null,\
                                "monthlyRent":9999,"billingCycle":"MONTHLY"}"""
                                .formatted(roomId(roomNumber), tenant.getId())))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return idOf(json);
    }

    private long issue(long leaseId, String month) throws Exception {
        return idOf(mockMvc.perform(post("/api/receipts").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"leaseId\":%d,\"billingMonth\":\"%s\",\"electricUnits\":85,\"waterUnits\":15}"
                                .formatted(leaseId, month)))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString());
    }

    /** การชำระ 1,000 บนใบนี้ คืน id ของการชำระ */
    private long pay(long receiptId) throws Exception {
        String json = mockMvc.perform(post("/api/receipts/{id}/payments", receiptId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"amount\":1000,\"method\":\"TRANSFER\"}"))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return ((Number) JsonPath.read(json, "$.payments[0].id")).longValue();
    }

    private long ticket(String roomNumber) throws Exception {
        long id = idOf(mockMvc.perform(post("/api/maintenance").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"roomId\":%d,\"title\":\"SSK-161 แอร์ไม่เย็น\"}".formatted(roomId(roomNumber))))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString());
        tickets.add(id);
        return id;
    }

    private long roomId(String roomNumber) {
        return roomRepository.findByRoomNumber(roomNumber).map(Room::getId).orElseThrow();
    }
}
