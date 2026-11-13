package com.sakurasoul.apartment.usage;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import java.time.YearMonth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * พารามิเตอร์ของ GET /api/usage (SSK-167) ข้อความและลำดับต้องตรงกับ usageRoute ของ backend จำลอง
 * ช่องว่างในตาราง (ไม่ใส่ค่า) คือไม่ได้ส่งพารามิเตอร์นั้นมา
 */
class UsageQueryTest {

    private static final String RANGE = "from and to must be YYYY-MM with from not after to";

    @ParameterizedTest(name = "metric={0} scope={1} granularity={2} roomId={3} floor={4} {5}..{6} -> {7}")
    @CsvSource(delimiter = '|', value = {
            "         | room     | month | 1 |   | 2026-01 | 2026-12 | metric must be electric or water",
            "gas      | room     | month | 1 |   | 2026-01 | 2026-12 | metric must be electric or water",
            "Electric | room     | month | 1 |   | 2026-01 | 2026-12 | metric must be electric or water",
            "electric |          | month | 1 |   | 2026-01 | 2026-12 | scope must be room, floor or building",
            "electric | unit     | month | 1 |   | 2026-01 | 2026-12 | scope must be room, floor or building",
            "electric | room     | week  | 1 |   | 2026-01 | 2026-12 | granularity must be month or year",
            "electric | room     | month | 1 |   |         | 2026-12 | " + RANGE,
            "electric | room     | month | 1 |   | 2026-1  | 2026-12 | " + RANGE,
            "electric | room     | month | 1 |   | 2026-12 | 2026-01 | " + RANGE,
            "electric | room     | month | 1 |   | 2016-01 | 2026-01 | The range can be at most 10 years",
            "electric | room     | month |   |   | 2026-01 | 2026-12 | roomId is required when scope is room",
            "electric | floor    | month | 1 |   | 2026-01 | 2026-12 | floor is required when scope is floor",
            // ผิดหลายตัวได้ข้อความของตัวแรกตามลำดับ metric → scope → granularity → ช่วง → roomId/floor
            "gas      | unit     | week  |   |   | 2026-12 | 2026-01 | metric must be electric or water",
            "water    | unit     | week  |   |   | 2026-12 | 2026-01 | scope must be room, floor or building",
            "water    | room     | week  |   |   | 2026-12 | 2026-01 | granularity must be month or year",
            "water    | room     | year  |   |   | 2026-12 | 2026-01 | " + RANGE,
    })
    @DisplayName("พารามิเตอร์ที่ผิดได้ข้อความของตัวแรกที่ผิด")
    void invalidParametersReportTheFirstProblem(String metric, String scope, String granularity, Long roomId,
            Short floor, String from, String to, String message) {
        assertThatThrownBy(() -> UsageQuery.parse(metric, scope, granularity, roomId, floor, from, to))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage(message);
    }

    @Test
    @DisplayName("ไม่ส่ง granularity ได้รายเดือน ช่วงสิบปีพอดีกับเดือนเดียวรับได้ ช่วงข้ามปีได้ทุกเดือนตามลำดับ")
    void validQueriesAreParsed() {
        UsageQuery query = UsageQuery.parse("water", "building", null, null, null, "2025-11", "2026-02");

        assertThat(query.granularity()).isEqualTo(UsageQuery.Granularity.MONTH);
        assertThat(query.scopeId()).isEqualTo("building");
        assertThat(query.months()).containsExactly(
                YearMonth.of(2025, 11), YearMonth.of(2025, 12), YearMonth.of(2026, 1), YearMonth.of(2026, 2));
        assertThat(UsageQuery.parse("electric", "room", "year", 5L, null, "2016-02", "2026-01").months())
                .hasSize(UsageRange.MAX_MONTHS);
        assertThat(UsageQuery.parse("electric", "room", "month", 5L, null, "2026-03", "2026-03").months())
                .containsExactly(YearMonth.of(2026, 3));
    }

    @Test
    @DisplayName("roomId กับ floor ที่ scope ไม่ใช้ถูกทิ้ง scopeId เป็น id ห้องหรือเลขชั้นตาม scope")
    void unusedFiltersAreDropped() {
        UsageQuery room = UsageQuery.parse("electric", "room", "month", 5L, (short) 2, "2026-01", "2026-02");
        UsageQuery floor = UsageQuery.parse("electric", "floor", "month", 5L, (short) 2, "2026-01", "2026-02");
        UsageQuery building = UsageQuery.parse("electric", "building", "month", 5L, (short) 2, "2026-01", "2026-02");

        assertThat(room.floor()).isNull();
        assertThat(room.scopeId()).isEqualTo("5");
        assertThat(floor.roomId()).isNull();
        assertThat(floor.scopeId()).isEqualTo("2");
        assertThat(building.roomId()).isNull();
        assertThat(building.floor()).isNull();
    }
}
