package com.sakurasoul.apartment.reports;

import com.sakurasoul.apartment.billing.Receipt;
import com.sakurasoul.apartment.billing.ReceiptStatus;
import com.sakurasoul.apartment.common.Months;
import com.sakurasoul.apartment.lease.Lease;

import java.time.LocalDate;
import java.time.YearMonth;
import java.time.temporal.ChronoUnit;
import java.util.Arrays;

/**
 * คำถามของรายงานสรุป (SSK-170) หลังตรวจพารามิเตอร์ของ GET /api/reports/summary แล้ว
 * <p>
 * ลำดับการตรวจ groupBy → from/to → ความยาวช่วง → status ตัวกรองห้อง ชั้น ผู้เช่าที่ชี้ของที่ไม่มีตอบ 404
 * ที่ SummaryReportService เพราะต้องถามฐานข้อมูล
 *
 * @param status   null คือทุกสถานะ
 * @param floor    null คือทุกชั้น
 * @param roomId   null คือทุกห้อง
 * @param tenantId null คือทุกคน
 */
public record ReportQuery(
        GroupBy groupBy,
        YearMonth from,
        YearMonth to,
        ReceiptStatus status,
        Short floor,
        Long roomId,
        Long tenantId) {

    /** สิบปีตามสัญญา API เท่ากับเพดานของกราฟการใช้น้ำไฟ (UsageQuery) */
    static final int MAX_MONTHS = 120;

    static final String RANGE_MESSAGE = "from and to must be YYYY-MM with from not after to";

    public enum GroupBy {
        UNIT("unit"),
        TENANT("tenant"),
        MONTH("month");

        private final String param;

        GroupBy(String param) {
            this.param = param;
        }

        /** ค่าในพารามิเตอร์ groupBy ในชื่อไฟล์ CSV และหัวคอลัมน์แรกของไฟล์ */
        public String param() {
            return param;
        }
    }

    /**
     * ตรวจพารามิเตอร์ตามลำดับ ตัวแรกที่ผิดโยน IllegalArgumentException พร้อมข้อความในสัญญา API (400)
     * groupBy ต้องตรงตัวพิมพ์ "Unit" ไม่ผ่าน แบบเดียวกับ metric ของ /api/usage
     */
    static ReportQuery parse(String groupBy, String from, String to, String status, Short floor, Long roomId,
            Long tenantId) {
        GroupBy parsedGroupBy = Arrays.stream(GroupBy.values())
                .filter(value -> value.param.equals(groupBy))
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException("groupBy must be unit, tenant or month"));

        YearMonth fromMonth = Months.parse(from, RANGE_MESSAGE);
        YearMonth toMonth = Months.parse(to, RANGE_MESSAGE);
        if (fromMonth.isAfter(toMonth)) {
            throw new IllegalArgumentException(RANGE_MESSAGE);
        }
        if (ChronoUnit.MONTHS.between(fromMonth, toMonth) + 1 > MAX_MONTHS) {
            throw new IllegalArgumentException("The range can be at most 10 years");
        }

        return new ReportQuery(parsedGroupBy, fromMonth, toMonth, ReceiptStatus.parseFilter(status), floor, roomId,
                tenantId);
    }

    /** วันที่ 1 ของเดือนแรก billing_month เก็บเป็นวันที่ 1 ของเดือนเสมอ */
    LocalDate firstMonth() {
        return from.atDay(1);
    }

    LocalDate lastMonth() {
        return to.atDay(1);
    }

    /**
     * ใบนี้ผ่านตัวกรองทุกตัวไหม (AND กันทุกตัว) ชุดตัวกรองที่ขัดกันเอง เช่น ห้องที่ไม่ได้อยู่ชั้นนั้น ได้รายงานว่าง ไม่ใช่ error
     * <p>
     * ห้องกับผู้เช่าเทียบด้วย id ของสัญญา ชั้นอ่านจากสำเนาห้องในสัญญา (SSK-180) ซึ่งเป็นชั้นที่ใบนั้นออกให้
     * status คือสถานะของใบเองตอนนี้ (ReceiptStatus)
     */
    boolean matches(Receipt receipt) {
        Lease lease = receipt.getLease();
        return (status == null || receipt.getStatus() == status)
                && (floor == null || lease.getRoomSnapshot().getFloor() == floor)
                && (roomId == null || lease.getRoom().getId().equals(roomId))
                && (tenantId == null || lease.getTenant().getId().equals(tenantId));
    }

    /** summary-unit-2026-10-2026-11.csv ตามสัญญา API */
    String fileName() {
        return "summary-" + groupBy.param + "-" + from + "-" + to + ".csv";
    }
}
