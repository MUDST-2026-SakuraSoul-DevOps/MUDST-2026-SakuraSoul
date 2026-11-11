package com.sakurasoul.apartment.usage;

import com.sakurasoul.apartment.common.Money;
import com.sakurasoul.apartment.usage.BuildingUsageReport.Change;
import com.sakurasoul.apartment.usage.BuildingUsageReport.Peak;
import com.sakurasoul.apartment.usage.BuildingUsageReport.Point;
import com.sakurasoul.apartment.usage.BuildingUsageReport.Summary;
import com.sakurasoul.apartment.usage.BuildingUsageReport.Yoy;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.function.Function;
import java.util.function.ToIntFunction;
import java.util.stream.Collectors;

/**
 * ประกอบยอดรายเดือนของทั้งตึกเป็นคำตอบ (SSK-181) ไม่แตะฐานข้อมูล เทสจึงคุมกฎได้โดยไม่ต้องมี Spring
 * <ul>
 *   <li>ไม่มีข้อมูลเป็น null ไม่ใช่ 0 (การ์ด: "ตอบ null พร้อมจำนวนห้องที่มีข้อมูล ไม่ใช่ 0 เงียบๆ")
 *       ผลรวมของหลายเดือนเป็น null เมื่อทุกเดือนเป็น null</li>
 *   <li>รายปีรวมเฉพาะเดือนในช่วงที่ขอ จำนวนห้องใช้เดือนที่มากที่สุดของปี</li>
 *   <li>เทียบปีก่อนรวมเดือนเดียวกันของปีก่อน เดือนต่อเดือน ผู้เรียกต้องส่งเดือนของปีก่อนมาด้วย (readFrom)</li>
 * </ul>
 */
final class BuildingUsageSeries {

    private static final BigDecimal HUNDRED = new BigDecimal("100");

    private BuildingUsageSeries() {
    }

    /** @param months ยอดรายเดือนตั้งแต่ query.readFrom() ถึง query.to() เดือนที่ขาดถือว่าไม่มีข้อมูล */
    static BuildingUsageReport of(BuildingUsageQuery query, List<BuildingMonth> months, long totalRooms) {
        Map<YearMonth, BuildingMonth> byMonth = months.stream()
                .collect(Collectors.toMap(BuildingMonth::month, Function.identity()));
        Map<String, List<YearMonth>> periods = periodsOf(query);

        List<Point> points = periods.entrySet().stream()
                .map(period -> point(query, period.getKey(), period.getValue(), byMonth))
                .toList();
        Totals range = Totals.of(query.range().months(), byMonth);
        Summary summary = new Summary(
                electric(query, range.electricUnits), water(query, range.waterUnits),
                electric(query, range.electricAmount), water(query, range.waterAmount),
                range.monthsWithData, range.months,
                electric(query, average(range.electricUnits, range.monthsWithData)),
                water(query, average(range.waterUnits, range.monthsWithData)),
                query.metric().includesElectric() ? peak(points, Point::electricUnits) : null,
                query.metric().includesWater() ? peak(points, Point::waterUnits) : null);
        return new BuildingUsageReport(query.from().toString(), query.to().toString(), query.metric().param(),
                query.granularityParam(), query.yoy() ? "yoy" : null, totalRooms, points, summary);
    }

    /** ช่วงของคำตอบตามลำดับเวลา แต่ละช่วงคือรายการเดือนในช่วงที่ขอ */
    private static Map<String, List<YearMonth>> periodsOf(BuildingUsageQuery query) {
        Map<String, List<YearMonth>> periods = new LinkedHashMap<>();
        for (YearMonth month : query.range().months()) {
            String period = query.granularity() == UsageQuery.Granularity.MONTH
                    ? month.toString() : String.valueOf(month.getYear());
            periods.computeIfAbsent(period, key -> new ArrayList<>()).add(month);
        }
        return periods;
    }

    private static Point point(BuildingUsageQuery query, String period, List<YearMonth> months,
            Map<YearMonth, BuildingMonth> byMonth) {
        Totals current = Totals.of(months, byMonth);
        Yoy yoy = query.yoy() ? yoy(query, period, current, months, byMonth) : null;
        return new Point(period,
                electric(query, current.electricUnits), water(query, current.waterUnits),
                electric(query, current.electricAmount), water(query, current.waterAmount),
                current.occupiedRooms, current.roomsWithData, current.roomsWithAmount,
                current.monthsWithData, current.months, yoy);
    }

    private static Yoy yoy(BuildingUsageQuery query, String period, Totals current, List<YearMonth> months,
            Map<YearMonth, BuildingMonth> byMonth) {
        Totals previous = Totals.of(months.stream().map(month -> month.minusYears(1)).toList(), byMonth);
        String previousPeriod = query.granularity() == UsageQuery.Granularity.MONTH
                ? YearMonth.parse(period).minusYears(1).toString()
                : String.valueOf(Integer.parseInt(period) - 1);
        return new Yoy(previousPeriod, previous.monthsWithData,
                query.metric().includesElectric() ? change(current.electricUnits, previous.electricUnits) : null,
                query.metric().includesWater() ? change(current.waterUnits, previous.waterUnits) : null,
                query.metric().includesElectric() ? change(current.electricAmount, previous.electricAmount) : null,
                query.metric().includesWater() ? change(current.waterAmount, previous.waterAmount) : null);
    }

    static Change change(BigDecimal current, BigDecimal previous) {
        BigDecimal difference = current == null || previous == null ? null : current.subtract(previous);
        BigDecimal percent = difference == null || previous.signum() == 0 ? null
                : difference.multiply(HUNDRED).divide(previous, Money.SCALE, RoundingMode.HALF_UP);
        return new Change(previous, difference, percent);
    }

    private static BigDecimal average(BigDecimal total, int monthsWithData) {
        return total == null || monthsWithData == 0 ? null
                : total.divide(BigDecimal.valueOf(monthsWithData), Money.SCALE, RoundingMode.HALF_UP);
    }

    /** จุดที่ค่ามากที่สุด เท่ากันเอาจุดแรก ไม่มีข้อมูลเลยเป็น null */
    private static Peak peak(List<Point> points, Function<Point, BigDecimal> value) {
        Point best = null;
        for (Point point : points) {
            BigDecimal units = value.apply(point);
            if (units != null && (best == null || units.compareTo(value.apply(best)) > 0)) {
                best = point;
            }
        }
        return best == null ? null : new Peak(best.period(), value.apply(best));
    }

    private static BigDecimal electric(BuildingUsageQuery query, BigDecimal value) {
        return query.metric().includesElectric() ? value : null;
    }

    private static BigDecimal water(BuildingUsageQuery query, BigDecimal value) {
        return query.metric().includesWater() ? value : null;
    }

    /** ผลรวมของหลายเดือน ค่าเงินและหน่วยเป็น null เมื่อไม่มีเดือนไหนมีค่า จำนวนห้องใช้เดือนที่มากที่สุด */
    private record Totals(BigDecimal electricUnits, BigDecimal waterUnits, BigDecimal electricAmount,
            BigDecimal waterAmount, int occupiedRooms, int roomsWithData, int roomsWithAmount, int monthsWithData,
            int months) {

        static Totals of(Collection<YearMonth> months, Map<YearMonth, BuildingMonth> byMonth) {
            List<BuildingMonth> rows = months.stream()
                    .map(month -> byMonth.getOrDefault(month, BuildingMonth.empty(month)))
                    .toList();
            return new Totals(
                    sum(rows, BuildingMonth::electricUnits), sum(rows, BuildingMonth::waterUnits),
                    sum(rows, BuildingMonth::electricAmount), sum(rows, BuildingMonth::waterAmount),
                    max(rows, BuildingMonth::occupiedRooms), max(rows, BuildingMonth::roomsWithData),
                    max(rows, BuildingMonth::roomsWithAmount),
                    (int) rows.stream().filter(row -> row.roomsWithData() > 0).count(),
                    rows.size());
        }

        private static BigDecimal sum(List<BuildingMonth> rows, Function<BuildingMonth, BigDecimal> value) {
            return rows.stream().map(value).filter(Objects::nonNull).reduce(BigDecimal::add).orElse(null);
        }

        private static int max(List<BuildingMonth> rows, ToIntFunction<BuildingMonth> value) {
            return rows.stream().mapToInt(value).max().orElse(0);
        }
    }
}
