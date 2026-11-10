package com.sakurasoul.apartment.meter;

import com.sakurasoul.apartment.common.Money;
import com.sakurasoul.apartment.common.Months;
import com.sakurasoul.apartment.common.csv.LineTrackedCsv;

import java.math.BigDecimal;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * ตรวจไฟล์ CSV ค่าน้ำค่าไฟ (SSK-166) เป็นฝาแฝดของ checkMeterCsv ใน frontend/src/domain/meterCsv.ts
 * <p>
 * ข้อความและลำดับการตรวจต้องตรงกันทุกตัวอักษร หน้าเว็บตรวจไฟล์ด้วยกฎฝั่งโน้นก่อนส่ง ฝั่งนี้เป็นตาข่ายชั้นสุดท้าย
 * กฎที่ฝั่งนี้มีเพิ่ม: ไฟล์ต้องเป็น UTF-8, ไม่รับเดือนอนาคต (ทีมตัดสิน 10 พ.ย. 2569) และหน่วยไม่เกินล้าน
 * <ul>
 *   <li>ปัญหาระดับไฟล์ โยน IllegalArgumentException ทั้งไฟล์ใช้ไม่ได้ (400) ตามลำดับ ขนาด → UTF-8 →
 *       เครื่องหมายคำพูด → หัวตาราง → ไม่มีแถวข้อมูล → แถวเกิน</li>
 *   <li>ปัญหารายแถว รายงานแค่ปัญหาแรกของแถว ตามลำดับ จำนวนช่อง → ห้อง → รูปแบบเดือน → เดือนอนาคต → หน่วย → ซ้ำในไฟล์</li>
 * </ul>
 * ไม่แตะฐานข้อมูล ห้องที่มีอยู่และเดือนปัจจุบันส่งเข้ามา เทสจึงคุมได้ครบโดยไม่ต้องมี Spring
 */
final class MeterCsv {

    static final List<String> HEADER = List.of("room_number", "month", "electric_units", "water_units");

    /** ขีดจำกัดที่ตกลงไว้ในการ์ด หน้าเว็บไม่ส่งไฟล์ที่ใหญ่กว่านี้อยู่แล้ว */
    static final int MAX_BYTES = 1_000_000;
    static final int MAX_ROWS = 5_000;

    /** ตัวเลขไม่ติดลบ ทศนิยมใช้จุด ไม่รับ 1e3, +5, .5 หรือจุลภาคคั่นหลักพัน เหมือน NUMBER ฝั่งหน้าเว็บ */
    private static final Pattern UNITS = Pattern.compile("\\d+(\\.\\d+)?");

    /** กันพิมพ์ผิดจนล้นคอลัมน์ NUMERIC(10,2) ห้องหนึ่งใช้ไฟเดือนละหลักร้อยหน่วย เพดานล้านเผื่อไว้มากแล้ว */
    private static final BigDecimal MAX_UNITS = new BigDecimal("1000000");

    /** จำนวนหลักของส่วนจำนวนเต็มของ MAX_UNITS เกินกว่านี้เกินเพดานแน่นอนโดยไม่ต้องแปลง */
    private static final int MAX_UNITS_DIGITS = 7;

    /** หลักทศนิยมที่ต้องใช้ปัดครึ่งขึ้นให้เหลือสองตำแหน่ง หลักถัดจากนี้ไม่มีผลกับผลลัพธ์ */
    private static final int DECIMALS_FOR_ROUNDING = 3;

    /** หนึ่งแถวที่ผ่านการตรวจ หน่วยปัดสองตำแหน่งแล้วตามคอลัมน์ NUMERIC(10,2) แบบเดียวกับหน่วยในใบเสร็จ */
    record Row(int line, String roomNumber, YearMonth month, BigDecimal electricUnits, BigDecimal waterUnits) {
    }

    record RowError(int line, String message) {
    }

    record Result(List<Row> rows, List<RowError> errors) {
    }

    private MeterCsv() {
    }

    static Result check(byte[] content, Set<String> roomNumbers, YearMonth currentMonth) {
        if (content.length > MAX_BYTES) {
            throw new IllegalArgumentException("The file is larger than 1 MB");
        }
        List<LineTrackedCsv.Row> records = LineTrackedCsv.readUtf8(content);
        if (records.isEmpty() || !isHeader(records.getFirst().cells())) {
            throw new IllegalArgumentException("The first line must be the header " + String.join(",", HEADER)
                    + ". Download the template to see the format.");
        }
        List<LineTrackedCsv.Row> data = records.subList(1, records.size());
        if (data.isEmpty()) {
            throw new IllegalArgumentException("The file has no data rows.");
        }
        if (data.size() > MAX_ROWS) {
            throw new IllegalArgumentException("The file has more than 5,000 rows. Split it into smaller files.");
        }

        List<Row> rows = new ArrayList<>();
        List<RowError> errors = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        for (LineTrackedCsv.Row record : data) {
            int line = record.line();
            List<String> cells = record.cells();
            if (cells.size() != HEADER.size()) {
                errors.add(new RowError(line, "Expected " + HEADER.size() + " columns but found " + cells.size()));
                continue;
            }
            String roomNumber = cells.get(0).trim();
            String monthText = cells.get(1).trim();
            String electricText = cells.get(2).trim();
            String waterText = cells.get(3).trim();

            if (!roomNumbers.contains(roomNumber)) {
                errors.add(new RowError(line, "Unit " + (roomNumber.isEmpty() ? "(blank)" : roomNumber)
                        + " does not exist"));
                continue;
            }
            if (!Months.isValid(monthText)) {
                errors.add(new RowError(line, "Month \"" + monthText + "\" must be YYYY-MM"));
                continue;
            }
            YearMonth month = YearMonth.parse(monthText);
            if (month.isAfter(currentMonth)) {
                errors.add(new RowError(line, "Month " + month + " is in the future"));
                continue;
            }
            if (!UNITS.matcher(electricText).matches() || !UNITS.matcher(waterText).matches()) {
                errors.add(new RowError(line, "Units must be numbers that are zero or more"));
                continue;
            }
            BigDecimal electricUnits = unitsOf(electricText);
            BigDecimal waterUnits = unitsOf(waterText);
            if (electricUnits == null || waterUnits == null
                    || electricUnits.compareTo(MAX_UNITS) > 0 || waterUnits.compareTo(MAX_UNITS) > 0) {
                errors.add(new RowError(line, "Units are too high"));
                continue;
            }
            if (!seen.add(roomNumber + "|" + month)) {
                errors.add(new RowError(line, "Unit " + roomNumber + " for " + month
                        + " appears more than once in the file"));
                continue;
            }
            rows.add(new Row(line, roomNumber, month, Money.round(electricUnits), Money.round(waterUnits)));
        }
        return new Result(List.copyOf(rows), List.copyOf(errors));
    }

    /**
     * แปลงหน่วยที่ผ่านรูปแบบ UNITS แล้วเป็นตัวเลข โดยไม่ยอมให้ช่องที่ยาวผิดปกติ (ไฟล์หนึ่งล้านไบต์ทั้งช่อง) กิน CPU
     * ตอนแปลงทั้งก้อน ส่วนจำนวนเต็มที่ยาวเกินเพดานคืน null แปลว่าสูงเกิน ส่วนทศนิยมตัดเหลือสามหลักก่อนแปลง
     * ผู้เรียกปัดครึ่งขึ้นเหลือสองตำแหน่งซึ่งดูแค่หลักที่สาม ผลจึงเท่ากับแปลงทั้งก้อนทุกกรณี
     */
    private static BigDecimal unitsOf(String text) {
        int dot = text.indexOf('.');
        String whole = dot < 0 ? text : text.substring(0, dot);
        int firstSignificant = 0;
        while (firstSignificant < whole.length() - 1 && whole.charAt(firstSignificant) == '0') {
            firstSignificant++;
        }
        whole = whole.substring(firstSignificant);
        if (whole.length() > MAX_UNITS_DIGITS) {
            return null;
        }
        if (dot < 0) {
            return new BigDecimal(whole);
        }
        String fraction = text.substring(dot + 1, Math.min(text.length(), dot + 1 + DECIMALS_FOR_ROUNDING));
        return new BigDecimal(whole + "." + fraction);
    }

    /** ไม่สนตัวพิมพ์เล็กใหญ่และช่องว่างหัวท้ายเหมือนหน้าเว็บ แต่ต้องครบสี่ช่องตามลำดับ */
    private static boolean isHeader(List<String> cells) {
        return cells.stream().map(cell -> cell.trim().toLowerCase(Locale.ROOT)).toList().equals(HEADER);
    }
}
