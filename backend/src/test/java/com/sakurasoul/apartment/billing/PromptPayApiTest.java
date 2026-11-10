package com.sakurasoul.apartment.billing;

import com.jayway.jsonpath.JsonPath;
import com.sakurasoul.apartment.TestcontainersConfiguration;
import com.sakurasoul.apartment.lease.LeaseRepository;
import com.sakurasoul.apartment.promptpay.Crc16Ccitt;
import com.sakurasoul.apartment.room.Room;
import com.sakurasoul.apartment.room.RoomRepository;
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
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.testcontainers.DockerClientFactory;

import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * บัญชีรับเงินกับ QR PromptPay บนใบเสร็จผ่าน API ถึง PostgreSQL จริง (SSK-168)
 * <p>
 * ห้องชั้น 2 เป็นห้องคู่ ค่าเช่า 4,500 ตามชนิดห้อง (V12) ส่วนกลาง 350 ไม่ใช้ไฟ น้ำ 7.5 หน่วย x 20 ได้ใบละ 5,000.00
 * ยอดเดียวกับใบ ต.ค. ในตัวอย่างของสัญญา API payload ที่คาดหวังจึงเป็นข้อความที่คิดแยกจากโค้ดไว้ (ดู PromptPayPayloadTest)
 * ไม่ได้ให้โค้ดที่เทสคิดให้
 * <p>
 * ห้อง 210 กับ 211 จาก migration V2 ไม่มีเทสคลาสอื่นใช้ เลขบัตรขึ้นต้นด้วย 25 ไม่ชนกับคลาสอื่นใน container เดียวกัน
 * เครื่องที่ไม่ได้เปิด Docker จะข้ามเทสชุดนี้ ไม่ใช่ล้ม ส่วน CI มี Docker อยู่แล้วจะรันจริง
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
@EnabledIf("dockerAvailable")
@WithMockUser
class PromptPayApiTest {

    private static final String LEASE_BODY = """
            {"roomId":%d,"tenantId":%d,"startDate":"2026-09-01","endDate":null,\
            "monthlyRent":3500,"billingCycle":"MONTHLY","securityDeposit":7000,\
            "electricRatePerUnit":9.5,"waterRatePerUnit":20,\
            "commonAreaFee":350,"internetFee":0}""";

    private static final String KASIKORN = """
            {"bankName":"Kasikornbank","accountName":"Sakura Soul Apartment",\
            "accountNumber":"012-3-45678-9","promptPayId":"081-234-5678"}""";

    private static final String SCB_WITHOUT_PROMPT_PAY = """
            {"bankName":"Siam Commercial Bank","accountName":"Sakura Soul Apartment",\
            "accountNumber":"405-1-23456-7"}""";

    private static final String KRUNGTHAI = """
            {"bankName":"Krungthai Bank","accountName":"Sakura Soul Co., Ltd.",\
            "accountNumber":"982-0-11223-4","promptPayId":"0105561234567"}""";

    /** ใบ 5,000.00 ของ 0812345678 (ใบใหม่ยังไม่มีการชำระ) */
    private static final String QR_5000 =
            "00020101021229370016A00000067701011101130066812345678530376454075000.005802TH630493E5";

    /** ใบเดียวกันหลังรับชำระ 2,000.00 ตามคอมเมนต์ของทีมใน SSK-168 */
    private static final String QR_3000 =
            "00020101021229370016A00000067701011101130066812345678530376454073000.005802TH6304F1A9";

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
    private long leaseId;

    static boolean dockerAvailable() {
        return DockerClientFactory.instance().isDockerAvailable();
    }

    @BeforeEach
    void createLease() throws Exception {
        leaseId = lease("210", "2500000000001");
    }

    /** ค่าตั้งเป็นแถวเดียวที่ใช้ร่วมกันทุกเทสคลาส ต้องคืนเป็นไม่มีบัญชี ใบของคลาสอื่นจะได้ไม่มีสำเนาบัญชีติดไป */
    @AfterEach
    void clearData() {
        BillingTables.clear(jdbc);
        leaseRepository.deleteAll();
        tenantRepository.deleteAll(tenants);
        jdbc.sql("""
                UPDATE apartment_config
                SET bank_name = NULL, bank_account_name = NULL, bank_account_number = NULL, bank_prompt_pay_id = NULL
                WHERE id = 1""").update();
    }

    @Test
    @DisplayName("SSK-168 ยังไม่ได้ตั้งบัญชี ออกใบได้ตามปกติ ไม่มีบัญชีและไม่มี QR")
    void withoutABankAccountTheReceiptHasNoBankAndNoQr() throws Exception {
        issue("2026-09")
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.totalAmount").value(5000.00))
                .andExpect(jsonPath("$.bank").value(nullValue()))
                .andExpect(jsonPath("$.promptPayPayload").value(nullValue()));
    }

    @Test
    @DisplayName("SSK-168 QR ของใบเป็นยอดที่ยังต้องจ่าย 5,000 รับ 2,000 แล้วเป็น 3,000 จ่ายครบแล้วไม่มี QR ยกเลิกแล้วกลับมา")
    void theQrFollowsTheBalanceDue() throws Exception {
        setBankAccount(KASIKORN);
        long september = idOf(issue("2026-09")
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.bank.bankName").value("Kasikornbank"))
                .andExpect(jsonPath("$.bank.accountName").value("Sakura Soul Apartment"))
                .andExpect(jsonPath("$.bank.accountNumber").value("012-3-45678-9"))
                .andExpect(jsonPath("$.bank.promptPayId").value("0812345678"))
                .andExpect(jsonPath("$.promptPayPayload").value(QR_5000)));

        recordPayment(september, "{\"amount\":2000,\"paidOn\":\"2026-10-03\",\"method\":\"CASH\"}")
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.promptPayPayload").value(QR_3000));
        mockMvc.perform(get("/api/receipts/{id}", september))
                .andExpect(jsonPath("$.promptPayPayload").value(QR_3000));

        long last = lastPaymentId(recordPayment(september,
                "{\"amount\":3000,\"paidOn\":\"2026-10-04\",\"method\":\"TRANSFER\"}")
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("PAID"))
                .andExpect(jsonPath("$.promptPayPayload").value(nullValue()))
                // ใบที่จ่ายครบยังบอกบัญชี ณ ตอนออก ไม่มีแค่ QR
                .andExpect(jsonPath("$.bank.accountNumber").value("012-3-45678-9")));

        mockMvc.perform(post("/api/payments/{id}/void", last))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.promptPayPayload").value(QR_3000));
    }

    @Test
    @DisplayName("SSK-168 เปลี่ยนบัญชีแล้วใบเก่ายังเป็นบัญชีเดิม (ถูกยกยอดจึงไม่มี QR) ใบใหม่ใช้บัญชีใหม่ทั้งบัญชีและ QR")
    void changingTheAccountOnlyAffectsReceiptsIssuedLater() throws Exception {
        setBankAccount(KASIKORN);
        long september = idOf(issue("2026-09").andExpect(status().isCreated()));

        setBankAccount(KRUNGTHAI);
        String october = issue("2026-10")
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.bank.bankName").value("Krungthai Bank"))
                .andExpect(jsonPath("$.bank.promptPayId").value("0105561234567"))
                // ยอดยกมา 5,000 ของใบ ก.ย. รวมกับใบ ต.ค. อีก 5,000 ไม่มีดอกเบี้ยเพราะสัญญาตกลง 0%
                .andExpect(jsonPath("$.balanceDue").value(10000.00))
                .andReturn().getResponse().getContentAsString();

        String payload = JsonPath.read(october, "$.promptPayPayload");
        assertThat(payload)
                .contains("02130105561234567")
                .contains("540810000.00")
                .endsWith(Crc16Ccitt.hex(payload.substring(0, payload.length() - 4)));

        mockMvc.perform(get("/api/receipts/{id}", september))
                .andExpect(jsonPath("$.carriedToReceiptNo").isNotEmpty())
                .andExpect(jsonPath("$.bank.bankName").value("Kasikornbank"))
                .andExpect(jsonPath("$.bank.promptPayId").value("0812345678"))
                .andExpect(jsonPath("$.promptPayPayload").value(nullValue()));
    }

    /** คอลัมน์ของสำเนาเป็น updatable = false การแก้ใบซึ่ง UPDATE แถวนี้จึงเปลี่ยนสำเนาไม่ได้ */
    @Test
    @DisplayName("SSK-168 แก้หน่วยของใบหลังเปลี่ยนบัญชี ใบยังเป็นบัญชี ณ ตอนออก แต่ QR ตามยอดใหม่")
    void editingTheReceiptKeepsTheAccountItWasIssuedWith() throws Exception {
        setBankAccount(KASIKORN);
        long september = idOf(issue("2026-09").andExpect(status().isCreated()));
        setBankAccount(KRUNGTHAI);

        // น้ำ 7.5 → 12.5 หน่วย ยอดใหม่ 5,100.00
        mockMvc.perform(put("/api/receipts/{id}", september)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"billingMonth\":\"2026-09\",\"electricUnits\":0,\"waterUnits\":12.5}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalAmount").value(5100.00))
                .andExpect(jsonPath("$.bank.bankName").value("Kasikornbank"))
                .andExpect(jsonPath("$.promptPayPayload").value(
                        "00020101021229370016A00000067701011101130066812345678530376454075100.005802TH6304"
                                + Crc16Ccitt.hex("00020101021229370016A00000067701011101130066812345678"
                                        + "530376454075100.005802TH6304")));

        assertThat(jdbc.sql("SELECT bank_name FROM receipt WHERE id = :id").param("id", september)
                .query(String.class).single()).isEqualTo("Kasikornbank");
    }

    @Test
    @DisplayName("SSK-168 บัญชีที่ไม่มี PromptPay ใบมีบัญชีแต่ไม่มี QR")
    void anAccountWithoutPromptPayGivesNoQr() throws Exception {
        setBankAccount(SCB_WITHOUT_PROMPT_PAY);

        issue("2026-09")
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.bank.bankName").value("Siam Commercial Bank"))
                .andExpect(jsonPath("$.bank.promptPayId").value(nullValue()))
                .andExpect(jsonPath("$.promptPayPayload").value(nullValue()));
    }

    @Test
    @DisplayName("SSK-168 เลิกแสดงบัญชีแล้วใบที่ออกหลังจากนั้นไม่มีบัญชี ใบที่ออกก่อนยังมี")
    void clearingTheAccountOnlyAffectsReceiptsIssuedLater() throws Exception {
        setBankAccount(KASIKORN);
        long september = idOf(issue("2026-09").andExpect(status().isCreated()));
        setBankAccount("{}");
        long otherLease = lease("211", "2500000000002");

        mockMvc.perform(post("/api/receipts")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(receiptBody(otherLease, "2026-09")))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.bank").value(nullValue()))
                .andExpect(jsonPath("$.promptPayPayload").value(nullValue()));
        mockMvc.perform(get("/api/receipts/{id}", september))
                .andExpect(jsonPath("$.promptPayPayload").value(QR_5000));
    }

    @Test
    @DisplayName("SSK-168 ฐานข้อมูลไม่รับสำเนาบัญชีที่ไม่ครบสามช่องหรือ PromptPay ผิดรูปแบบบนใบเสร็จ")
    void theDatabaseRejectsABrokenSnapshotOnAReceipt() throws Exception {
        long september = idOf(issue("2026-09").andExpect(status().isCreated()));

        assertThatThrownBy(() -> jdbc.sql("UPDATE receipt SET bank_name = 'Kasikornbank' WHERE id = :id")
                .param("id", september).update())
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("receipt_bank_all_or_none_ck");
        assertThatThrownBy(() -> jdbc.sql("""
                        UPDATE receipt SET bank_name = 'Kasikornbank', bank_account_name = 'Sakura Soul Apartment',
                            bank_account_number = '012-3-45678-9', bank_prompt_pay_id = '081-234-5678'
                        WHERE id = :id""")
                .param("id", september).update())
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("receipt_bank_prompt_pay_id_ck");
    }

    private long lease(String roomNumber, String nationalId) throws Exception {
        Tenant tenant = tenantRepository.saveAndFlush(
                new Tenant("มานี รักเรียน", nationalId, null, "082-250-0001", null));
        tenants.add(tenant);
        String json = mockMvc.perform(post("/api/leases")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(LEASE_BODY.formatted(roomId(roomNumber), tenant.getId())))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return ((Number) JsonPath.read(json, "$.id")).longValue();
    }

    private void setBankAccount(String body) throws Exception {
        mockMvc.perform(put("/api/apartment-config/bank-account")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isOk());
    }

    /** ไม่ใช้ไฟ น้ำ 7.5 หน่วย ได้ 5,000.00 ตามอัตราของสัญญา */
    private ResultActions issue(String billingMonth) throws Exception {
        return mockMvc.perform(post("/api/receipts")
                .contentType(MediaType.APPLICATION_JSON)
                .content(receiptBody(leaseId, billingMonth)));
    }

    private static String receiptBody(long lease, String billingMonth) {
        return "{\"leaseId\":%d,\"billingMonth\":\"%s\",\"electricUnits\":0,\"waterUnits\":7.5}"
                .formatted(lease, billingMonth);
    }

    private ResultActions recordPayment(long receiptId, String body) throws Exception {
        return mockMvc.perform(post("/api/receipts/{id}/payments", receiptId)
                .contentType(MediaType.APPLICATION_JSON)
                .content(body));
    }

    private static long idOf(ResultActions response) throws Exception {
        return ((Number) JsonPath.read(response.andReturn().getResponse().getContentAsString(), "$.id")).longValue();
    }

    private static long lastPaymentId(ResultActions response) throws Exception {
        List<Number> ids = JsonPath.read(response.andReturn().getResponse().getContentAsString(), "$.payments[*].id");
        return ids.getLast().longValue();
    }

    private long roomId(String roomNumber) {
        return roomRepository.findAllInLayoutOrder().stream()
                .filter(room -> room.getRoomNumber().equals(roomNumber))
                .map(Room::getId)
                .findFirst()
                .orElseThrow();
    }
}
