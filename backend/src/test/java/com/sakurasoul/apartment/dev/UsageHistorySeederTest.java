package com.sakurasoul.apartment.dev;

import com.sakurasoul.apartment.TestcontainersConfiguration;
import com.sakurasoul.apartment.billing.PaymentService;
import com.sakurasoul.apartment.billing.ReceiptService;
import com.sakurasoul.apartment.lease.BillingCycle;
import com.sakurasoul.apartment.lease.LeaseDtos.LeaseRequest;
import com.sakurasoul.apartment.lease.LeaseService;
import com.sakurasoul.apartment.room.Room;
import com.sakurasoul.apartment.room.RoomRepository;
import com.sakurasoul.apartment.tenant.Tenant;
import com.sakurasoul.apartment.tenant.TenantRepository;
import com.sakurasoul.apartment.tenant.TenantService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIf;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.testcontainers.DockerClientFactory;

import java.time.LocalDate;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * ข้อมูลตัวอย่างสามปีของ SSK-181 ทำงานจริงกับ PostgreSQL ทั้ง SQL ตรงและ service จริง
 * <p>
 * UsageHistorySeeder เป็น bean เฉพาะโปรไฟล์ dev เทสจึงประกอบเองจาก bean จริง ถ้าคอลัมน์หรือกฎของใบเสร็จเปลี่ยน
 * seeder จะ log แล้วข้ามห้องเงียบ ๆ ตอนสตาร์ต เทสนี้คือตัวที่จับได้
 * ลบทุกอย่างที่สร้างหลังจบ (ผู้เช่าเลขบัตรขึ้นต้น 900000000000 กับสัญญา ใบเสร็จ การชำระ และค่ามิเตอร์ของสัญญาเหล่านั้น)
 */
@SpringBootTest
@Import(TestcontainersConfiguration.class)
@EnabledIf("dockerAvailable")
class UsageHistorySeederTest {

    @Autowired
    private TenantRepository tenantRepository;

    @Autowired
    private TenantService tenantService;

    @Autowired
    private RoomRepository roomRepository;

    @Autowired
    private LeaseService leaseService;

    @Autowired
    private ReceiptService receiptService;

    @Autowired
    private PaymentService paymentService;

    @Autowired
    private JdbcClient jdbc;

    private UsageHistorySeeder seeder;

    static boolean dockerAvailable() {
        return DockerClientFactory.instance().isDockerAvailable();
    }

    @BeforeEach
    void createSeeder() {
        seeder = new UsageHistorySeeder(tenantRepository, tenantService, roomRepository, leaseService, receiptService,
                paymentService, jdbc);
    }

    @AfterEach
    void clearHistory() {
        String leases = "SELECT l.id FROM lease l JOIN tenant t ON t.id = l.tenant_id"
                + " WHERE t.national_id LIKE '900000000000%' OR t.national_id = '3400000000001'";
        jdbc.sql("DELETE FROM payment_allocation WHERE lease_id IN (" + leases + ")").update();
        jdbc.sql("DELETE FROM payment WHERE lease_id IN (" + leases + ")").update();
        jdbc.sql("DELETE FROM receipt_line WHERE lease_id IN (" + leases + ")").update();
        jdbc.sql("DELETE FROM receipt WHERE lease_id IN (" + leases + ")").update();
        jdbc.sql("DELETE FROM lease_extra_charge WHERE lease_id IN (" + leases + ")").update();
        jdbc.sql("""
                DELETE FROM meter_reading m USING lease l, tenant t
                WHERE l.room_id = m.room_id AND t.id = l.tenant_id AND t.national_id LIKE '900000000000%'
                  AND m.reading_month BETWEEN date_trunc('month', l.start_date) AND l.end_date""").update();
        jdbc.sql("DELETE FROM lease WHERE id IN (" + leases + ")").update();
        jdbc.sql("DELETE FROM tenant WHERE national_id LIKE '900000000000%' OR national_id = '3400000000001'")
                .update();
    }

    @Test
    @DisplayName("SSK-181 หกห้อง สัญญาปิดแล้ว ใบเสร็จจ่ายครบ วันที่เป็นอดีตจริง เลขที่ใบใช้ปีของรอบบิล seed ซ้ำไม่ทำอะไร")
    void seedsThreeYearsOnce() {
        assertThat(seeder.seed()).isEqualTo(6);

        assertThat(count("SELECT count(*) FROM lease l JOIN tenant t ON t.id = l.tenant_id "
                + "WHERE t.national_id LIKE '900000000000%' AND l.status = 'ENDED'")).isEqualTo(6);
        String receipts = "FROM receipt r JOIN lease l ON l.id = r.lease_id JOIN tenant t ON t.id = l.tenant_id "
                + "WHERE t.national_id LIKE '900000000000%'";
        assertThat(count("SELECT count(*) " + receipts)).isEqualTo(72);
        assertThat(count("SELECT count(*) " + receipts + " AND (r.status <> 'PAID' OR r.previous_balance <> 0)"))
                .isZero();
        assertThat(count("SELECT count(*) " + receipts
                + " AND r.receipt_no !~ ('^RC-' || EXTRACT(YEAR FROM r.billing_month) || '-H[0-9]{4}$')"))
                .isZero();
        assertThat(count("SELECT count(*) " + receipts
                + " AND (r.issued_at AT TIME ZONE 'Asia/Bangkok')::date <> (r.billing_month + INTERVAL '1 month')::date"))
                .isZero();
        String payments = "FROM payment p JOIN receipt r ON r.id = p.receipt_id JOIN lease l ON l.id = p.lease_id "
                + "JOIN tenant t ON t.id = l.tenant_id WHERE t.national_id LIKE '900000000000%'";
        assertThat(count("SELECT count(*) " + payments)).isEqualTo(72);
        assertThat(count("SELECT count(*) " + payments + " AND p.paid_on >= current_date - 1")).isZero();
        assertThat(count("SELECT count(*) FROM meter_reading m JOIN lease l ON l.room_id = m.room_id "
                + "JOIN tenant t ON t.id = l.tenant_id WHERE t.national_id LIKE '900000000000%'")).isGreaterThan(150);

        assertThat(seeder.seed()).as("seed ครั้งที่สอง").isZero();
        assertThat(count("SELECT count(*) " + receipts)).isEqualTo(72);
    }

    @Test
    @DisplayName("SSK-181 ห้องที่มีสัญญาอื่นทับช่วงถูกข้ามก่อนสร้างอะไร แล้วได้ประวัติเมื่อห้องว่างในรอบถัดไป")
    void anOccupiedRoomIsRetriedLater() {
        Room room108 = roomRepository.findAllInLayoutOrder().stream()
                .filter(room -> room.getRoomNumber().equals("108")).findFirst().orElseThrow();
        Tenant someone = tenantRepository.saveAndFlush(
                new Tenant("ผู้ใช้ สร้างเอง", "3400000000001", null, "082-340-0001", null));
        leaseService.create(new LeaseRequest(room108.getId(), someone.getId(), LocalDate.of(2025, 1, 1), null,
                null, BillingCycle.MONTHLY, null, null, null, null, null));

        assertThat(seeder.seed()).isEqualTo(5);
        assertThat(tenantRepository.existsByNationalId(UsageHistorySeeder.nationalIdOf(1))).isFalse();

        jdbc.sql("DELETE FROM lease WHERE tenant_id = :tenant").param("tenant", someone.getId()).update();
        assertThat(seeder.seed()).isEqualTo(1);
        assertThat(tenantRepository.existsByNationalId(UsageHistorySeeder.nationalIdOf(1))).isTrue();
    }

    private long count(String sql) {
        return jdbc.sql(sql).query(Long.class).single();
    }
}
