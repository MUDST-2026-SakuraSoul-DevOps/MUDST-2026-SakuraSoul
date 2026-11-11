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
 * กฎเลือกแหล่งข้อมูลต่อห้องต่อเดือน (ค่ามิเตอร์ชนะใบเสร็จ ไม่นับซ้ำ) อยู่ที่ UsageSources ที่เดียว
 * ภาพรวมทั้งตึก (SSK-181, BuildingUsageReader) ใช้ชุดเดียวกัน
 */
@Repository
class UsageReader {

    private static final String MONTHLY_TOTALS = "WITH " + UsageSources.ROOM_MONTH + """
            SELECT month, SUM(CASE WHEN :metric = 'electric' THEN electric_units ELSE water_units END) AS units
            FROM room_month
            GROUP BY month
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
