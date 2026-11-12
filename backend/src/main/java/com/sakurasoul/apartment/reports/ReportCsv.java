package com.sakurasoul.apartment.reports;

import com.sakurasoul.apartment.common.Money;
import com.sakurasoul.apartment.common.csv.CsvFile;
import com.sakurasoul.apartment.common.csv.CsvWriter;
import com.sakurasoul.apartment.reports.SummaryReport.Row;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Stream;

/**
 * รายงานสรุปเป็นไฟล์ CSV (SSK-170) แถวแรกเป็นหัวคอลัมน์ภาษาอังกฤษ แถวสุดท้ายเป็นแถวรวม
 * <p>
 * คอลัมน์แรกคือสิ่งที่ผู้ใช้อ่าน: เลขห้อง ชื่อผู้เช่า หรือเดือนแบบ YYYY-MM (เรียงในโปรแกรมตารางได้)
 * ตัวเลขเป็นทศนิยมสองตำแหน่งไม่มีจุลภาคคั่นหลักพัน โปรแกรมตารางจึงอ่านเป็นตัวเลข จำนวนใบเป็นจำนวนเต็ม
 */
final class ReportCsv {

    private static final List<String> FIGURE_COLUMNS = List.of("receipt_count", "rent", "electric_units",
            "electric_amount", "water_units", "water_amount", "common_area_fee", "internet_fee", "extra_charges",
            "late_interest", "billed", "received", "outstanding");

    static final String TOTAL_LABEL = "Total";

    private ReportCsv() {
    }

    static CsvFile of(SummaryReport report, ReportQuery query) {
        List<List<String>> lines = new ArrayList<>();
        lines.add(Stream.concat(Stream.of(query.groupBy().param()), FIGURE_COLUMNS.stream()).toList());
        for (Row row : report.rows()) {
            lines.add(line(query.groupBy() == ReportQuery.GroupBy.MONTH ? row.key() : row.label(), row.totals()));
        }
        lines.add(line(TOTAL_LABEL, report.total()));
        return new CsvFile(query.fileName(), CsvWriter.utf8WithBom(lines));
    }

    private static List<String> line(String first, ReportTotals totals) {
        return List.of(first,
                String.valueOf(totals.receiptCount()),
                number(totals.rent()),
                number(totals.electricUnits()),
                number(totals.electricAmount()),
                number(totals.waterUnits()),
                number(totals.waterAmount()),
                number(totals.commonAreaFee()),
                number(totals.internetFee()),
                number(totals.extraCharges()),
                number(totals.lateInterest()),
                number(totals.billed()),
                number(totals.received()),
                number(totals.outstanding()));
    }

    /** ทุกยอดมีสองตำแหน่งอยู่แล้ว (Receipt ปัดตอนออก) setScale กันแค่ไม่ให้ 0 กลายเป็น "0" */
    private static String number(BigDecimal value) {
        return value.setScale(Money.SCALE, RoundingMode.UNNECESSARY).toPlainString();
    }
}
