package com.sakurasoul.apartment.usage;

import com.sakurasoul.apartment.usage.BuildingUsageReport.Change;
import com.sakurasoul.apartment.usage.BuildingUsageReport.Peak;
import com.sakurasoul.apartment.usage.BuildingUsageReport.Point;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.YearMonth;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class BuildingUsageSeriesTest {

    /** ม.ค. 2025 มีข้อมูล ก.พ. 2025 ไม่มีเลย ม.ค. 2026 ใช้ศูนย์จริงบางส่วน ก.พ. 2026 มีบางห้อง */
    private static final List<BuildingMonth> MONTHS = List.of(
            month("2025-01", 10, "1000.00", "100.00", "8000.00", "1800.00", 10, 10),
            month("2026-01", 12, "0.00", "120.00", null, null, 12, 0),
            month("2026-02", 12, "600.00", "60.00", "4800.00", "1080.00", 6, 6));

    @Test
    @DisplayName("SSK-181 เดือนที่ไม่มีข้อมูลเป็น null พร้อมจำนวนห้องเป็นศูนย์ ศูนย์จริงเป็น 0.00 เงินที่ไม่มีใบเป็น null")
    void nullMeansNoDataAndZeroIsReal() {
        List<Point> points = report("both", "month", null, "2026-01", "2026-03").points();

        assertThat(points).extracting(Point::period).containsExactly("2026-01", "2026-02", "2026-03");
        Point january = points.getFirst();
        assertThat(january.electricUnits()).isEqualByComparingTo("0.00");
        assertThat(january.electricAmount()).isNull();
        assertThat(january.roomsWithAmount()).isZero();
        assertThat(points.get(1).roomsWithData()).isEqualTo(6);
        assertThat(points.get(1).occupiedRooms()).isEqualTo(12);
        Point march = points.get(2);
        assertThat(march.electricUnits()).isNull();
        assertThat(march.waterAmount()).isNull();
        assertThat(march.roomsWithData()).isZero();
        assertThat(march.occupiedRooms()).isZero();
        assertThat(march.monthsWithData()).isZero();
        assertThat(march.months()).isEqualTo(1);
        assertThat(march.yoy()).isNull();
    }

    @Test
    @DisplayName("SSK-181 รายปีรวมเฉพาะเดือนในช่วง จำนวนห้องใช้เดือนที่มากที่สุด นับเดือนที่มีข้อมูล")
    void yearsSumTheMonthsInRange() {
        List<Point> points = report("both", "year", null, "2025-01", "2026-03").points();

        assertThat(points).extracting(Point::period).containsExactly("2025", "2026");
        assertThat(points.get(0).electricUnits()).isEqualByComparingTo("1000.00");
        assertThat(points.get(0).months()).isEqualTo(12);
        assertThat(points.get(0).monthsWithData()).isEqualTo(1);
        Point year2026 = points.get(1);
        assertThat(year2026.months()).isEqualTo(3);
        assertThat(year2026.monthsWithData()).isEqualTo(2);
        assertThat(year2026.electricUnits()).isEqualByComparingTo("600.00");
        assertThat(year2026.electricAmount()).isEqualByComparingTo("4800.00");
        assertThat(year2026.occupiedRooms()).isEqualTo(12);
        assertThat(year2026.roomsWithData()).isEqualTo(12);
        assertThat(year2026.roomsWithAmount()).isEqualTo(6);
    }

    @Test
    @DisplayName("SSK-181 เทียบปีก่อนรายเดือน ปีแรกของช่วงใช้เดือนของปีก่อนที่อ่านมาเพิ่ม ปีก่อนไม่มีข้อมูลได้ null")
    void yearOverYearByMonth() {
        List<Point> points = report("both", "month", "yoy", "2026-01", "2026-02").points();

        Point january = points.get(0);
        assertThat(january.yoy().previousPeriod()).isEqualTo("2025-01");
        assertThat(january.yoy().previousMonthsWithData()).isEqualTo(1);
        assertThat(january.yoy().electricUnits()).isEqualTo(new Change(new BigDecimal("1000.00"),
                new BigDecimal("-1000.00"), new BigDecimal("-100.00")));
        assertThat(january.yoy().waterUnits().percent()).isEqualByComparingTo("20.00");
        // ปีนี้ไม่มีใบ ส่วนต่างจึงไม่มี
        assertThat(january.yoy().electricAmount()).isEqualTo(new Change(new BigDecimal("8000.00"), null, null));
        Point february = points.get(1);
        assertThat(february.yoy().previousPeriod()).isEqualTo("2025-02");
        assertThat(february.yoy().previousMonthsWithData()).isZero();
        assertThat(february.yoy().electricUnits()).isEqualTo(new Change(null, null, null));
    }

    @Test
    @DisplayName("SSK-181 เทียบปีก่อนรายปีที่ไม่เต็มปีเทียบเดือนต่อเดือน ปีก่อนเป็นศูนย์ได้ส่วนต่างแต่ไม่มีเปอร์เซ็นต์")
    void yearOverYearByYearIsLikeForLike() {
        List<BuildingMonth> months = List.of(
                month("2025-01", 5, "0.00", "10.00", null, null, 5, 0),
                month("2025-06", 5, "999.00", "99.00", null, null, 5, 0),
                month("2026-01", 5, "50.00", "15.00", null, null, 5, 0));
        BuildingUsageQuery query = BuildingUsageQuery.parse("both", "year", "yoy", "2026-01", "2026-02");

        Point year2026 = BuildingUsageSeries.of(query, months, 24).points().getFirst();

        assertThat(year2026.yoy().previousPeriod()).isEqualTo("2025");
        // มิ.ย. 2025 อยู่นอกเดือนที่เทียบ (ม.ค.-ก.พ.)
        assertThat(year2026.yoy().electricUnits()).isEqualTo(new Change(new BigDecimal("0.00"),
                new BigDecimal("50.00"), null));
        assertThat(year2026.yoy().waterUnits().percent()).isEqualByComparingTo("50.00");
    }

    /**
     * ปีนี้ยังไม่ถึง ธ.ค. (ไม่มีข้อมูล) ปีก่อนมีครบสิบสองเดือน เทียบเดือนต่อเดือนต้องไม่นับ ธ.ค. ของปีก่อน
     * ไม่งั้นทุกปีปัจจุบันดูเหมือนใช้น้อยลงหนึ่งเดือนเต็ม (ตัดสิน 11 พ.ย.: เทียบเดือนต่อเดือน)
     */
    @Test
    @DisplayName("SSK-181 เทียบปีก่อนรายปีนับเฉพาะเดือนที่ทั้งสองปีมีข้อมูล เดือนที่ปีนี้ยังไม่มีไม่ทำให้ดูเหมือนลดลง")
    void yearOverYearOnlyComparesMonthsBothYearsHave() {
        List<BuildingMonth> months = new java.util.ArrayList<>();
        for (int m = 1; m <= 12; m++) {
            months.add(month("2025-%02d".formatted(m), 5, "100.00", "10.00", "800.00", "180.00", 5, 5));
            if (m <= 11) {
                months.add(month("2026-%02d".formatted(m), 5, "100.00", "10.00", "800.00", "180.00", 5, 5));
            }
        }
        BuildingUsageQuery query = BuildingUsageQuery.parse("both", "year", "yoy", "2026-01", "2026-12");

        Point year2026 = BuildingUsageSeries.of(query, months, 24).points().getFirst();

        assertThat(year2026.electricUnits()).isEqualByComparingTo("1100.00");
        assertThat(year2026.yoy().electricUnits()).isEqualTo(new Change(new BigDecimal("1100.00"),
                new BigDecimal("0.00"), new BigDecimal("0.00")));
        assertThat(year2026.yoy().electricAmount().difference()).isEqualByComparingTo("0.00");
        assertThat(year2026.yoy().previousMonthsWithData()).isEqualTo(12);
        assertThat(year2026.yoy().comparedMonths()).isEqualTo(11);
    }

    @Test
    @DisplayName("SSK-181 metric=water ค่าไฟทุกที่เป็น null ทั้งจุด เทียบปีก่อน และสรุป")
    void metricNullsTheOtherSide() {
        BuildingUsageReport report = report("water", "month", "yoy", "2026-01", "2026-02");

        assertThat(report.metric()).isEqualTo("water");
        assertThat(report.compare()).isEqualTo("yoy");
        Point january = report.points().getFirst();
        assertThat(january.electricUnits()).isNull();
        assertThat(january.electricAmount()).isNull();
        assertThat(january.waterUnits()).isEqualByComparingTo("120.00");
        assertThat(january.yoy().electricUnits()).isNull();
        assertThat(january.yoy().waterUnits()).isNotNull();
        assertThat(report.summary().electricUnits()).isNull();
        assertThat(report.summary().peakElectric()).isNull();
        assertThat(report.summary().averageElectricUnitsPerMonth()).isNull();
        assertThat(report.summary().waterUnits()).isEqualByComparingTo("180.00");
    }

    @Test
    @DisplayName("SSK-181 สรุปเฉพาะช่วงที่ขอ เฉลี่ยหารเดือนที่มีข้อมูล จุดสูงสุดเท่ากันเอาจุดแรก")
    void summary() {
        BuildingUsageReport report = report("both", "month", "yoy", "2026-01", "2026-03");

        assertThat(report.totalRooms()).isEqualTo(24);
        assertThat(report.summary().electricUnits()).isEqualByComparingTo("600.00");
        assertThat(report.summary().months()).isEqualTo(3);
        assertThat(report.summary().monthsWithData()).isEqualTo(2);
        assertThat(report.summary().averageElectricUnitsPerMonth()).isEqualByComparingTo("300.00");
        assertThat(report.summary().peakElectric()).isEqualTo(new Peak("2026-02", new BigDecimal("600.00")));
        assertThat(report.summary().peakWater()).isEqualTo(new Peak("2026-01", new BigDecimal("120.00")));

        List<BuildingMonth> tie = List.of(month("2026-01", 1, "5.00", "1.00", null, null, 1, 0),
                month("2026-02", 1, "5.00", "1.00", null, null, 1, 0));
        assertThat(BuildingUsageSeries.of(query("both", "month", null, "2026-01", "2026-02"), tie, 1).summary()
                .peakElectric().period()).isEqualTo("2026-01");
    }

    @Test
    @DisplayName("SSK-181 ไม่มีข้อมูลทั้งช่วง ยอดและเฉลี่ยและจุดสูงสุดเป็น null")
    void nothingAtAll() {
        BuildingUsageReport report = BuildingUsageSeries.of(query("both", "year", null, "2019-01", "2019-12"),
                List.of(), 3);

        assertThat(report.points()).hasSize(1);
        assertThat(report.summary().electricUnits()).isNull();
        assertThat(report.summary().averageWaterUnitsPerMonth()).isNull();
        assertThat(report.summary().peakWater()).isNull();
        assertThat(report.summary().monthsWithData()).isZero();
        assertThat(report.compare()).isNull();
    }

    @Test
    @DisplayName("SSK-181 เปอร์เซ็นต์ปัดสองตำแหน่งแบบ HALF_UP ส่วนต่างติดลบได้")
    void percentRounding() {
        assertThat(BuildingUsageSeries.change(new BigDecimal("2.00"), new BigDecimal("3.00")))
                .isEqualTo(new Change(new BigDecimal("3.00"), new BigDecimal("-1.00"), new BigDecimal("-33.33")));
        assertThat(BuildingUsageSeries.change(new BigDecimal("1.00"), new BigDecimal("0.00")).percent()).isNull();
    }

    private static BuildingUsageReport report(String metric, String granularity, String compare, String from,
            String to) {
        return BuildingUsageSeries.of(query(metric, granularity, compare, from, to), MONTHS, 24);
    }

    private static BuildingUsageQuery query(String metric, String granularity, String compare, String from,
            String to) {
        return BuildingUsageQuery.parse(metric, granularity, compare, from, to);
    }

    private static BuildingMonth month(String month, int occupied, String electric, String water,
            String electricAmount, String waterAmount, int withData, int withAmount) {
        return new BuildingMonth(YearMonth.parse(month), occupied, money(electric), money(water),
                money(electricAmount), money(waterAmount), withData, withAmount);
    }

    private static BigDecimal money(String value) {
        return value == null ? null : new BigDecimal(value);
    }
}
