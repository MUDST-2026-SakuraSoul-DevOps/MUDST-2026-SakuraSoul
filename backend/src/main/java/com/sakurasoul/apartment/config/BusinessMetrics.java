package com.sakurasoul.apartment.config;

import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.function.ToDoubleFunction;

/**
 * Metric เชิง business ของหอพัก (SSK-184) ให้ Prometheus ดึงไปแสดงใน Grafana
 * <p>
 * ทุกตัวเป็น gauge ที่คำนวณจากฐานข้อมูลโดยตรง ไม่ใช่ counter ที่นับในหน่วยความจำ
 * เพราะ backend มีสอง pod และรีสตาร์ตได้ ตัวนับในหน่วยความจำจะเพี้ยนทันทีที่ pod ใหม่ขึ้น ส่วนค่าจากฐานข้อมูลตรงกันทุก pod
 * (ใน PromQL จึงใช้ max by ไม่ใช่ sum เวลาอ่านค่าเหล่านี้)
 * <p>
 * query ทั้งหมดรวมค่าเป็นตัวเลขอย่างเดียว ไม่ดึงชื่อผู้เช่า เบอร์โทร หรือเลขบัตรประชาชนออกมาเลย
 * และ Prometheus ต้องผ่าน Basic auth ของผู้ใช้ metrics ก่อนจึงอ่านได้ (MetricsSecurityConfig)
 * <p>
 * ผลรวมทั้งหมดอ่านจากฐานข้อมูลครั้งเดียวต่อรอบแล้วแคชไว้สั้นๆ จะได้ไม่ยิง query ซ้ำสิบกว่าครั้งทุกครั้งที่ถูก scrape
 */
@Component
public class BusinessMetrics {

    /** ภาพรวมที่อ่านจากฐานข้อมูลหนึ่งรอบ */
    record Snapshot(
            long roomsTotal,
            long roomsOccupied,
            long roomsMaintenance,
            double outstandingAmount,
            long outstandingCount,
            double overdueAmount,
            long overdueCount,
            double revenueMonth,
            double billedMonth,
            long ticketsOpen,
            long ticketsInProgress,
            long ticketsDoneMonth,
            double maintenanceCostMonth,
            long suppliesTotal,
            long suppliesLow) {
    }

    private static final String SQL = """
            SELECT
              (SELECT count(*) FROM room)                                                         AS rooms_total,
              (SELECT count(*) FROM room r
                 WHERE NOT r.under_maintenance
                   AND EXISTS (SELECT 1 FROM lease l
                                 WHERE l.room_id = r.id AND l.status = 'ACTIVE' AND l.start_date <= :today
                                   AND (l.end_date IS NULL OR l.end_date >= :today)))             AS rooms_occupied,
              (SELECT count(*) FROM room WHERE under_maintenance)                                 AS rooms_maintenance,
              (SELECT COALESCE(sum(total_amount), 0) FROM receipt WHERE status = 'PENDING')       AS outstanding_amount,
              (SELECT count(*) FROM receipt WHERE status = 'PENDING')                             AS outstanding_count,
              (SELECT COALESCE(sum(total_amount), 0) FROM receipt
                 WHERE status = 'PENDING' AND due_date < :today)                                  AS overdue_amount,
              (SELECT count(*) FROM receipt WHERE status = 'PENDING' AND due_date < :today)       AS overdue_count,
              (SELECT COALESCE(sum(total_amount), 0) FROM receipt
                 WHERE status = 'PAID' AND paid_at >= :month_start AND paid_at < :next_month)     AS revenue_month,
              (SELECT COALESCE(sum(total_amount), 0) FROM receipt
                 WHERE billing_month = :billing_month)                                            AS billed_month,
              (SELECT count(*) FROM maintenance_ticket WHERE status = 'OPEN')                     AS tickets_open,
              (SELECT count(*) FROM maintenance_ticket WHERE status = 'IN_PROGRESS')              AS tickets_in_progress,
              (SELECT count(*) FROM maintenance_ticket
                 WHERE status = 'DONE' AND closed_at >= :month_start AND closed_at < :next_month) AS tickets_done_month,
              (SELECT COALESCE(sum(cost), 0) FROM maintenance_ticket
                 WHERE status = 'DONE' AND closed_at >= :month_start AND closed_at < :next_month) AS maintenance_cost_month,
              (SELECT count(*) FROM supply_item)                                                  AS supplies_total,
              (SELECT count(*) FROM supply_item WHERE stock <= min_stock)                         AS supplies_low
            """;

    private static final org.slf4j.Logger log = org.slf4j.LoggerFactory.getLogger(BusinessMetrics.class);

    private final org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate jdbc;
    private final Clock clock;
    private final ZoneId zone;
    private final Duration ttl;

    private volatile Snapshot cached;
    private volatile Instant cachedAt = Instant.MIN;

    public BusinessMetrics(JdbcTemplate jdbcTemplate,
                           MeterRegistry registry,
                           Clock clock,
                           @Value("${app.metrics.business-cache-seconds:30}") long cacheSeconds) {
        this.jdbc = new org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate(jdbcTemplate);
        // Clock ตัวเดียวกับที่ระบบใช้ (เวลาไทย) ให้ "เดือนนี้" กับ "เกินกำหนด" ตรงกับที่แอดมินเห็นในหน้าเว็บ
        this.clock = clock;
        this.zone = clock.getZone();
        this.ttl = Duration.ofSeconds(cacheSeconds);

        room(registry, "total", Snapshot::roomsTotal);
        room(registry, "occupied", Snapshot::roomsOccupied);
        // สถานะห้องแยกกันเด็ดขาดเหมือน RoomStatus ในแอป: ธงซ่อมบำรุงชนะสัญญา (ห้องปิดซ่อมไม่นับเป็นมีคนอยู่หรือว่าง)
        // occupied + vacant + under_maintenance จึงเท่ากับ total เสมอ และตรงกับที่แอดมินเห็นในหน้าห้อง
        room(registry, "vacant", s -> Math.max(0, s.roomsTotal() - s.roomsOccupied() - s.roomsMaintenance()));
        room(registry, "under_maintenance", Snapshot::roomsMaintenance);

        gauge(registry, "sakura_occupancy_ratio",
                "สัดส่วนห้องที่มีสัญญาเช่า ACTIVE ต่อห้องทั้งหมด (0 ถึง 1)", "ratio",
                s -> s.roomsTotal() == 0 ? 0 : (double) s.roomsOccupied() / s.roomsTotal());

        gauge(registry, "sakura_receipts_outstanding_amount", "ยอดใบเสร็จที่ยังไม่จ่าย (PENDING) รวมทุกใบ", "baht",
                Snapshot::outstandingAmount);
        gauge(registry, "sakura_receipts_outstanding", "จำนวนใบเสร็จที่ยังไม่จ่าย", "receipts",
                Snapshot::outstandingCount);
        gauge(registry, "sakura_receipts_overdue_amount", "ยอดหนี้ค้างเกินกำหนดจ่าย (PENDING และ due_date ผ่านแล้ว)", "baht",
                Snapshot::overdueAmount);
        gauge(registry, "sakura_receipts_overdue", "จำนวนใบเสร็จที่เกินกำหนดจ่าย", "receipts",
                Snapshot::overdueCount);
        gauge(registry, "sakura_revenue_month_amount", "รายได้ที่รับชำระแล้วในเดือนปัจจุบัน (นับตามวันที่จ่าย)", "baht",
                Snapshot::revenueMonth);
        gauge(registry, "sakura_billed_month_amount", "ยอดที่เรียกเก็บของรอบบิลเดือนปัจจุบัน (จ่ายแล้วและยังไม่จ่ายรวมกัน)", "baht",
                Snapshot::billedMonth);

        ticket(registry, "open", Snapshot::ticketsOpen);
        ticket(registry, "in_progress", Snapshot::ticketsInProgress);
        gauge(registry, "sakura_maintenance_done_month", "งานซ่อมที่ปิดแล้วในเดือนปัจจุบัน", "tickets",
                Snapshot::ticketsDoneMonth);
        gauge(registry, "sakura_maintenance_cost_month_amount", "ค่าซ่อมของงานที่ปิดในเดือนปัจจุบัน", "baht",
                Snapshot::maintenanceCostMonth);

        gauge(registry, "sakura_supplies", "จำนวนรายการของใช้ในคลังทั้งหมด", "items", Snapshot::suppliesTotal);
        gauge(registry, "sakura_supplies_low_stock", "จำนวนรายการของที่เหลือน้อยกว่าหรือเท่าขั้นต่ำ (stock <= min_stock)", "items",
                Snapshot::suppliesLow);
    }

    private void room(MeterRegistry registry, String state, ToDoubleFunction<Snapshot> f) {
        Gauge.builder("sakura_rooms", this, m -> f.applyAsDouble(m.snapshot()))
                .description("จำนวนห้องแยกตามสถานะ").baseUnit("rooms").tag("state", state).register(registry);
    }

    private void ticket(MeterRegistry registry, String status, ToDoubleFunction<Snapshot> f) {
        Gauge.builder("sakura_maintenance_tickets", this, m -> f.applyAsDouble(m.snapshot()))
                .description("จำนวนงานซ่อมที่ยังไม่ปิด แยกตามสถานะ").baseUnit("tickets").tag("status", status).register(registry);
    }

    private void gauge(MeterRegistry registry, String name, String description, String unit, ToDoubleFunction<Snapshot> f) {
        // ไม่ใช้ baseUnit เพราะ Micrometer จะต่อหน่วยท้ายชื่อ (เช่น _baht) ทำให้ชื่อใน dashboard ไม่ตรงกับที่ตั้งไว้ จึงบอกหน่วยใน description แทน
        Gauge.builder(name, this, m -> f.applyAsDouble(m.snapshot()))
                .description(description + " [" + unit + "]").register(registry);
    }

    /** อ่านจากฐานข้อมูลถ้าแคชหมดอายุ ถ้า query พังให้ใช้ค่าเดิมต่อ ไม่ให้ scrape ทั้งรอบล้มเพราะ metric ตัวเดียว */
    Snapshot snapshot() {
        Instant now = clock.instant();
        Snapshot current = cached;
        if (current != null && Duration.between(cachedAt, now).compareTo(ttl) < 0) {
            return current;
        }
        synchronized (this) {
            if (cached != null && Duration.between(cachedAt, now).compareTo(ttl) < 0) {
                return cached;
            }
            try {
                cached = load();
                cachedAt = now;
            } catch (RuntimeException e) {
                log.warn("อ่านตัวเลข business metric จากฐานข้อมูลไม่สำเร็จ ใช้ค่าล่าสุดต่อ: {}", e.toString());
                if (cached == null) {
                    cached = new Snapshot(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
                }
            }
            return cached;
        }
    }

    private Snapshot load() {
        LocalDate today = LocalDate.now(clock.withZone(zone));
        LocalDate monthStart = today.withDayOfMonth(1);
        var params = new org.springframework.jdbc.core.namedparam.MapSqlParameterSource()
                .addValue("today", java.sql.Date.valueOf(today))
                .addValue("billing_month", java.sql.Date.valueOf(monthStart))
                .addValue("month_start", java.sql.Timestamp.from(monthStart.atStartOfDay(zone).toInstant()))
                .addValue("next_month", java.sql.Timestamp.from(monthStart.plusMonths(1).atStartOfDay(zone).toInstant()));
        return jdbc.queryForObject(SQL, params, (rs, i) -> new Snapshot(
                rs.getLong("rooms_total"),
                rs.getLong("rooms_occupied"),
                rs.getLong("rooms_maintenance"),
                rs.getDouble("outstanding_amount"),
                rs.getLong("outstanding_count"),
                rs.getDouble("overdue_amount"),
                rs.getLong("overdue_count"),
                rs.getDouble("revenue_month"),
                rs.getDouble("billed_month"),
                rs.getLong("tickets_open"),
                rs.getLong("tickets_in_progress"),
                rs.getLong("tickets_done_month"),
                rs.getDouble("maintenance_cost_month"),
                rs.getLong("supplies_total"),
                rs.getLong("supplies_low")));
    }
}
