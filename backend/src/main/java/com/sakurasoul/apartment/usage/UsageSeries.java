package com.sakurasoul.apartment.usage;

import java.math.BigDecimal;
import java.time.YearMonth;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.stream.Collectors;

/**
 * ประกอบยอดรายเดือนจากฐานข้อมูลเป็นจุดของกราฟ (SSK-167) กฎเดียวกับ aggregateUsage ใน frontend/src/domain/usage.ts
 * <ul>
 *   <li>ได้ทุกเดือน (หรือทุกปี) ในช่วงเสมอ ช่วงที่ไม่มีข้อมูลได้ 0 กับ hasData = false ไม่ข้ามและไม่ส่ง null</li>
 *   <li>รายปีคือผลรวมของเดือนในปีนั้นที่อยู่ในช่วงเท่านั้น ช่วง พ.ย. 2025 ถึง ก.พ. 2026 ได้ปี 2025 สองเดือนกับปี 2026 สองเดือน</li>
 * </ul>
 * ไม่แตะฐานข้อมูล ยอดรายเดือนส่งเข้ามาจาก UsageReader เทสจึงคุมกฎทั้งหมดได้โดยไม่ต้องมี Spring
 */
final class UsageSeries {

    private static final BigDecimal NO_UNITS = new BigDecimal("0.00");

    private UsageSeries() {
    }

    /** monthlyTotals มีเฉพาะเดือนที่มีข้อมูล เดือนที่มีข้อมูลแต่ใช้ศูนย์หน่วยจริงก็อยู่ในนี้ด้วยค่า 0 */
    static List<UsagePoint> of(UsageQuery query, Map<YearMonth, BigDecimal> monthlyTotals) {
        String scopeId = query.scopeId();
        List<YearMonth> months = query.months();
        if (query.granularity() == UsageQuery.Granularity.MONTH) {
            return months.stream()
                    .map(month -> point(month.toString(), scopeId, List.of(month), monthlyTotals))
                    .toList();
        }
        Map<Integer, List<YearMonth>> monthsByYear = months.stream()
                .collect(Collectors.groupingBy(YearMonth::getYear, TreeMap::new, Collectors.toList()));
        return monthsByYear.entrySet().stream()
                .map(year -> point(String.valueOf(year.getKey()), scopeId, year.getValue(), monthlyTotals))
                .toList();
    }

    private static UsagePoint point(String period, String scopeId, List<YearMonth> months,
            Map<YearMonth, BigDecimal> monthlyTotals) {
        BigDecimal units = months.stream()
                .map(month -> monthlyTotals.getOrDefault(month, NO_UNITS))
                .reduce(NO_UNITS, BigDecimal::add);
        boolean hasData = months.stream().anyMatch(monthlyTotals::containsKey);
        return new UsagePoint(period, scopeId, units, hasData);
    }
}
