package com.sakurasoul.apartment.maintenance;

import com.jayway.jsonpath.JsonPath;
import com.sakurasoul.apartment.RecordingMailSender;
import com.sakurasoul.apartment.TestcontainersConfiguration;
import jakarta.mail.Message;
import jakarta.mail.internet.InternetAddress;
import jakarta.mail.internet.MimeMessage;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIf;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.core.env.Environment;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.DockerClientFactory;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * งานแจ้งเตือนของใกล้หมด (SSK-171) ทะลุถึง PostgreSQL ตัวจริง ส่งอีเมลเข้าตัวส่งปลอม (RecordingMailSender)
 * <p>
 * สิ่งที่พิสูจน์ได้เฉพาะชั้นนี้คือ SQL ทั้งสามขั้นใน LowStockAlerts: ON CONFLICT บน partial unique index,
 * การปิดแถวของของที่ฟื้นแล้ว และ FOR UPDATE SKIP LOCKED ที่กันสอง pod ส่งซ้ำ
 * เทสเรียก LowStockAlertService.run ตรง ๆ ด้วยเวลาที่กำหนดเอง งานตั้งเวลาตัวจริงอยู่ใน context นี้ด้วย
 * แต่ตื่นแค่แปดโมงเช้าตามเวลาไทย
 * <p>
 * งานนี้ดูของทุกชิ้นในคลัง เทสจึงล้างของทั้งก่อนและหลังทุกเทส แถวแจ้งเตือนหายไปกับตัวของ (ON DELETE CASCADE)
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
@EnabledIf("dockerAvailable")
@WithMockUser
class LowStockAlertApiTest {

    /** แปดโมงเช้าเวลาไทยของสามวันติดกัน เป็นแค่เวลาที่ประทับลงแถว ไม่มีผลกับว่าจะส่งอะไร */
    private static final Instant DAY_1 = Instant.parse("2026-11-10T01:00:00Z");
    private static final Instant DAY_2 = DAY_1.plus(1, ChronoUnit.DAYS);
    private static final Instant DAY_3 = DAY_2.plus(1, ChronoUnit.DAYS);

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private LowStockAlertService alertService;

    @Autowired
    private RecordingMailSender mailSender;

    @Autowired
    private JdbcTemplate jdbc;

    @Autowired
    private Environment environment;

    @Autowired
    private SupplyItemRepository supplyRepository;

    @Autowired
    private SupplyRestockRepository restockRepository;

    @Autowired
    private SupplyAdjustmentRepository adjustmentRepository;

    static boolean dockerAvailable() {
        return DockerClientFactory.instance().isDockerAvailable();
    }

    @BeforeEach
    void startEmpty() {
        clearSupplies();
    }

    @AfterEach
    void cleanUp() {
        clearSupplies();
    }

    @Test
    @DisplayName("SSK-171 ของที่เพิ่งใกล้หมดได้อีเมลสรุปฉบับเดียว วิกฤตที่สุดก่อน วันถัดไปยังใกล้หมดอยู่ไม่ได้อีเมลซ้ำ")
    void newlyLowItemsAreEmailedOnceInOneSummary() throws Exception {
        long bulbs = createSupply("LED Bulbs 60W", "EL-901", 5, 5, 50);
        long filters = createSupply("Air Filters 16x20x1", "HV-901", 0, 20, 60);
        createSupply("Copper Pipe Fittings", "PL-901", 85, 30, 120);

        assertThat(alertService.run(DAY_1)).isEqualTo(2);

        assertThat(mailSender.sent()).hasSize(1);
        MimeMessage mail = mailSender.sent().get(0);
        assertThat(mail.getSubject()).isEqualTo("Low stock: 2 items need restocking");
        assertThat(((InternetAddress) mail.getRecipients(Message.RecipientType.TO)[0]).getAddress())
                .isEqualTo("admin@sakura-soul.local");
        // เท่าขั้นต่ำพอดีก็อยู่ในอีเมล ของที่ยังพอไม่อยู่
        assertThat(bodyOf(mail))
                .containsSubsequence("- Air Filters 16x20x1 (HV-901): 0 left, minimum 20",
                        "- LED Bulbs 60W (EL-901): 5 left, minimum 5")
                .doesNotContain("Copper Pipe Fittings");

        assertThat(alertService.run(DAY_2)).isZero();
        assertThat(mailSender.sent()).hasSize(1);
        assertThat(alertsOf(filters)).containsExactly(new Alert(DAY_1, DAY_1, null));
        assertThat(alertsOf(bulbs)).containsExactly(new Alert(DAY_1, DAY_1, null));
    }

    @Test
    @DisplayName("SSK-171 เติมจนพ้นเกณฑ์แล้วกลับมาใกล้หมดอีก แถวเดิมถูกปิดและได้อีเมลใหม่")
    void anItemThatRecoversAndDropsAgainIsEmailedAgain() throws Exception {
        long bulbs = createSupply("LED Bulbs 60W", "EL-902", 5, 5, 50);
        assertThat(alertService.run(DAY_1)).isEqualTo(1);

        mockMvc.perform(post("/api/supplies/{id}/restock", bulbs)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"quantity":20}"""))
                .andExpect(status().isOk());
        assertThat(alertService.run(DAY_2)).isZero();
        assertThat(alertsOf(bulbs)).containsExactly(new Alert(DAY_1, DAY_1, DAY_2));

        mockMvc.perform(put("/api/supplies/{id}", bulbs)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(supplyBody("LED Bulbs 60W", "EL-902", 3, 5, 50)))
                .andExpect(status().isOk());
        assertThat(alertService.run(DAY_3)).isEqualTo(1);

        assertThat(mailSender.sent()).hasSize(2);
        assertThat(bodyOf(mailSender.sent().get(1))).contains("- LED Bulbs 60W (EL-902): 3 left, minimum 5");
        assertThat(alertsOf(bulbs)).containsExactly(new Alert(DAY_1, DAY_1, DAY_2), new Alert(DAY_3, DAY_3, null));
    }

    @Test
    @DisplayName("SSK-171 เมลเซิร์ฟเวอร์ล่ม แถวยังไม่ถูกประทับว่าส่งแล้ว รอบถัดไปส่งใหม่ด้วยแถวเดิม")
    void aFailedSendIsRetriedOnTheNextRun() throws Exception {
        long filters = createSupply("Air Filters 16x20x1", "HV-903", 0, 20, 60);
        mailSender.failAfter(0);

        assertThat(alertService.run(DAY_1)).isZero();
        assertThat(mailSender.sent()).isEmpty();
        assertThat(alertsOf(filters)).containsExactly(new Alert(DAY_1, null, null));

        mailSender.reset();
        assertThat(alertService.run(DAY_2)).isEqualTo(1);
        assertThat(mailSender.sent()).hasSize(1);
        assertThat(alertsOf(filters)).containsExactly(new Alert(DAY_1, DAY_2, null));
    }

    /** สอง pod ตื่นในวินาทีเดียวกัน ปล่อยพร้อมกันด้วย CountDownLatch แบบเดียวกับ BillingScheduleApiTest */
    @Test
    @DisplayName("SSK-171 สอง pod รันพร้อมกัน ได้อีเมลฉบับเดียวที่มีครบทุกรายการ ของแต่ละชิ้นมีแถวเดียว")
    void twoPodsRunningTogetherSendOneEmail() throws Exception {
        long filters = createSupply("Air Filters 16x20x1", "HV-904", 0, 20, 60);
        long bulbs = createSupply("LED Bulbs 60W", "EL-904", 2, 5, 50);

        CountDownLatch start = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(2);
        List<Integer> emailed = new ArrayList<>();
        try {
            List<Future<Integer>> results = new ArrayList<>();
            for (int i = 0; i < 2; i++) {
                results.add(pool.submit(() -> {
                    start.await();
                    return alertService.run(DAY_1);
                }));
            }
            start.countDown();
            for (Future<Integer> result : results) {
                emailed.add(result.get(60, TimeUnit.SECONDS));
            }
        } finally {
            pool.shutdownNow();
        }

        assertThat(emailed).containsExactlyInAnyOrder(2, 0);
        assertThat(mailSender.sent()).hasSize(1);
        assertThat(alertsOf(filters)).containsExactly(new Alert(DAY_1, DAY_1, null));
        assertThat(alertsOf(bulbs)).containsExactly(new Alert(DAY_1, DAY_1, null));
    }

    /**
     * เทสข้างบนหวังให้สองเธรดชนกันเอง เทสนี้บังคับให้ชนแน่ ๆ pod แรกค้างอยู่ในขั้นส่งขณะถือล็อกของแถวไว้
     * แล้ว pod ที่สองรันทั้งรอบ ถ้าไม่มีล็อก pod ที่สองจะได้แถวเดิมไปส่งซ้ำ ถ้าล็อกแต่ไม่ SKIP LOCKED pod ที่สองจะรอ
     * จนเกินสิบวินาที ทั้งสองแบบเทสนี้แดง
     */
    @Test
    @DisplayName("SSK-171 ระหว่างที่ pod แรกยังส่งไม่เสร็จ pod ที่สองข้ามแถวที่ถูกล็อกทันที ไม่รอและไม่ส่งซ้ำ")
    void aSecondPodSkipsTheRowsThatAreBeingSent() throws Exception {
        long filters = createSupply("Air Filters 16x20x1", "HV-906", 0, 20, 60);
        long bulbs = createSupply("LED Bulbs 60W", "EL-906", 2, 5, 50);
        CountDownLatch sending = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        mailSender.holdNextSend(sending, release);

        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            Future<Integer> firstPod = pool.submit(() -> alertService.run(DAY_1));
            assertThat(sending.await(30, TimeUnit.SECONDS)).isTrue();

            Future<Integer> secondPod = pool.submit(() -> alertService.run(DAY_1));
            assertThat(secondPod.get(10, TimeUnit.SECONDS)).isZero();

            release.countDown();
            assertThat(firstPod.get(30, TimeUnit.SECONDS)).isEqualTo(2);
        } finally {
            release.countDown();
            pool.shutdownNow();
        }

        assertThat(mailSender.sent()).hasSize(1);
        assertThat(alertsOf(filters)).containsExactly(new Alert(DAY_1, DAY_1, null));
        assertThat(alertsOf(bulbs)).containsExactly(new Alert(DAY_1, DAY_1, null));
    }

    @Test
    @DisplayName("SSK-171 ลบของที่เคยแจ้งเตือนแล้วได้ แถวแจ้งเตือนหายตามไปด้วย")
    void deletingAnAlertedItemRemovesItsAlerts() throws Exception {
        long filters = createSupply("Air Filters 16x20x1", "HV-905", 0, 20, 60);
        assertThat(alertService.run(DAY_1)).isEqualTo(1);

        mockMvc.perform(delete("/api/supplies/{id}", filters))
                .andExpect(status().isNoContent());

        assertThat(alertsOf(filters)).isEmpty();
    }

    @Test
    @DisplayName("SSK-171 ค่าตั้งต้นใน application.yml ตรวจแปดโมงเช้า ส่งถึง admin@sakura-soul.local")
    void defaultsComeFromApplicationYml() {
        assertThat(environment.getProperty("app.supplies.low-stock-alert-cron")).isEqualTo("0 0 8 * * *");
        assertThat(environment.getProperty("app.supplies.low-stock-alert-to")).isEqualTo("admin@sakura-soul.local");
    }

    /** ลบตามลำดับ foreign key ประวัติการเติมและการปรับยอดก่อน แล้วตัวของ ส่วนแถวแจ้งเตือนฐานข้อมูลลบให้ */
    private void clearSupplies() {
        restockRepository.deleteAll();
        adjustmentRepository.deleteAll();
        supplyRepository.deleteAll();
        mailSender.reset();
    }

    private long createSupply(String name, String sku, int stock, int minStock, int maxStock) throws Exception {
        String json = mockMvc.perform(post("/api/supplies")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(supplyBody(name, sku, stock, minStock, maxStock)))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return ((Number) JsonPath.read(json, "$.id")).longValue();
    }

    private static String supplyBody(String name, String sku, int stock, int minStock, int maxStock) {
        return """
                {"name":"%s","sku":"%s","category":"Supplies","stock":%d,"minStock":%d,"maxStock":%d}"""
                .formatted(name, sku, stock, minStock, maxStock);
    }

    private static String bodyOf(MimeMessage mail) throws Exception {
        return ((String) mail.getContent()).replace("\r\n", "\n");
    }

    private List<Alert> alertsOf(long supplyId) {
        return jdbc.query("SELECT crossed_at, sent_at, recovered_at FROM low_stock_alert WHERE supply_id = ? ORDER BY id",
                (row, number) -> new Alert(instant(row, "crossed_at"), instant(row, "sent_at"),
                        instant(row, "recovered_at")),
                supplyId);
    }

    private static Instant instant(ResultSet row, String column) throws SQLException {
        OffsetDateTime value = row.getObject(column, OffsetDateTime.class);
        return value == null ? null : value.toInstant();
    }

    /** แถวหนึ่งของ low_stock_alert เท่าที่เทสต้องดู */
    private record Alert(Instant crossedAt, Instant sentAt, Instant recoveredAt) {
    }
}
