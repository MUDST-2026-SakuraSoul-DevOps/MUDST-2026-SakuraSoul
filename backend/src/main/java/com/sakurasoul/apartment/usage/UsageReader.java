package com.sakurasoul.apartment.usage;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.sql.Types;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * อ่านยอดหน่วยรายเดือนของห้อง ชั้น หรือทั้งตึก (SSK-167) ด้วย SQL คำสั่งเดียว รวมด้วย GROUP BY ในฐานข้อมูล
 * <p>
 * แหล่งข้อมูลต่อห้องต่อเดือน: ค่ามิเตอร์ที่นำเข้า (SSK-166) ชนะเสมอ เดือนไหนห้องนั้นไม่มีค่ามิเตอร์ค่อยใช้หน่วยในใบเสร็จ
 * (กฎเดียวกับ mergeUsageSources ของหน้าเว็บ) ใบเสร็จหลายใบของห้องเดียวในเดือนเดียว (สัญญาเก่าจบกลางเดือนแล้วสัญญาใหม่เริ่ม)
 * รวมกัน ห้องหาจากสัญญาของใบเสร็จ ส่วนชั้นอ่านจากตาราง room ตามผังปัจจุบัน
 * <p>
 * เป็น SQL ตรงเพราะ JPQL ทำ UNION ของสองตารางแล้วรวมต่อไม่สวย ตัวกรองห้องกับชั้นเป็นพารามิเตอร์ที่ว่างได้
 * ไม่ต่อข้อความ SQL ตาม scope ต้องบอกชนิดของพารามิเตอร์ที่เป็น null ไม่งั้น PostgreSQL เดาชนิดไม่ได้
 */
@Repository
class UsageReader {

    private static final String MONTHLY_TOTALS = """
            WITH readings AS (
                SELECT m.room_id, m.reading_month AS month,
                       CASE WHEN :metric = 'electric' THEN m.electric_units ELSE m.water_units END AS units
                FROM meter_reading m
                WHERE m.reading_month BETWEEN :from AND :to
            ),
            billed AS (
                SELECT l.room_id, r.billing_month AS month,
                       SUM(CASE WHEN :metric = 'electric' THEN r.electric_units ELSE r.water_units END) AS units
                FROM receipt r
                JOIN lease l ON l.id = r.lease_id
                WHERE r.billing_month BETWEEN :from AND :to
                GROUP BY l.room_id, r.billing_month
            ),
            room_month AS (
                SELECT room_id, month, units FROM readings
                UNION ALL
                SELECT b.room_id, b.month, b.units FROM billed b
                WHERE NOT EXISTS (SELECT 1 FROM readings x WHERE x.room_id = b.room_id AND x.month = b.month)
            )
            SELECT u.month, SUM(u.units) AS units
            FROM room_month u
            JOIN room rm ON rm.id = u.room_id
            WHERE (CAST(:roomId AS BIGINT) IS NULL OR u.room_id = :roomId)
              AND (CAST(:floor AS SMALLINT) IS NULL OR rm.floor = :floor)
            GROUP BY u.month
            """;

    private final JdbcClient jdbc;

    UsageReader(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /** ยอดของแต่ละเดือนที่มีข้อมูลในช่วง เดือนที่ไม่มีข้อมูลเลยไม่อยู่ในผล (UsageSeries เติมให้เป็น 0) */
    Map<YearMonth, BigDecimal> monthlyTotals(UsageQuery query) {
        return jdbc.sql(MONTHLY_TOTALS)
                .param("metric", query.metric().param())
                .param("from", query.from().atDay(1))
                .param("to", query.to().atDay(1))
                .param("roomId", query.roomId(), Types.BIGINT)
                .param("floor", query.floor(), Types.SMALLINT)
                .query((row, number) -> Map.entry(
                        YearMonth.from(row.getObject("month", LocalDate.class)), row.getBigDecimal("units")))
                .list()
                .stream()
                .collect(Collectors.toMap(Map.Entry::getKey, Map.Entry::getValue));
    }
}
