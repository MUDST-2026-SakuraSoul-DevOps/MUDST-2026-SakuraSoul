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

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * migrate V16 บนฐานที่มีข้อมูลจริงอยู่แล้ว (เกณฑ์ตรวจของ SSK-160 กับ SSK-180)
 * <p>
 * เทสอื่นทั้งหมดเริ่มจากฐานเปล่าที่ migrate ทีเดียวถึงเวอร์ชันล่าสุด จึงไม่เคยมีสัญญาให้ V16 backfill เลย
 * ตัวนี้ยก PostgreSQL แยกของตัวเอง migrate ถึง V15 ใส่ข้อมูลแบบที่ฐาน dev กับ k8s มีจริง (ผู้เช่า สัญญาที่ยัง
 * ACTIVE กับที่ปิดแล้ว ใบเสร็จ ใบแจ้งซ่อม รอบแจ้งเตือนทั้งแบบมีห้องและไม่มีห้อง) แล้วค่อย migrate ต่อ
 * <p>
 * ไม่ใช้ Spring context เพราะต้องคุมจังหวะ migrate เอง ถ้าเปิด context Flyway จะ migrate ถึงล่าสุดทันทีตอนสตาร์ต
 */
@EnabledIf("dockerAvailable")
class V16MigrationIntegrationTest {

    private static PostgreSQLContainer postgres;
    private static DriverManagerDataSource dataSource;
    private static JdbcTemplate jdbc;

    private static long activeLeaseId;
    private static long endedLeaseId;

    static boolean dockerAvailable() {
        return DockerClientFactory.instance().isDockerAvailable();
    }

    @BeforeAll
    static void migrateAPopulatedV15DatabaseToTheLatestVersion() {
        postgres = new PostgreSQLContainer(DockerImageName.parse("postgres:17-alpine"));
        postgres.start();
        dataSource = new DriverManagerDataSource(postgres.getJdbcUrl(), postgres.getUsername(), postgres.getPassword());
        jdbc = new JdbcTemplate(dataSource);

        flyway().target("15").load().migrate();

        long yuki = jdbc.queryForObject("""
                INSERT INTO tenant (full_name, national_id, phone, line_id, email, created_at)
                VALUES ('ยูกิ ทานากะ', '1100000000001', '081-000-0001', 'yuki.t', NULL, now())
                RETURNING id""", Long.class);
        long somchai = jdbc.queryForObject("""
                INSERT INTO tenant (full_name, national_id, phone, line_id, email, created_at)
                VALUES ('สมชาย ใจดี', '1100000000002', '081-000-0002', NULL, NULL, now())
                RETURNING id""", Long.class);

        // ห้อง id 1 คือ 101 (SINGLE ชั้น 1) กับ id 13 คือ 201 (DOUBLE ชั้น 2) ตามลำดับที่ V2 ใส่ไว้
        activeLeaseId = insertLease(1L, yuki, "2026-09-01", null, "ACTIVE");
        endedLeaseId = insertLease(13L, somchai, "2025-01-01", "2025-12-31", "ENDED");

        jdbc.update("""
                INSERT INTO receipt (receipt_no, lease_id, billing_month, electric_units, water_units,
                    monthly_rent, electric_rate_per_unit, water_rate_per_unit, common_area_fee, internet_fee,
                    electric_amount, water_amount, total_amount, due_date)
                VALUES ('INV-202609-0001', ?, DATE '2026-09-01', 120, 15,
                    3500, 8, 18, 300, 250, 960, 270, 5280, DATE '2026-09-05')""", activeLeaseId);
        jdbc.update("INSERT INTO maintenance_ticket (room_id, title) VALUES (2, 'Leaking tap')");
        jdbc.update("""
                INSERT INTO maintenance_reminder (name, frequency, start_date, next_due_date, room_id)
                VALUES ('Air filter', 'MONTHLY', DATE '2026-09-01', DATE '2026-10-01', 3)""");
        jdbc.update("""
                INSERT INTO maintenance_reminder (name, frequency, start_date, next_due_date, room_id)
                VALUES ('Fire extinguisher check', 'ANNUAL', DATE '2026-01-01', DATE '2027-01-01', NULL)""");

        flyway().load().migrate();
    }

    @AfterAll
    static void stopDatabase() {
        if (postgres != null) {
            postgres.stop();
        }
    }

    @Test
    @DisplayName("V16 ต้องรันสำเร็จบนฐาน V15 ที่มีข้อมูล และข้อมูลเดิมยังอยู่ครบทุกแถว")
    void migrationSucceedsAndKeepsEveryRow() {
        assertThat(jdbc.queryForObject(
                "SELECT success FROM flyway_schema_history WHERE version = '16'", Boolean.class)).isTrue();

        assertThat(count("room")).isEqualTo(24);
        assertThat(count("tenant")).isEqualTo(2);
        assertThat(count("lease")).isEqualTo(2);
        assertThat(count("receipt")).isEqualTo(1);
        assertThat(count("maintenance_ticket")).isEqualTo(1);
        assertThat(count("maintenance_reminder")).isEqualTo(2);
    }

    @Test
    @DisplayName("SSK-160 ผังตั้งต้นต้องเป็น 2 ชั้น ชั้นละ 12 ห้อง ตรงกับห้องที่ V2 ใส่ไว้")
    void seedsTheDefaultBuildingLayout() {
        Map<String, Object> config = jdbc.queryForMap("SELECT id, floors, rooms_per_floor FROM building_config");

        assertThat(((Number) config.get("id")).intValue()).isEqualTo(1);
        assertThat(((Number) config.get("floors")).intValue()).isEqualTo(2);
        assertThat(((Number) config.get("rooms_per_floor")).intValue()).isEqualTo(12);
    }

    @Test
    @DisplayName("SSK-180 สัญญาเดิมทั้ง ACTIVE และที่ปิดแล้วต้องได้สำเนาห้องกับผู้เช่าตรงกับข้อมูล ณ วัน migrate")
    void backfillsTheSnapshotOfEveryExistingLease() {
        Map<String, Object> active = snapshotOf(activeLeaseId);
        assertThat(active.get("room_number_snapshot")).isEqualTo("101");
        assertThat(((Number) active.get("room_floor_snapshot")).intValue()).isEqualTo(1);
        assertThat(active.get("room_type_snapshot")).isEqualTo("SINGLE");
        assertThat(active.get("tenant_name_snapshot")).isEqualTo("ยูกิ ทานากะ");
        assertThat(active.get("tenant_national_id_snapshot")).isEqualTo("1100000000001");
        assertThat(active.get("tenant_phone_snapshot")).isEqualTo("081-000-0001");
        assertThat(active.get("tenant_line_id_snapshot")).isEqualTo("yuki.t");
        assertThat(((Number) active.get("contract_template_version")).intValue()).isEqualTo(1);

        Map<String, Object> ended = snapshotOf(endedLeaseId);
        assertThat(ended.get("room_number_snapshot")).isEqualTo("201");
        assertThat(((Number) ended.get("room_floor_snapshot")).intValue()).isEqualTo(2);
        assertThat(ended.get("room_type_snapshot")).isEqualTo("DOUBLE");
        assertThat(ended.get("tenant_name_snapshot")).isEqualTo("สมชาย ใจดี");
        // LINE ว่างได้ตั้งแต่ V10 สำเนาก็ว่างตาม
        assertThat(ended.get("tenant_line_id_snapshot")).isNull();
    }

    @Test
    @DisplayName("SSK-160 หลัง V16 ใส่ห้องชั้น 3 ได้แล้ว แต่เลขห้องซ้ำยังโดน room_number_uk และชั้น 0 ยังใส่ไม่ได้")
    void roomRulesAfterTheMigration() {
        try {
            jdbc.update("INSERT INTO room (room_number, floor, room_type) VALUES ('399', 3, 'SINGLE')");
            assertThat(count("room")).isEqualTo(25);

            assertThatThrownBy(() -> jdbc.update(
                    "INSERT INTO room (room_number, floor, room_type) VALUES ('101', 1, 'SINGLE')"))
                    .isInstanceOf(DataIntegrityViolationException.class)
                    .hasMessageContaining("room_number_uk");
            assertThatThrownBy(() -> jdbc.update(
                    "INSERT INTO room (room_number, floor, room_type) VALUES ('001', 0, 'SINGLE')"))
                    .isInstanceOf(DataIntegrityViolationException.class)
                    .hasMessageContaining("room_floor_ck");
        } finally {
            // เทสอื่นในคลาสนี้นับห้องว่ายังเป็น 24 ห้องเท่าเดิม
            jdbc.update("DELETE FROM room WHERE room_number = '399'");
        }
    }

    @Test
    @DisplayName("SSK-180 สัญญาที่ไม่มีสำเนาต้องใส่ฐานไม่ได้ ดีกว่าได้สัญญาที่พิมพ์ช่องว่างออกมา")
    void aLeaseWithoutASnapshotIsRejected() {
        long tenant = jdbc.queryForObject(
                "SELECT id FROM tenant WHERE national_id = '1100000000002'", Long.class);

        assertThatThrownBy(() -> jdbc.update("""
                INSERT INTO lease (room_id, tenant_id, start_date, monthly_rent, billing_cycle, status,
                    security_deposit, electric_rate_per_unit, water_rate_per_unit, common_area_fee, internet_fee)
                VALUES (5, ?, DATE '2026-10-01', 3500, 'MONTHLY', 'ACTIVE', 0, 8, 18, 300, 250)""", tenant))
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("room_number_snapshot");
    }

    /** ใช้ไฟล์ migration ชุดเดียวกับที่แอปใช้จริง ไม่ได้คัดลอกมาไว้ฝั่งเทส */
    private static FluentConfiguration flyway() {
        return Flyway.configure().dataSource(dataSource).locations("classpath:db/migration");
    }

    private static long insertLease(long roomId, long tenantId, String start, String end, String status) {
        return jdbc.queryForObject("""
                INSERT INTO lease (room_id, tenant_id, start_date, end_date, monthly_rent, billing_cycle, status,
                    security_deposit, electric_rate_per_unit, water_rate_per_unit, common_area_fee, internet_fee)
                VALUES (?, ?, CAST(? AS DATE), CAST(? AS DATE), 3500, 'MONTHLY', ?, 7000, 8, 18, 300, 250)
                RETURNING id""", Long.class, roomId, tenantId, start, end, status);
    }

    private static Map<String, Object> snapshotOf(long leaseId) {
        return jdbc.queryForMap("""
                SELECT room_number_snapshot, room_floor_snapshot, room_type_snapshot, tenant_name_snapshot,
                       tenant_national_id_snapshot, tenant_phone_snapshot, tenant_line_id_snapshot,
                       contract_template_version
                FROM lease WHERE id = ?""", leaseId);
    }

    private static int count(String table) {
        return jdbc.queryForObject("SELECT count(*) FROM " + table, Integer.class);
    }
}
