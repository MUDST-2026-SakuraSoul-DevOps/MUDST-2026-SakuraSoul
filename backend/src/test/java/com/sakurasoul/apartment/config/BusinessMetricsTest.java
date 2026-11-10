package com.sakurasoul.apartment.config;

import com.sakurasoul.apartment.TestcontainersConfiguration;
import io.micrometer.core.instrument.MeterRegistry;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.TestPropertySource;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

/**
 * เทสว่า metric เชิง business (SSK-184) ตรงกับข้อมูลในฐานข้อมูลจริง
 * <p>
 * วิธีพิสูจน์: อ่านค่าก่อน ใส่ข้อมูลที่รู้ตัวเลขแน่นอนเข้าไป อ่านอีกรอบ แล้วเทียบ "ส่วนต่าง"
 * ใช้ส่วนต่างไม่ใช่ค่าเต็ม เพราะเทสอื่นอาจทิ้งข้อมูลไว้ในฐานข้อมูลเดียวกัน
 * ตั้ง business-cache-seconds=0 ให้อ่านใหม่ทุกครั้ง และเทสทั้งคลาสเป็น transaction ที่ rollback เอง
 * <p>
 * ต้องเปิด Docker ก่อนรัน (Testcontainers ยก PostgreSQL)
 */
@SpringBootTest
@Import(TestcontainersConfiguration.class)
@TestPropertySource(properties = "app.metrics.business-cache-seconds=0")
@Transactional
class BusinessMetricsTest {

    @Autowired
    private MeterRegistry registry;

    @Autowired
    private JdbcTemplate jdbc;

    private double gauge(String name, String... tags) {
        var search = registry.get(name);
        for (int i = 0; i < tags.length; i += 2) {
            search = search.tag(tags[i], tags[i + 1]);
        }
        return search.gauge().value();
    }

    private long insertTenant() {
        return jdbc.queryForObject(
                "INSERT INTO tenant (full_name, phone, national_id, created_at) "
                        + "VALUES ('metric test', '-', 'M' || substr(md5(random()::text), 1, 12), now()) RETURNING id", Long.class);
    }

    private long freeRoom() {
        return jdbc.queryForObject(
                "SELECT id FROM room r WHERE NOT EXISTS (SELECT 1 FROM lease l WHERE l.room_id = r.id AND l.status = 'ACTIVE') "
                        + "AND NOT r.under_maintenance ORDER BY id LIMIT 1", Long.class);
    }

    /**
     * ตั้งแต่ V16 (SSK-180) สัญญาต้องมีสำเนาห้องกับผู้เช่าเสมอ คอลัมน์สำเนาเป็น NOT NULL ไม่มีค่า default
     * insert ตรงด้วย SQL จึงคัดลอกจากตาราง room กับ tenant เองแบบเดียวกับที่ constructor ของ Lease ทำ
     */
    private long insertLease(long roomId, long tenantId) {
        return jdbc.queryForObject("""
                INSERT INTO lease (room_id, tenant_id, start_date, end_date, monthly_rent, billing_cycle, status,
                                   security_deposit, electric_rate_per_unit, water_rate_per_unit, common_area_fee, internet_fee,
                                   room_number_snapshot, room_floor_snapshot, room_type_snapshot,
                                   tenant_name_snapshot, tenant_national_id_snapshot, tenant_phone_snapshot,
                                   tenant_line_id_snapshot, contract_template_version)
                SELECT r.id, t.id, current_date - 30, NULL, 4000, 'MONTHLY', 'ACTIVE', 4000, 8, 18, 0, 0,
                       r.room_number, r.floor, r.room_type, t.full_name, t.national_id, t.phone, t.line_id, 1
                FROM room r, tenant t
                WHERE r.id = ? AND t.id = ?
                RETURNING id
                """, Long.class, roomId, tenantId);
    }

    private void insertReceipt(long leaseId, String no, LocalDate month, LocalDate due, double total, String status) {
        jdbc.update("""
                INSERT INTO receipt (receipt_no, lease_id, billing_month, electric_units, water_units, monthly_rent,
                                     electric_rate_per_unit, water_rate_per_unit, common_area_fee, internet_fee,
                                     electric_amount, water_amount, total_amount, due_date, status, paid_at)
                VALUES (?, ?, ?, 0, 0, ?, 8, 18, 0, 0, 0, 0, ?, ?, ?, CASE WHEN ? = 'PAID' THEN now() END)
                """, no, leaseId, month, total, total, due, status, status);
    }

    @Test
    @DisplayName("ห้องที่มีสัญญา ACTIVE นับเป็นห้องมีคนอยู่ และอัตราเข้าพักเปลี่ยนตาม")
    void occupancyFollowsActiveLeases() {
        double occupiedBefore = gauge("sakura_rooms", "state", "occupied");
        double vacantBefore = gauge("sakura_rooms", "state", "vacant");
        double total = gauge("sakura_rooms", "state", "total");

        insertLease(freeRoom(), insertTenant());

        assertThat(gauge("sakura_rooms", "state", "occupied")).isEqualTo(occupiedBefore + 1);
        assertThat(gauge("sakura_rooms", "state", "vacant")).isEqualTo(vacantBefore - 1);
        assertThat(gauge("sakura_occupancy_ratio"))
                .isCloseTo((occupiedBefore + 1) / total, within(1e-9));
    }

    @Test
    @DisplayName("ห้องปิดซ่อมไม่นับเป็นว่างหรือมีคนอยู่ ผลรวมสามสถานะต้องเท่าจำนวนห้องทั้งหมดเสมอ")
    void roomStatesAddUpToTotal() {
        long room = freeRoom();
        insertLease(room, insertTenant());

        // มีสัญญาอยู่ ห้องนี้นับเป็น "มีคนอยู่" ก่อน
        double occupied = gauge("sakura_rooms", "state", "occupied");
        double vacant = gauge("sakura_rooms", "state", "vacant");
        double maintenance = gauge("sakura_rooms", "state", "under_maintenance");
        double total = gauge("sakura_rooms", "state", "total");
        assertThat(occupied + vacant + maintenance).isEqualTo(total);

        // ปิดซ่อมทั้งที่ยังมีสัญญา: ธงซ่อมชนะ (เหมือน RoomStatus ในแอป) ห้องย้ายจาก "มีคนอยู่" ไป "ปิดซ่อม" เท่านั้น
        jdbc.update("UPDATE room SET under_maintenance = true WHERE id = ?", room);

        assertThat(gauge("sakura_rooms", "state", "occupied")).isEqualTo(occupied - 1);
        assertThat(gauge("sakura_rooms", "state", "under_maintenance")).isEqualTo(maintenance + 1);
        assertThat(gauge("sakura_rooms", "state", "vacant")).isEqualTo(vacant);
        assertThat(gauge("sakura_rooms", "state", "occupied")
                + gauge("sakura_rooms", "state", "vacant")
                + gauge("sakura_rooms", "state", "under_maintenance")).isEqualTo(total);
    }

    @Test
    @DisplayName("หนี้ค้างรวมใบที่ยังไม่จ่าย และแยกใบที่เกินกำหนดออกมา ส่วนใบที่จ่ายแล้วไม่นับเป็นหนี้")
    void outstandingAndOverdueReceipts() {
        double outstandingBefore = gauge("sakura_receipts_outstanding_amount");
        double overdueBefore = gauge("sakura_receipts_overdue_amount");
        double overdueCountBefore = gauge("sakura_receipts_overdue");
        double revenueBefore = gauge("sakura_revenue_month_amount");

        long lease = insertLease(freeRoom(), insertTenant());
        LocalDate thisMonth = LocalDate.now().withDayOfMonth(1);
        insertReceipt(lease, "ZZ-M-1", thisMonth.minusMonths(2), LocalDate.now().minusDays(20), 1000, "PENDING"); // เกินกำหนด
        insertReceipt(lease, "ZZ-M-2", thisMonth.minusMonths(1), LocalDate.now().plusDays(5), 500, "PENDING");   // ยังไม่ถึงกำหนด
        insertReceipt(lease, "ZZ-M-3", thisMonth, LocalDate.now().plusDays(10), 250, "PAID");                    // จ่ายแล้ว

        assertThat(gauge("sakura_receipts_outstanding_amount")).isCloseTo(outstandingBefore + 1500, within(0.001));
        assertThat(gauge("sakura_receipts_overdue_amount")).isCloseTo(overdueBefore + 1000, within(0.001));
        assertThat(gauge("sakura_receipts_overdue")).isEqualTo(overdueCountBefore + 1);
        assertThat(gauge("sakura_revenue_month_amount")).isCloseTo(revenueBefore + 250, within(0.001));
    }

    @Test
    @DisplayName("งานซ่อมนับตามสถานะ และของที่เหลือน้อยกว่าขั้นต่ำถูกนับเป็นใกล้หมด")
    void maintenanceAndSupplies() {
        double openBefore = gauge("sakura_maintenance_tickets", "status", "open");
        double lowBefore = gauge("sakura_supplies_low_stock");

        jdbc.update("INSERT INTO maintenance_ticket (room_id, title, status) VALUES (?, 'metric test', 'OPEN')", freeRoom());
        jdbc.update("INSERT INTO supply_item (name, category, stock, min_stock, max_stock) VALUES ('metric low', 'test', 1, 5, 10)");
        jdbc.update("INSERT INTO supply_item (name, category, stock, min_stock, max_stock) VALUES ('metric ok', 'test', 9, 5, 10)");

        assertThat(gauge("sakura_maintenance_tickets", "status", "open")).isEqualTo(openBefore + 1);
        assertThat(gauge("sakura_supplies_low_stock")).isEqualTo(lowBefore + 1);
    }
}
