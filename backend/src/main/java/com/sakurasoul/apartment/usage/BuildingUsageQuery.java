package com.sakurasoul.apartment.usage;

import com.sakurasoul.apartment.common.Whitespace;

import java.time.YearMonth;
import java.util.Arrays;
import java.util.Locale;

/**
 * คำถามของภาพรวมการใช้น้ำไฟทั้งตึก (SSK-181) หลังตรวจพารามิเตอร์ของ GET /api/usage/building แล้ว
 * <p>
 * ลำดับการตรวจ metric → granularity → compare → from/to → ความยาวช่วง ค่าที่ไม่ส่งหรือว่างได้ค่าตั้งต้น
 * (metric=both, granularity=month, ไม่เทียบปีก่อน) ค่าต้องตรงตัวพิมพ์แบบเดียวกับ /api/usage
 *
 * @param yoy เทียบกับช่วงเดียวกันของปีก่อน (compare=yoy)
 */
record BuildingUsageQuery(Metric metric, UsageQuery.Granularity granularity, boolean yoy, YearMonth from,
        YearMonth to) {

    enum Metric {
        ELECTRIC,
        WATER,
        BOTH;

        String param() {
            return name().toLowerCase(Locale.ROOT);
        }

        boolean includesElectric() {
            return this != WATER;
        }

        boolean includesWater() {
            return this != ELECTRIC;
        }
    }

    static BuildingUsageQuery parse(String metric, String granularity, String compare, String from, String to) {
        Metric parsedMetric = isBlank(metric) ? Metric.BOTH : Arrays.stream(Metric.values())
                .filter(value -> value.param().equals(metric))
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException("metric must be electric, water or both"));
        UsageQuery.Granularity parsedGranularity = isBlank(granularity) ? UsageQuery.Granularity.MONTH
                : Arrays.stream(UsageQuery.Granularity.values())
                        .filter(value -> value.name().toLowerCase(Locale.ROOT).equals(granularity))
                        .findFirst()
                        .orElseThrow(() -> new IllegalArgumentException("granularity must be month or year"));
        if (!isBlank(compare) && !compare.equals("yoy")) {
            throw new IllegalArgumentException("compare must be yoy");
        }
        UsageRange range = UsageRange.parse(from, to);
        return new BuildingUsageQuery(parsedMetric, parsedGranularity, !isBlank(compare), range.from(), range.to());
    }

    /** เดือนแรกที่ต้องอ่าน เทียบปีก่อนต้องอ่านย้อนไปอีกสิบสองเดือน ปีแรกของช่วงจึงมีค่าของปีก่อนจริง */
    YearMonth readFrom() {
        return yoy ? from.minusYears(1) : from;
    }

    UsageRange range() {
        return new UsageRange(from, to);
    }

    String granularityParam() {
        return granularity.name().toLowerCase(Locale.ROOT);
    }

    /** building-usage-month-2025-01-2026-12.csv */
    String fileName() {
        return "building-usage-" + granularityParam() + "-" + from + "-" + to + ".csv";
    }

    private static boolean isBlank(String text) {
        return text == null || Whitespace.trim(text).isEmpty();
    }
}
