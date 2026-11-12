package com.sakurasoul.apartment;

import org.flywaydb.core.Flyway;
import org.flywaydb.core.api.configuration.FluentConfiguration;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIf;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.testcontainers.DockerClientFactory;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * migrate V21 บนฐานที่มีใบเสร็จอยู่แล้ว (SSK-163, SSK-164)
 * <p>
 * ยก PostgreSQL แยกของตัวเอง migrate ถึง V20 ใส่ใบเสร็จแบบที่ฐานจริงมีได้ก่อน Phase 2 แล้วค่อย migrate ต่อ
 * (แบบเดียวกับ V16MigrationIntegrationTest) ใบเหล่านั้นคือ
 * <ul>
 *   <li>สัญญา A: ใบ ก.ย. จ่ายแล้วด้วยข้อความ "Cash" ตอน 23:30 UTC (เป็นวันถัดไปตามเวลาไทย) กับใบ ต.ค. ยังค้าง</li>
 *   <li>สัญญา B: ค้างสองใบ ก.ย. กับ ต.ค.</li>
 *   <li>สัญญา C (ปิดแล้ว): ใบ ส.ค. ค้าง แต่ใบ ก.ย. จ่ายก่อน (จ่ายข้ามใบ ซึ่งก่อน V21 ทำได้)</li>
 *   <li>สัญญา D: ใบยอดศูนย์ที่ยังรอชำระ</li>
 * </ul>
 */
@EnabledIf("dockerAvailable")
class V21MigrationIntegrationTest {

    private static PostgreSQLContainer postgres;
    private static DriverManagerDataSource dataSource;
    private static JdbcTemplate jdbc;

    private static long leaseA;
    private static long leaseB;
    private static long leaseC;
    private static long paidSeptemberA;
    private static long pendingOctoberA;
    private static long septemberB;
    private static long octoberB;
    private static long augustC;
    private static long septemberC;
    private static long zeroD;

    static boolean dockerAvailable() {
        return DockerClientFactory.instance().isDockerAvailable();
    }

    @BeforeAll
    static void migrateAV20DatabaseWithReceipts() {
        postgres = new PostgreSQLContainer(DockerImageName.parse("postgres:17-alpine"));
        postgres.start();
        dataSource = new DriverManagerDataSource(postgres.getJdbcUrl(), postgres.getUsername(), postgres.getPassword());
        jdbc = new JdbcTemplate(dataSource);

        flyway().target("20").load().migrate();

        long tenant = jdbc.queryForObject("""
                INSERT INTO tenant (full_name, national_id, phone, line_id, email, created_at)
                VALUES ('มานี รักเรียน', '1100000000021', '081-000-0021', NULL, NULL, now())
                RETURNING id""", Long.class);
        // ห้อง id 1, 2, 3, 13 คือ 101, 102, 103, 201 ตามลำดับที่ V2 ใส่ไว้ คนละห้อง สัญญาจึงไม่ทับกัน
        leaseA = insertLease(1L, tenant, "2026-09-01", null, "ACTIVE");
        leaseB = insertLease(13L, tenant, "2026-09-01", null, "ACTIVE");
        leaseC = insertLease(2L, tenant, "2026-08-01", "2026-09-30", "ENDED");
        long leaseD = insertLease(3L, tenant, "2026-10-01", null, "ACTIVE");

        paidSeptemberA = insertReceipt("RC-2026-0001", leaseA, "2026-09-01", "5280.00", "PAID",
                "2026-09-10T23:30:00Z", "Cash");
        pendingOctoberA = insertReceipt("RC-2026-0002", leaseA, "2026-10-01", "5300.00", "PENDING", null, null);
        septemberB = insertReceipt("RC-2026-0003", leaseB, "2026-09-01", "5000.00", "PENDING", null, null);
        octoberB = insertReceipt("RC-2026-0004", leaseB, "2026-10-01", "5100.00", "PENDING", null, null);
        augustC = insertReceipt("RC-2026-0005", leaseC, "2026-08-01", "4000.00", "PENDING", null, null);
        septemberC = insertReceipt("RC-2026-0006", leaseC, "2026-09-01", "4500.00", "PAID",
                "2026-10-03T03:00:00Z", null);
        zeroD = insertReceipt("RC-2026-0007", leaseD, "2026-10-01", "0.00", "PENDING", null, null);

        flyway().load().migrate();
    }

    @AfterAll
    static void stopDatabase() {
        if (postgres != null) {
            postgres.stop();
        }
    }

    @Test
    @DisplayName("V21 รันสำเร็จบนฐานที่มีใบเสร็จ สัญญาเดิมกับค่าตั้งได้ดอกเบี้ย 0.00 และวันผ่อนผัน 0")
    void migrationSucceedsAndOldLeasesChargeNoInterest() {
        assertThat(jdbc.queryForObject(
                "SELECT success FROM flyway_schema_history WHERE version = '21'", Boolean.class)).isTrue();
        assertThat(count("receipt")).isEqualTo(7);

        for (Map<String, Object> terms : jdbc.queryForList(
                "SELECT late_interest_percent_per_month, grace_days FROM lease")) {
            assertThat((BigDecimal) terms.get("late_interest_percent_per_month")).isEqualByComparingTo("0.00");
            assertThat(((Number) terms.get("grace_days")).intValue()).isZero();
        }
        Map<String, Object> config = jdbc.queryForMap(
                "SELECT late_interest_percent_per_month, grace_days FROM apartment_config");
        assertThat((BigDecimal) config.get("late_interest_percent_per_month")).isEqualByComparingTo("0.00");
        assertThat(((Number) config.get("grace_days")).intValue()).isZero();
    }

    @Test
    @DisplayName("ใบที่จ่ายแล้วได้การชำระหนึ่งก้อนเต็มยอด วันที่จ่ายเป็นวันตามเวลาไทย ช่องทาง OTHER และข้อความเดิมอยู่ใน note")
    void paidReceiptsGetOneFullPayment() {
        Map<String, Object> cash = paymentOf(paidSeptemberA);
        assertThat((BigDecimal) cash.get("amount")).isEqualByComparingTo("5280.00");
        // 23:30 UTC ของวันที่ 10 คือ 06:30 ของวันที่ 11 ตามเวลาไทย
        assertThat(cash.get("paid_on")).isEqualTo(java.sql.Date.valueOf(LocalDate.of(2026, 9, 11)));
        assertThat(cash.get("method")).isEqualTo("OTHER");
        assertThat(cash.get("note")).isEqualTo("Cash");
        assertThat(((java.sql.Timestamp) cash.get("recorded_at")).toInstant())
                .isEqualTo(OffsetDateTime.parse("2026-09-10T23:30:00Z").toInstant());
        assertThat(cash.get("voided_at")).isNull();

        Map<String, Object> allocation = jdbc.queryForMap(
                "SELECT receipt_id, interest_amount, principal_amount FROM payment_allocation WHERE payment_id = ?",
                cash.get("id"));
        assertThat(((Number) allocation.get("receipt_id")).longValue()).isEqualTo(paidSeptemberA);
        assertThat((BigDecimal) allocation.get("interest_amount")).isEqualByComparingTo("0.00");
        assertThat((BigDecimal) allocation.get("principal_amount")).isEqualByComparingTo("5280.00");

        // ใบที่จ่ายแล้วโดยไม่มีข้อความช่องทาง note ว่าง ยอดของการชำระคือยอดก่อนถูกยกยอดมาเพิ่ม
        Map<String, Object> noMethod = paymentOf(septemberC);
        assertThat(noMethod.get("note")).isNull();
        assertThat((BigDecimal) noMethod.get("amount")).isEqualByComparingTo("4500.00");
        assertThat(count("payment")).isEqualTo(2);
    }

    @Test
    @DisplayName("ใบที่ไม่ถูกยกยอดเก็บตัวเลข วันที่จ่าย และช่องทางเดิมทุกค่า")
    void receiptsThatAreNotCarriedKeepTheirValues() {
        Map<String, Object> paid = receipt(paidSeptemberA);
        assertThat((BigDecimal) paid.get("total_amount")).isEqualByComparingTo("5280.00");
        assertThat(paid.get("status")).isEqualTo("PAID");
        assertThat(paid.get("payment_method")).isEqualTo("Cash");
        assertThat(((java.sql.Timestamp) paid.get("paid_at")).toInstant())
                .isEqualTo(OffsetDateTime.parse("2026-09-10T23:30:00Z").toInstant());
        assertThat((BigDecimal) paid.get("previous_balance")).isEqualByComparingTo("0.00");
        assertThat(paid.get("carried_to_receipt_id")).isNull();

        Map<String, Object> latestA = receipt(pendingOctoberA);
        assertThat((BigDecimal) latestA.get("total_amount")).isEqualByComparingTo("5300.00");
        assertThat(latestA.get("status")).isEqualTo("PENDING");
        assertThat(latestA.get("previous_balance_receipts")).isNull();
    }

    @Test
    @DisplayName("สัญญาที่ค้างสองใบ ใบเก่ายกเข้าใบล่าสุดโดยไม่มีดอกเบี้ย ใบเก่าชี้ไปใบล่าสุดและสถานะเดิม")
    void olderUnpaidReceiptsAreCarriedIntoTheLatest() {
        Map<String, Object> latest = receipt(octoberB);
        assertThat((BigDecimal) latest.get("previous_balance")).isEqualByComparingTo("5000.00");
        assertThat(latest.get("previous_balance_receipts")).isEqualTo("RC-2026-0003");
        assertThat((BigDecimal) latest.get("interest_amount")).isEqualByComparingTo("0.00");
        assertThat((BigDecimal) latest.get("total_amount")).isEqualByComparingTo("10100.00");
        assertThat(latest.get("status")).isEqualTo("PENDING");

        Map<String, Object> older = receipt(septemberB);
        assertThat(((Number) older.get("carried_to_receipt_id")).longValue()).isEqualTo(octoberB);
        assertThat(older.get("status")).isEqualTo("PENDING");
        assertThat((BigDecimal) older.get("total_amount")).isEqualByComparingTo("5000.00");
    }

    /** สถานะดูจากค่าใช้จ่ายของใบเอง ใบล่าสุดที่จ่ายแล้วจึงยัง PAID แต่บิลยังมียอดต้องจ่ายเท่าใบเก่าที่ค้าง */
    @Test
    @DisplayName("สัญญาที่จ่ายใบใหม่ก่อนใบเก่า ใบล่าสุดยัง PAID แต่ยอดของบิลรวมใบเก่าที่ค้าง")
    void aLatestPaidReceiptStillCarriesTheOlderDebt() {
        Map<String, Object> latest = receipt(septemberC);
        assertThat(latest.get("status")).isEqualTo("PAID");
        assertThat((BigDecimal) latest.get("previous_balance")).isEqualByComparingTo("4000.00");
        assertThat(latest.get("previous_balance_receipts")).isEqualTo("RC-2026-0005");
        assertThat((BigDecimal) latest.get("total_amount")).isEqualByComparingTo("8500.00");
        assertThat(((Number) receipt(augustC).get("carried_to_receipt_id")).longValue()).isEqualTo(septemberC);
    }

    @Test
    @DisplayName("ใบยอดศูนย์ที่ยังรอชำระกลายเป็น PAID ตั้งแต่เวลาที่ออก ไม่มีแถวการชำระ")
    void zeroReceiptsBecomePaidWithoutAPayment() {
        Map<String, Object> zero = receipt(zeroD);
        assertThat(zero.get("status")).isEqualTo("PAID");
        assertThat(zero.get("paid_at")).isEqualTo(zero.get("issued_at"));
        assertThat(jdbc.queryForObject("SELECT count(*) FROM payment WHERE receipt_id = ?", Integer.class, zeroD))
                .isZero();
    }

    /**
     * ข้อที่ระบบพึ่ง: balanceDue ของใบล่าสุด (ยอดบิลลบเงินที่บันทึกบนบิลนั้น) เท่ากับผลรวมยอดค้างของทุกใบในสัญญา
     * ยอดค้างของใบคือค่าใช้จ่ายกับดอกเบี้ยของใบเองลบเงินที่ถูกตัดเข้า ไม่รวมยอดยกมา
     */
    @Test
    @DisplayName("หลัง migrate ทุกสัญญา balanceDue ของใบล่าสุดเท่ากับผลรวมยอดค้างของทุกใบ")
    void everyLeaseIsBalanced() {
        List<Map<String, Object>> rows = jdbc.queryForList("""
                WITH settled AS (
                    SELECT a.receipt_id, sum(a.interest_amount + a.principal_amount) AS amount
                    FROM payment_allocation a JOIN payment p ON p.id = a.payment_id
                    WHERE p.voided_at IS NULL
                    GROUP BY a.receipt_id
                ), latest AS (
                    SELECT DISTINCT ON (lease_id) id, lease_id, total_amount
                    FROM receipt ORDER BY lease_id, billing_month DESC
                )
                SELECT l.lease_id,
                       l.total_amount - coalesce((SELECT sum(p.amount) FROM payment p
                                                  WHERE p.receipt_id = l.id AND p.voided_at IS NULL), 0) AS balance_due,
                       (SELECT sum(r.total_amount - r.previous_balance - coalesce(s.amount, 0))
                        FROM receipt r LEFT JOIN settled s ON s.receipt_id = r.id
                        WHERE r.lease_id = l.lease_id) AS outstanding
                FROM latest l""");

        assertThat(rows).hasSize(4);
        for (Map<String, Object> row : rows) {
            assertThat((BigDecimal) row.get("balance_due"))
                    .as("lease %s", row.get("lease_id"))
                    .isEqualByComparingTo((BigDecimal) row.get("outstanding"));
        }
    }

    @Test
    @DisplayName("ฐานข้อมูลไม่รับสถานะอื่น ดอกเบี้ยที่ไม่ตรงสูตร การชำระยอดศูนย์ วันจ่ายในอนาคต และการตัดข้ามสัญญา")
    void invalidRowsAreRejected() {
        assertThatThrownBy(() -> jdbc.update("UPDATE receipt SET status = 'VOID' WHERE id = ?", pendingOctoberA))
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("receipt_status_ck");
        assertThatThrownBy(() -> jdbc.update("""
                UPDATE receipt SET previous_balance = 3000, previous_balance_receipts = 'RC-2026-0001',
                    interest_principal = 3000, interest_rate_percent = 1.5, interest_amount = 40,
                    total_amount = total_amount + 3040
                WHERE id = ?""", pendingOctoberA))
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("receipt_interest_ck");
        assertThatThrownBy(() -> jdbc.update("""
                INSERT INTO payment (receipt_id, lease_id, amount, paid_on, method, recorded_at)
                VALUES (?, ?, 0, DATE '2026-10-01', 'CASH', now())""", pendingOctoberA, leaseA))
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("payment_amount_ck");
        assertThatThrownBy(() -> jdbc.update("""
                INSERT INTO payment (receipt_id, lease_id, amount, paid_on, method, recorded_at)
                VALUES (?, ?, 100, DATE '2026-10-02', 'CASH', TIMESTAMPTZ '2026-10-01T10:00:00+07:00')""",
                pendingOctoberA, leaseA))
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("payment_paid_on_ck");
        // การชำระของสัญญา A ตัดใบของสัญญา B ไม่ได้ foreign key คู่ (receipt_id, lease_id) ไม่ยอม
        long paymentA = ((Number) paymentOf(paidSeptemberA).get("id")).longValue();
        assertThatThrownBy(() -> jdbc.update("""
                INSERT INTO payment_allocation (payment_id, receipt_id, lease_id, interest_amount, principal_amount)
                VALUES (?, ?, ?, 0, 1)""", paymentA, octoberB, leaseA))
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("payment_allocation_receipt_fk");
    }

    /** ใช้ไฟล์ migration ชุดเดียวกับที่แอปใช้จริง ไม่ได้คัดลอกมาไว้ฝั่งเทส */
    private static FluentConfiguration flyway() {
        return Flyway.configure().dataSource(dataSource).locations("classpath:db/migration");
    }

    /** ฐานที่ V16 ขึ้นแล้วบังคับให้สัญญามีสำเนาห้องกับผู้เช่า ค่าในสำเนาไม่มีผลกับเทสนี้ */
    private static long insertLease(long roomId, long tenantId, String start, String end, String status) {
        return jdbc.queryForObject("""
                INSERT INTO lease (room_id, tenant_id, start_date, end_date, monthly_rent, billing_cycle, status,
                    security_deposit, electric_rate_per_unit, water_rate_per_unit, common_area_fee, internet_fee,
                    room_number_snapshot, room_floor_snapshot, room_type_snapshot, tenant_name_snapshot,
                    tenant_national_id_snapshot, tenant_phone_snapshot, contract_template_version)
                VALUES (?, ?, CAST(? AS DATE), CAST(? AS DATE), 3500, 'MONTHLY', ?, 7000, 8, 18, 300, 250,
                    'X', 1, 'SINGLE', 'มานี รักเรียน', '1100000000021', '081-000-0021', 1)
                RETURNING id""", Long.class, roomId, tenantId, start, end, status);
    }

    /** ยอดทั้งหมดใส่เป็นค่าเช่าบรรทัดเดียว V9 ไม่ได้บังคับว่ายอดรวมต้องเท่าผลรวมบรรทัด */
    private static long insertReceipt(String receiptNo, long leaseId, String month, String total, String status,
            String paidAt, String paymentMethod) {
        return jdbc.queryForObject("""
                INSERT INTO receipt (receipt_no, lease_id, billing_month, electric_units, water_units,
                    monthly_rent, electric_rate_per_unit, water_rate_per_unit, common_area_fee, internet_fee,
                    electric_amount, water_amount, total_amount, issued_at, due_date, status, paid_at, payment_method)
                VALUES (?, ?, CAST(? AS DATE), 0, 0, CAST(? AS NUMERIC), 8, 18, 0, 0, 0, 0, CAST(? AS NUMERIC),
                    CAST(? AS DATE) + INTERVAL '1 month', CAST(? AS DATE) + INTERVAL '1 month 4 days', ?,
                    CAST(? AS TIMESTAMPTZ), ?)
                RETURNING id""", Long.class, receiptNo, leaseId, month, total, total, month, month, status,
                paidAt, paymentMethod);
    }

    private static Map<String, Object> receipt(long id) {
        return jdbc.queryForMap("SELECT * FROM receipt WHERE id = ?", id);
    }

    private static Map<String, Object> paymentOf(long receiptId) {
        return jdbc.queryForMap("SELECT * FROM payment WHERE receipt_id = ?", receiptId);
    }

    private static int count(String table) {
        return jdbc.queryForObject("SELECT count(*) FROM " + table, Integer.class);
    }
}
