package com.sakurasoul.apartment.reports;

import com.sakurasoul.apartment.reports.ReportQuery.GroupBy;
import com.sakurasoul.apartment.reports.SummaryReport.Row;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.YearMonth;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class SummaryReportTest {

    /** สี่ห้องสามผู้เช่า สองคนชื่อซ้ำ ห้อง 1001 อยู่ชั้น 10 ห้อง 212 ชั้น 2 สองเดือน ใส่สลับลำดับไว้ */
    private static final List<ReceiptFigures> RECEIPTS = List.of(
            figures("1001", 10, 3L, "Somchai", "2026-11", "1000.00", "1000.00"),
            figures("212", 2, 2L, "Somchai", "2026-10", "2000.00", "500.00"),
            figures("101", 1, 1L, "Anong", "2026-11", "3000.00", "0.00"),
            figures("102", 1, 2L, "Somchai", "2026-11", "4000.00", "4000.00"),
            figures("101", 1, 1L, "Anong", "2026-10", "5000.00", "5000.00"));

    @Test
    @DisplayName("SSK-170 ห้องเรียงตามผังตึก 101 102 212 1001 ห้องเดียวกันหลายเดือนรวมเป็นแถวเดียว")
    void unitsInLayoutOrder() {
        SummaryReport report = SummaryReport.of(query(GroupBy.UNIT), RECEIPTS);

        assertThat(report.rows()).extracting(Row::key).containsExactly("101", "102", "212", "1001");
        assertThat(report.rows()).extracting(Row::label).containsExactly("101", "102", "212", "1001");
        Row room101 = report.rows().getFirst();
        assertThat(room101.receiptCount()).isEqualTo(2);
        assertThat(room101.billed()).isEqualByComparingTo("8000.00");
        assertThat(room101.received()).isEqualByComparingTo("5000.00");
        assertThat(room101.outstanding()).isEqualByComparingTo("3000.00");
    }

    @Test
    @DisplayName("SSK-170 ผู้เช่าชื่อซ้ำเป็นคนละแถวตาม id key เป็น id label เป็นชื่อ เรียงตามชื่อแล้วตาม id")
    void tenantsByIdOrderedByName() {
        SummaryReport report = SummaryReport.of(query(GroupBy.TENANT), RECEIPTS);

        assertThat(report.rows()).extracting(Row::key).containsExactly("1", "2", "3");
        assertThat(report.rows()).extracting(Row::label).containsExactly("Anong", "Somchai", "Somchai");
        assertThat(report.rows().get(1).receiptCount()).isEqualTo(2);
        assertThat(report.rows().get(1).billed()).isEqualByComparingTo("6000.00");
    }

    @Test
    @DisplayName("SSK-170 เดือนเรียงเก่าไปใหม่ key เป็น YYYY-MM label เป็นชื่อเดือนภาษาอังกฤษ")
    void monthsOldestFirst() {
        SummaryReport report = SummaryReport.of(query(GroupBy.MONTH), RECEIPTS);

        assertThat(report.rows()).extracting(Row::key).containsExactly("2026-10", "2026-11");
        assertThat(report.rows()).extracting(Row::label).containsExactly("Oct 2026", "Nov 2026");
        assertThat(report.groupBy()).isEqualTo("month");
        assertThat(report.from()).isEqualTo("2026-10");
        assertThat(report.to()).isEqualTo("2026-11");
    }

    @Test
    @DisplayName("SSK-170 total ของทั้งสามแบบเท่ากัน และเท่ากับผลรวมของแถวทุกช่อง")
    void everyGroupingHasTheSameTotal() {
        ReportTotals byUnit = SummaryReport.of(query(GroupBy.UNIT), RECEIPTS).total();

        for (GroupBy groupBy : GroupBy.values()) {
            SummaryReport report = SummaryReport.of(query(groupBy), RECEIPTS);
            assertThat(report.total()).as(groupBy.param()).isEqualTo(byUnit);
            assertThat(report.rows().stream().map(Row::totals).reduce(ReportTotals.ZERO, ReportTotals::plus))
                    .as(groupBy.param()).isEqualTo(report.total());
        }
        assertThat(byUnit.receiptCount()).isEqualTo(5);
        assertThat(byUnit.billed()).isEqualByComparingTo("15000.00");
        assertThat(byUnit.received()).isEqualByComparingTo("10500.00");
        assertThat(byUnit.outstanding()).isEqualByComparingTo("4500.00");
    }

    @Test
    @DisplayName("SSK-170 ไม่มีใบเลย ได้แถวว่างกับ total เป็น 0.00 ทุกช่อง")
    void noReceipts() {
        SummaryReport report = SummaryReport.of(query(GroupBy.UNIT), List.of());

        assertThat(report.rows()).isEmpty();
        assertThat(report.total()).isEqualTo(ReportTotals.ZERO);
        assertThat(report.total().billed()).hasToString("0.00");
    }

    private static ReportQuery query(GroupBy groupBy) {
        return new ReportQuery(groupBy, YearMonth.of(2026, 10), YearMonth.of(2026, 11), null, null, null, null);
    }

    /** ใบที่มีแต่ค่าเช่าเท่ากับยอด เพียงพอสำหรับทดสอบการจัดกลุ่ม */
    private static ReceiptFigures figures(String room, int floor, long tenantId, String tenant, String month,
            String billed, String received) {
        BigDecimal zero = new BigDecimal("0.00");
        BigDecimal bill = new BigDecimal(billed);
        BigDecimal paid = new BigDecimal(received);
        return new ReceiptFigures(room, (short) floor, tenantId, tenant, YearMonth.parse(month),
                new ReportTotals(1, bill, zero, zero, zero, zero, zero, zero, zero, zero, bill, paid,
                        bill.subtract(paid)));
    }
}
