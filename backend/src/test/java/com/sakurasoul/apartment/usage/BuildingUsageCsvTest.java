package com.sakurasoul.apartment.usage;

import com.sakurasoul.apartment.common.csv.CsvFile;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.YearMonth;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class BuildingUsageCsvTest {

    private static final List<BuildingMonth> MONTHS = List.of(
            new BuildingMonth(YearMonth.of(2025, 1), 10, new BigDecimal("50.00"), new BigDecimal("5.00"), null, null,
                    10, 0),
            new BuildingMonth(YearMonth.of(2026, 1), 12, new BigDecimal("40.00"), new BigDecimal("4.00"),
                    new BigDecimal("320.00"), new BigDecimal("72.00"), 12, 12));

    @Test
    @DisplayName("SSK-181 หัวคอลัมน์ แถวละช่วง ไม่มีข้อมูลเป็นเซลล์ว่าง แถว Total จากสรุป BOM และ CRLF")
    void monthlyBoth() {
        CsvFile file = csv("both", "month", null, "2026-01", "2026-02");

        assertThat(file.fileName()).isEqualTo("building-usage-month-2026-01-2026-02.csv");
        assertThat(text(file)).isEqualTo(
                "period,occupied_rooms,rooms_with_data,rooms_with_amount,months_with_data,"
                        + "electric_units,electric_amount,water_units,water_amount\r\n"
                        + "2026-01,12,12,12,1,40.00,320.00,4.00,72.00\r\n"
                        + "2026-02,0,0,0,0,,,,\r\n"
                        + "Total,,,,1,40.00,320.00,4.00,72.00\r\n");
    }

    @Test
    @DisplayName("SSK-181 metric=water ไม่มีคอลัมน์ไฟ compare=yoy เพิ่มปีก่อน ส่วนต่าง เปอร์เซ็นต์ ส่วนต่างติดลบไม่ถูกกันสูตร")
    void waterWithYoy() {
        CsvFile file = csv("water", "month", "yoy", "2026-01", "2026-01");

        assertThat(text(file)).isEqualTo(
                "period,occupied_rooms,rooms_with_data,rooms_with_amount,months_with_data,water_units,water_amount,"
                        + "water_units_previous,water_units_diff,water_units_diff_percent,"
                        + "water_amount_previous,water_amount_diff,water_amount_diff_percent\r\n"
                        + "2026-01,12,12,12,1,4.00,72.00,5.00,-1.00,-20.00,,,\r\n"
                        + "Total,,,,1,4.00,72.00,,,,,,\r\n");
    }

    private static CsvFile csv(String metric, String granularity, String compare, String from, String to) {
        BuildingUsageQuery query = BuildingUsageQuery.parse(metric, granularity, compare, from, to);
        return BuildingUsageCsv.of(BuildingUsageSeries.of(query, MONTHS, 24), query);
    }

    private static String text(CsvFile file) {
        byte[] content = file.content();
        assertThat(content).startsWith(0xEF, 0xBB, 0xBF);
        return new String(content, 3, content.length - 3, StandardCharsets.UTF_8);
    }
}
