package com.sakurasoul.apartment.apartmentconfig;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.classic.spi.IThrowableProxy;
import ch.qos.logback.core.read.ListAppender;
import com.jayway.jsonpath.JsonPath;
import com.sakurasoul.apartment.RecordingMailSender;
import com.sakurasoul.apartment.TestcontainersConfiguration;
import com.sakurasoul.apartment.billing.BillingTables;
import com.sakurasoul.apartment.lease.LeaseRepository;
import com.sakurasoul.apartment.room.Room;
import com.sakurasoul.apartment.room.RoomRepository;
import com.sakurasoul.apartment.tenant.Tenant;
import com.sakurasoul.apartment.tenant.TenantRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIf;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.testcontainers.DockerClientFactory;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * เลขบัญชีกับ PromptPay ID ของเจ้าของหอไม่หลุดลง log ตลอดทางเดินของ SSK-168 ตามข้อกำหนดของการ์ด
 * <p>
 * จับ log ทุกบรรทัดของแอประหว่างยิงคำขอที่ผิดหลายแบบ แล้วตั้งบัญชีจริง ออกใบ เปิดใบ ดาวน์โหลด PDF และส่งอีเมล
 * เลขที่ใช้ตั้งใจให้ไม่ซ้ำกับอะไรในระบบ เจอที่ไหนแปลว่าหลุดมาจากคำขอของเทสนี้แน่นอน
 * <p>
 * ระหว่างเทสเปิด DEBUG ให้ logger ที่พิมพ์ข้อมูลของคำขอได้ ซึ่งเข้มกว่าที่รันจริง (INFO และ DEBUG เฉพาะโค้ดเราในโปรไฟล์ dev)
 * <ul>
 *   <li>โค้ดของเราทั้งหมด</li>
 *   <li>org.springframework.web ที่พิมพ์ request กับ response body ด้วย toString จึงพิสูจน์ toString ที่ซ่อนเลขของ record</li>
 *   <li>org.springframework.jdbc กับ org.hibernate.SQL ที่พิมพ์คำสั่ง SQL (ค่าต้องเป็น ? ไม่ใช่ค่าจริง)</li>
 * </ul>
 * ไม่รวม DEBUG ของ org.hibernate.orm.core ซึ่งพิมพ์ทุกช่องของ entity ตอน flush ทั้งเลขบัญชี ชื่อ และเลขบัตรของผู้เช่า
 * เป็นพฤติกรรมของ Hibernate ที่ไม่เกี่ยวกับการ์ดนี้ ห้ามเปิดระดับนั้นในเครื่องที่มีข้อมูลจริง (เขียนไว้ในเอกสารของ SSK-168)
 * <p>
 * ข้อความ error ของ PostgreSQL ที่มีทั้งแถว (Failing row contains) พิสูจน์แยกที่ BankAccountConstraintTest
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
@EnabledIf("dockerAvailable")
@WithMockUser
class BankAccountLogPrivacyApiTest {

    private static final String ACCOUNT_NUMBER = "739-0-01552-8";
    private static final String PROMPT_PAY = "091-730-0155";
    private static final List<String> SECRETS =
            List.of("7390015528", "739-0-01552-8", "0917300155", "091-730-0155", "0066917300155");

    private static final String LEASE_BODY = """
            {"roomId":%d,"tenantId":%d,"startDate":"2026-09-01","endDate":null,\
            "monthlyRent":3500,"billingCycle":"MONTHLY","securityDeposit":7000,\
            "electricRatePerUnit":9.5,"waterRatePerUnit":20,\
            "commonAreaFee":350,"internetFee":0}""";

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

    @Autowired
    private RecordingMailSender mailSender;

    /** logger ที่พิมพ์ข้อมูลของคำขอได้ เปิดถึง DEBUG ระหว่างเทส ดูคอมเมนต์ของคลาส */
    private static final List<String> VERBOSE = List.of("com.sakurasoul.apartment", "org.springframework.web",
            "org.springframework.jdbc", "org.hibernate.SQL");

    private final ListAppender<ILoggingEvent> logs = new ListAppender<>();
    private final Map<Logger, Level> levelsBefore = new HashMap<>();
    private Logger root;
    private Tenant tenant;

    static boolean dockerAvailable() {
        return DockerClientFactory.instance().isDockerAvailable();
    }

    @BeforeEach
    void captureLogs() {
        for (String name : VERBOSE) {
            Logger logger = (Logger) LoggerFactory.getLogger(name);
            levelsBefore.put(logger, logger.getLevel());
            logger.setLevel(Level.DEBUG);
        }
        root = (Logger) LoggerFactory.getLogger(org.slf4j.Logger.ROOT_LOGGER_NAME);
        logs.start();
        root.addAppender(logs);
        mailSender.reset();
    }

    @AfterEach
    void restore() {
        root.detachAppender(logs);
        logs.stop();
        levelsBefore.forEach(Logger::setLevel);
        mailSender.reset();
        BillingTables.clear(jdbc);
        leaseRepository.deleteAll();
        if (tenant != null) {
            tenantRepository.delete(tenant);
        }
        jdbc.sql("""
                UPDATE apartment_config
                SET bank_name = NULL, bank_account_name = NULL, bank_account_number = NULL, bank_prompt_pay_id = NULL
                WHERE id = 1""").update();
    }

    @Test
    @DisplayName("SSK-168 คำขอที่ผิดทุกแบบ และทางเดินปกติตั้งแต่ตั้งบัญชีถึงส่งอีเมล ไม่มีเลขบัญชีหรือ PromptPay ใน log")
    void theAccountNumberAndPromptPayIdNeverReachTheLogs() throws Exception {
        putBankAccount(account(ACCOUNT_NUMBER, "091-730-01559")).andExpect(status().isBadRequest());
        putBankAccount(account(ACCOUNT_NUMBER + "x", PROMPT_PAY)).andExpect(status().isBadRequest());
        putBankAccount("{\"promptPayId\":\"" + PROMPT_PAY + "\"}").andExpect(status().isBadRequest());
        putBankAccount("{\"bankName\":{\"number\":\"" + ACCOUNT_NUMBER + "\"},\"accountName\":\"S\","
                + "\"accountNumber\":\"" + ACCOUNT_NUMBER + "\"}").andExpect(status().isBadRequest());
        // JSON เสีย: ตัวเลขที่ขึ้นต้นด้วยศูนย์ไม่ใช่ตัวเลข JSON ที่ถูกต้อง
        putBankAccount("{\"bankName\":\"K\",\"accountName\":\"S\",\"accountNumber\":\"" + ACCOUNT_NUMBER
                + "\",\"promptPayId\":0917300155}").andExpect(status().isBadRequest());

        putBankAccount(account(ACCOUNT_NUMBER, PROMPT_PAY)).andExpect(status().isOk());
        long receiptId = issueReceipt();
        mockMvc.perform(get("/api/receipts/{id}", receiptId)).andExpect(status().isOk());
        mockMvc.perform(get("/api/receipts").param("status", "PENDING")).andExpect(status().isOk());
        mockMvc.perform(get("/api/receipts/{id}/pdf", receiptId)).andExpect(status().isOk());
        mockMvc.perform(post("/api/receipts/send")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"receiptIds\":[" + receiptId + "]}"))
                .andExpect(status().isOk());
        mockMvc.perform(get("/api/apartment-config")).andExpect(status().isOk());

        assertThat(mailSender.sent()).as("ทางเดินปกติต้องไปถึงการส่งอีเมลจริง").hasSize(1);
        assertThat(logs.list).as("ต้องจับ log ได้จริง ไม่งั้นเทสนี้ผ่านเพราะไม่มีอะไรให้ดู").isNotEmpty();
        for (ILoggingEvent event : logs.list) {
            assertThat(textOf(event))
                    .as("log จาก %s", event.getLoggerName())
                    .doesNotContain(SECRETS);
        }
    }

    private long issueReceipt() throws Exception {
        tenant = tenantRepository.saveAndFlush(
                new Tenant("มานี รักเรียน", "2600000000001", null, "082-260-0001", "manee.privacy@example.com"));
        String lease = mockMvc.perform(post("/api/leases")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(LEASE_BODY.formatted(roomId("212"), tenant.getId())))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        long leaseId = ((Number) JsonPath.read(lease, "$.id")).longValue();
        String receipt = mockMvc.perform(post("/api/receipts")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"leaseId\":%d,\"billingMonth\":\"2026-09\",\"electricUnits\":0,\"waterUnits\":7.5}"
                                .formatted(leaseId)))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return ((Number) JsonPath.read(receipt, "$.id")).longValue();
    }

    private ResultActions putBankAccount(String body) throws Exception {
        return mockMvc.perform(put("/api/apartment-config/bank-account")
                .contentType(MediaType.APPLICATION_JSON)
                .content(body));
    }

    private static String account(String accountNumber, String promptPayId) {
        return "{\"bankName\":\"Kasikornbank\",\"accountName\":\"Sakura Soul Apartment\","
                + "\"accountNumber\":\"%s\",\"promptPayId\":\"%s\"}".formatted(accountNumber, promptPayId);
    }

    /** ข้อความของ log รวมข้อความของ exception ทุกชั้นที่แนบมา */
    private static String textOf(ILoggingEvent event) {
        StringBuilder text = new StringBuilder(event.getFormattedMessage());
        for (IThrowableProxy cause = event.getThrowableProxy(); cause != null; cause = cause.getCause()) {
            text.append('\n').append(cause.getMessage());
        }
        return text.toString();
    }

    private long roomId(String roomNumber) {
        return roomRepository.findAllInLayoutOrder().stream()
                .filter(room -> room.getRoomNumber().equals(roomNumber))
                .map(Room::getId)
                .findFirst()
                .orElseThrow();
    }
}
