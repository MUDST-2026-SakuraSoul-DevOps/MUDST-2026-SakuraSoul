package com.sakurasoul.apartment.reports;

import com.sakurasoul.apartment.common.csv.CsvFile;
import com.sakurasoul.apartment.common.csv.LineTrackedCsv;
import com.sakurasoul.apartment.reports.ReportQuery.GroupBy;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.YearMonth;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class ReportCsvTest {

    private static final String HEADER = ",receipt_count,rent,electric_units,electric_amount,water_units,water_amount,"
            + "common_area_fee,internet_fee,extra_charges,late_interest,billed,received,outstanding";

    @Test
    @DisplayName("SSK-170 หัวคอลัมน์ตาม groupBy แถวละกลุ่ม แถวสุดท้ายเป็น Total ตัวเลขทศนิยมสองตำแหน่งไม่มีจุลภาค")
    void headerRowsAndTotal() {
        CsvFile file = csv(GroupBy.UNIT, List.of(
                figures("101", "Anong", "2026-10", "10145.00", "5000.00"),
                figures("102", "Somchai", "2026-10", "0.00", "0.00")));

        assertThat(file.fileName()).isEqualTo("summary-unit-2026-10-2026-11.csv");
        assertThat(text(file)).isEqualTo("unit" + HEADER + "\r\n"
                + "101,1,10145.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,10145.00,5000.00,5145.00\r\n"
                + "102,1,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00\r\n"
                + "Total,2,10145.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,10145.00,5000.00,5145.00\r\n");
    }

    @Test
    @DisplayName("SSK-170 คอลัมน์แรกเป็นชื่อผู้เช่า หรือเดือนแบบ YYYY-MM")
    void theFirstColumnIsWhatPeopleRead() {
        List<ReceiptFigures> receipts = List.of(figures("101", "Anong", "2026-11", "1.00", "0.00"));

        assertThat(firstColumn(csv(GroupBy.TENANT, receipts))).containsExactly("tenant", "Anong", "Total");
        assertThat(firstColumn(csv(GroupBy.MONTH, receipts))).containsExactly("month", "2026-11", "Total");
    }

    @Test
    @DisplayName("SSK-170 ชื่อผู้เช่าที่เป็นสูตรถูกกันด้วย ' ชื่อที่มี comma อยู่ใน quote")
    void tenantNamesCannotBecomeFormulas() {
        CsvFile file = csv(GroupBy.TENANT, List.of(
                figures("101", "=HYPERLINK(\"http://x\")", "2026-11", "1.00", "0.00"),
                figures("102", "Smith, John", "2026-11", "1.00", "0.00")));

        assertThat(text(file)).contains("\r\n\"'=HYPERLINK(\"\"http://x\"\")\",1,")
                .contains("\r\n\"Smith, John\",1,");
    }

    @Test
    @DisplayName("SSK-170 ไม่มีใบเลยได้หัวคอลัมน์กับแถว Total ที่เป็นศูนย์")
    void noReceipts() {
        assertThat(text(csv(GroupBy.MONTH, List.of()))).isEqualTo("month" + HEADER + "\r\n"
                + "Total,0,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00\r\n");
    }

    private static CsvFile csv(GroupBy groupBy, List<ReceiptFigures> receipts) {
        ReportQuery query = new ReportQuery(groupBy, YearMonth.of(2026, 10), YearMonth.of(2026, 11), null, null, null,
                null);
        return ReportCsv.of(SummaryReport.of(query, receipts), query);
    }

    private static String text(CsvFile file) {
        byte[] content = file.content();
        assertThat(content).startsWith(0xEF, 0xBB, 0xBF);
        return new String(content, 3, content.length - 3, StandardCharsets.UTF_8);
    }

    private static List<String> firstColumn(CsvFile file) {
        return LineTrackedCsv.readUtf8(file.content()).stream().map(row -> row.cells().getFirst()).toList();
    }

    private static ReceiptFigures figures(String room, String tenant, String month, String billed, String received) {
        BigDecimal zero = new BigDecimal("0.00");
        BigDecimal bill = new BigDecimal(billed);
        BigDecimal paid = new BigDecimal(received);
        return new ReceiptFigures(room, (short) 1, room.hashCode(), tenant, YearMonth.parse(month),
                new ReportTotals(1, bill, zero, zero, zero, zero, zero, zero, zero, zero, bill, paid,
                        bill.subtract(paid)));
    }
}
