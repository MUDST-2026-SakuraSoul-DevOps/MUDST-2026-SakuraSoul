package com.sakurasoul.apartment.usage;

import com.sakurasoul.apartment.common.Money;
import com.sakurasoul.apartment.common.csv.CsvFile;
import com.sakurasoul.apartment.common.csv.CsvWriter;
import com.sakurasoul.apartment.usage.BuildingUsageReport.Change;
import com.sakurasoul.apartment.usage.BuildingUsageReport.Point;
import com.sakurasoul.apartment.usage.BuildingUsageReport.Summary;
import com.sakurasoul.apartment.usage.BuildingUsageReport.Yoy;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Function;

/**
 * ภาพรวมทั้งตึกเป็นไฟล์ CSV (SSK-181) แถวแรกเป็นหัวคอลัมน์ภาษาอังกฤษ แถวสุดท้ายเป็นแถวรวมจาก summary
 * <ul>
 *   <li>คอลัมน์ของ metric ที่ไม่ได้ขอไม่อยู่ในไฟล์</li>
 *   <li>compare=yoy เพิ่มสามคอลัมน์ต่อค่า: ปีก่อน ส่วนต่าง และเปอร์เซ็นต์</li>
 *   <li>ไม่มีข้อมูลเป็นเซลล์ว่าง ไม่ใช่ 0 ตัวเลขทศนิยมสองตำแหน่งไม่มีจุลภาคคั่นหลักพัน จำนวนห้องและเดือนเป็นจำนวนเต็ม</li>
 *   <li>แถว Total ไม่มีจำนวนห้องและไม่มีเทียบปีก่อน เพราะสองอย่างนั้นไม่ได้รวมกันข้ามช่วง</li>
 * </ul>
 */
final class BuildingUsageCsv {

    private BuildingUsageCsv() {
    }

    /** ค่าหนึ่งคอลัมน์ของจุด ค่าเดียวกันในสรุป และค่าเดียวกันในการเทียบปีก่อน */
    private record Value(String name, Function<Point, BigDecimal> ofPoint, Function<Summary, BigDecimal> ofSummary,
            Function<Yoy, Change> ofYoy) {
    }

    static CsvFile of(BuildingUsageReport report, BuildingUsageQuery query) {
        List<Value> values = new ArrayList<>();
        if (query.metric().includesElectric()) {
            values.add(new Value("electric_units", Point::electricUnits, Summary::electricUnits, Yoy::electricUnits));
            values.add(new Value("electric_amount", Point::electricAmount, Summary::electricAmount,
                    Yoy::electricAmount));
        }
        if (query.metric().includesWater()) {
            values.add(new Value("water_units", Point::waterUnits, Summary::waterUnits, Yoy::waterUnits));
            values.add(new Value("water_amount", Point::waterAmount, Summary::waterAmount, Yoy::waterAmount));
        }

        List<List<String>> lines = new ArrayList<>();
        List<String> header = new ArrayList<>(List.of("period", "occupied_rooms", "rooms_with_data",
                "rooms_with_amount", "months_with_data"));
        values.forEach(value -> header.add(value.name()));
        if (query.yoy()) {
            values.forEach(value -> header.addAll(List.of(value.name() + "_previous", value.name() + "_diff",
                    value.name() + "_diff_percent")));
        }
        lines.add(header);

        for (Point point : report.points()) {
            List<String> line = new ArrayList<>(List.of(point.period(), String.valueOf(point.occupiedRooms()),
                    String.valueOf(point.roomsWithData()), String.valueOf(point.roomsWithAmount()),
                    String.valueOf(point.monthsWithData())));
            values.forEach(value -> line.add(number(value.ofPoint().apply(point))));
            if (query.yoy()) {
                values.forEach(value -> {
                    Change change = value.ofYoy().apply(point.yoy());
                    line.add(number(change.previous()));
                    line.add(number(change.difference()));
                    line.add(number(change.percent()));
                });
            }
            lines.add(line);
        }

        Summary summary = report.summary();
        List<String> total = new ArrayList<>(List.of("Total", "", "", "", String.valueOf(summary.monthsWithData())));
        values.forEach(value -> total.add(number(value.ofSummary().apply(summary))));
        if (query.yoy()) {
            values.forEach(value -> total.addAll(List.of("", "", "")));
        }
        lines.add(total);
        return new CsvFile(query.fileName(), CsvWriter.utf8WithBom(lines));
    }

    /** ไม่มีข้อมูลเป็นเซลล์ว่าง ทุกยอดมีสองตำแหน่งอยู่แล้ว setScale กันแค่ 0 ที่ไม่มีทศนิยม */
    private static String number(BigDecimal value) {
        return value == null ? "" : value.setScale(Money.SCALE, RoundingMode.HALF_UP).toPlainString();
    }
}
