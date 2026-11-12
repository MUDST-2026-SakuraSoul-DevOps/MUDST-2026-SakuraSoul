package com.sakurasoul.apartment.usage;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.YearMonth;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/** กฎการเติมเดือนและรวมรายปีของกราฟการใช้น้ำไฟ (SSK-167) เทียบกับ aggregateUsage ของหน้าเว็บ บวก hasData */
class UsageSeriesTest {

    private static final Map<YearMonth, BigDecimal> TOTALS = Map.of(
            YearMonth.of(2025, 12), new BigDecimal("150.50"),
            YearMonth.of(2026, 1), new BigDecimal("0.00"),
            YearMonth.of(2026, 2), new BigDecimal("80.25"));

    @Test
    @DisplayName("รายเดือนได้ทุกเดือนในช่วง เดือนไม่มีข้อมูลได้ 0 กับ hasData false ส่วนศูนย์จริงได้ hasData true")
    void monthsWithoutDataAreZeroAndFlagged() {
        UsageQuery query = UsageQuery.parse("electric", "floor", "month", null, (short) 1, "2025-11", "2026-02");

        assertThat(UsageSeries.of(query, TOTALS)).containsExactly(
                new UsagePoint("2025-11", "1", new BigDecimal("0.00"), false),
                new UsagePoint("2025-12", "1", new BigDecimal("150.50"), true),
                new UsagePoint("2026-01", "1", new BigDecimal("0.00"), true),
                new UsagePoint("2026-02", "1", new BigDecimal("80.25"), true));
    }

    @Test
    @DisplayName("รายปีรวมเฉพาะเดือนในช่วง ปีที่มีข้อมูลเดือนเดียวก็นับว่ามีข้อมูล ปีที่ไม่มีเลยได้ 0 กับ false")
    void yearsSumTheMonthsInsideTheRange() {
        UsageQuery query = UsageQuery.parse("electric", "building", "year", null, null, "2024-06", "2026-02");

        assertThat(UsageSeries.of(query, TOTALS)).containsExactly(
                new UsagePoint("2024", "building", new BigDecimal("0.00"), false),
                new UsagePoint("2025", "building", new BigDecimal("150.50"), true),
                new UsagePoint("2026", "building", new BigDecimal("80.25"), true));
    }

    @Test
    @DisplayName("เดือนนอกช่วงไม่ถูกนับ ถึงตัวอ่านจะส่งมาก็ตาม")
    void totalsOutsideTheRangeAreIgnored() {
        UsageQuery query = UsageQuery.parse("electric", "building", "year", null, null, "2026-01", "2026-01");

        assertThat(UsageSeries.of(query, TOTALS)).containsExactly(
                new UsagePoint("2026", "building", new BigDecimal("0.00"), true));
    }
}
