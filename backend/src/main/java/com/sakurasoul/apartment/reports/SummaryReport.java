package com.sakurasoul.apartment.reports;

import com.sakurasoul.apartment.reports.ReportQuery.GroupBy;

import java.math.BigDecimal;
import java.time.YearMonth;
import java.time.format.DateTimeFormatter;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * คำตอบของ GET /api/reports/summary (SSK-170) ตามสัญญา API (#209)
 * <p>
 * แถวรวมจากใบที่อยู่ในกลุ่มเดียวกัน กลุ่มที่ไม่มีใบไม่มีแถว total รวมจากทุกใบตรง ๆ ไม่ได้รวมจากแถว
 * การจัดกลุ่มสามแบบแบ่งใบชุดเดียวกัน total จึงเท่ากันทุกแบบเสมอ
 *
 * @param from YYYY-MM
 * @param to   YYYY-MM
 */
public record SummaryReport(String groupBy, String from, String to, List<Row> rows, ReportTotals total) {

    private static final DateTimeFormatter MONTH_LABEL = DateTimeFormatter.ofPattern("MMM yyyy", Locale.ENGLISH);

    /**
     * แถวของรายงาน ช่องตัวเลขเขียนแยกทีละช่องแทนการซ้อน ReportTotals ไว้ข้างใน เพราะสัญญา API ให้ทุกช่องอยู่ระดับเดียวกับ key
     *
     * @param key   ห้อง: เลขห้อง ผู้เช่า: id ของผู้เช่า เดือน: YYYY-MM
     * @param label ห้อง: เลขห้อง ผู้เช่า: ชื่อ เดือน: Nov 2026
     */
    public record Row(
            String key,
            String label,
            int receiptCount,
            BigDecimal rent,
            BigDecimal electricUnits,
            BigDecimal electricAmount,
            BigDecimal waterUnits,
            BigDecimal waterAmount,
            BigDecimal commonAreaFee,
            BigDecimal internetFee,
            BigDecimal extraCharges,
            BigDecimal lateInterest,
            BigDecimal billed,
            BigDecimal received,
            BigDecimal outstanding) {

        static Row of(String key, String label, ReportTotals totals) {
            return new Row(key, label, totals.receiptCount(), totals.rent(), totals.electricUnits(),
                    totals.electricAmount(), totals.waterUnits(), totals.waterAmount(), totals.commonAreaFee(),
                    totals.internetFee(), totals.extraCharges(), totals.lateInterest(), totals.billed(),
                    totals.received(), totals.outstanding());
        }

        ReportTotals totals() {
            return new ReportTotals(receiptCount, rent, electricUnits, electricAmount, waterUnits, waterAmount,
                    commonAreaFee, internetFee, extraCharges, lateInterest, billed, received, outstanding);
        }
    }

    /**
     * จัดกลุ่มแล้วเรียงแถว
     * <ul>
     *   <li>ห้อง: ตามผังตึก ชั้น ความยาวเลขห้อง เลขห้อง (ลำดับเดียวกับ RoomRepository.findAllInLayoutOrder)</li>
     *   <li>ผู้เช่า: ตามชื่อ ชื่อซ้ำตาม id สองคนชื่อเดียวกันจึงเป็นสองแถว</li>
     *   <li>เดือน: เก่าไปใหม่</li>
     * </ul>
     */
    static SummaryReport of(ReportQuery query, List<ReceiptFigures> figures) {
        Map<String, Group> groups = new LinkedHashMap<>();
        ReportTotals total = ReportTotals.ZERO;
        for (ReceiptFigures receipt : figures.stream().sorted(orderOf(query.groupBy())).toList()) {
            groups.computeIfAbsent(keyOf(query.groupBy(), receipt),
                            key -> new Group(key, labelOf(query.groupBy(), receipt)))
                    .add(receipt.totals());
            total = total.plus(receipt.totals());
        }
        List<Row> rows = groups.values().stream().map(group -> Row.of(group.key, group.label, group.totals)).toList();
        return new SummaryReport(query.groupBy().param(), query.from().toString(), query.to().toString(), rows, total);
    }

    private static Comparator<ReceiptFigures> orderOf(GroupBy groupBy) {
        return switch (groupBy) {
            case UNIT -> Comparator.comparingInt(ReceiptFigures::floor)
                    .thenComparingInt(receipt -> receipt.roomNumber().length())
                    .thenComparing(ReceiptFigures::roomNumber);
            case TENANT -> Comparator.comparing(ReceiptFigures::tenantName).thenComparingLong(ReceiptFigures::tenantId);
            case MONTH -> Comparator.comparing(ReceiptFigures::month);
        };
    }

    private static String keyOf(GroupBy groupBy, ReceiptFigures receipt) {
        return switch (groupBy) {
            case UNIT -> receipt.roomNumber();
            case TENANT -> String.valueOf(receipt.tenantId());
            case MONTH -> receipt.month().toString();
        };
    }

    private static String labelOf(GroupBy groupBy, ReceiptFigures receipt) {
        return switch (groupBy) {
            case UNIT -> receipt.roomNumber();
            case TENANT -> receipt.tenantName();
            case MONTH -> monthLabel(receipt.month());
        };
    }

    static String monthLabel(YearMonth month) {
        return MONTH_LABEL.format(month);
    }

    private static final class Group {

        private final String key;
        private final String label;
        private ReportTotals totals = ReportTotals.ZERO;

        private Group(String key, String label) {
            this.key = key;
            this.label = label;
        }

        private void add(ReportTotals receipt) {
            totals = totals.plus(receipt);
        }
    }
}
