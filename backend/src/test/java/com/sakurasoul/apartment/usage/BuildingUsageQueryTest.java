package com.sakurasoul.apartment.usage;

import com.sakurasoul.apartment.usage.BuildingUsageQuery.Metric;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.YearMonth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class BuildingUsageQueryTest {

    private static final String RANGE = "from and to must be YYYY-MM with from not after to";

    @Test
    @DisplayName("SSK-181 ไม่ส่ง metric granularity compare ได้ค่าตั้งต้น both month ไม่เทียบ ค่าว่างเหมือนไม่ส่ง")
    void defaults() {
        BuildingUsageQuery expected = new BuildingUsageQuery(Metric.BOTH, UsageQuery.Granularity.MONTH, false,
                YearMonth.of(2025, 1), YearMonth.of(2026, 12));
        assertThat(BuildingUsageQuery.parse(null, null, null, "2025-01", "2026-12")).isEqualTo(expected);
        assertThat(BuildingUsageQuery.parse("", " ", "", "2025-01", "2026-12")).isEqualTo(expected);
    }

    @Test
    @DisplayName("SSK-181 ค่าครบทุกตัว")
    void everyParameter() {
        BuildingUsageQuery query = BuildingUsageQuery.parse("water", "year", "yoy", "2024-03", "2026-02");

        assertThat(query).isEqualTo(new BuildingUsageQuery(Metric.WATER, UsageQuery.Granularity.YEAR, true,
                YearMonth.of(2024, 3), YearMonth.of(2026, 2)));
        assertThat(query.readFrom()).isEqualTo(YearMonth.of(2023, 3));
        assertThat(query.fileName()).isEqualTo("building-usage-year-2024-03-2026-02.csv");
        assertThat(BuildingUsageQuery.parse("electric", "month", null, "2026-01", "2026-01").readFrom())
                .isEqualTo(YearMonth.of(2026, 1));
    }

    @Test
    @DisplayName("SSK-181 ข้อความ 400 ตามลำดับ metric → granularity → compare → ช่วงเดือน → สิบปี")
    void messagesInOrder() {
        assertThatThrownBy(() -> BuildingUsageQuery.parse("gas", "week", "mom", "x", "y"))
                .hasMessage("metric must be electric, water or both");
        assertThatThrownBy(() -> BuildingUsageQuery.parse("Electric", null, null, "2025-01", "2025-02"))
                .hasMessage("metric must be electric, water or both");
        assertThatThrownBy(() -> BuildingUsageQuery.parse("both", "week", "mom", "x", "y"))
                .hasMessage("granularity must be month or year");
        assertThatThrownBy(() -> BuildingUsageQuery.parse("both", "year", "mom", "x", "y"))
                .hasMessage("compare must be yoy");
        assertThatThrownBy(() -> BuildingUsageQuery.parse("both", "year", "yoy", "2026-13", "2026-12"))
                .hasMessage(RANGE);
        assertThatThrownBy(() -> BuildingUsageQuery.parse("both", "year", "yoy", "2026-12", "2026-11"))
                .hasMessage(RANGE);
        assertThatThrownBy(() -> BuildingUsageQuery.parse("both", "year", "yoy", null, "2026-11"))
                .hasMessage(RANGE);
    }

    @Test
    @DisplayName("SSK-181 ช่วง 120 เดือนพอดีผ่าน 121 เดือนไม่ผ่าน การอ่านย้อนของ yoy ไม่นับรวมในเพดาน")
    void tenYears() {
        assertThat(BuildingUsageQuery.parse(null, null, "yoy", "2017-01", "2026-12").readFrom())
                .isEqualTo(YearMonth.of(2016, 1));
        assertThatThrownBy(() -> BuildingUsageQuery.parse(null, null, null, "2016-12", "2026-12"))
                .hasMessage("The range can be at most 10 years");
    }
}
