package com.sakurasoul.apartment.reports;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * รายงานสรุป (SSK-170)
 * <p>
 * พารามิเตอร์ข้อความทุกตัวไม่บังคับที่นี่ ReportQuery.parse เป็นคนตอบ 400 ด้วยข้อความในสัญญา API
 * ยกเว้น floor, roomId, tenantId ที่แปลงเป็นตัวเลขไม่ได้ Spring ตีกลับเป็น 400 เอง แบบเดียวกับ /api/usage
 */
@RestController
public class ReportController {

    private final SummaryReportService summaryReportService;

    public ReportController(SummaryReportService summaryReportService) {
        this.summaryReportService = summaryReportService;
    }

    @GetMapping("/api/reports/summary")
    public SummaryReport summary(
            @RequestParam(required = false) String groupBy,
            @RequestParam(required = false) String from,
            @RequestParam(required = false) String to,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) Short floor,
            @RequestParam(required = false) Long roomId,
            @RequestParam(required = false) Long tenantId) {
        return summaryReportService.summary(ReportQuery.parse(groupBy, from, to, status, floor, roomId, tenantId));
    }

    /**
     * รายงานเดียวกันเป็นไฟล์ CSV path เขียนเต็มตัว ไม่พึ่งการจับนามสกุลไฟล์ (suffix pattern matching) ซึ่ง Spring ไม่ทำแล้ว
     * <p>
     * ไม่ประกาศ produces CsvFile ตั้ง Content-Type ไว้ในคำตอบเอง ถ้าประกาศ fetch ของหน้าเว็บที่ส่ง
     * Accept: application/json ทุกครั้ง (send ใน client.ts) จะได้ 406 แม้แต่ตอน error ที่ควรได้ 400 พร้อมข้อความ
     * error จึงยังเป็น problem+json ตามปกติ (SummaryReportApiTest คุมทั้งสองข้อ)
     */
    @GetMapping("/api/reports/summary.csv")
    public ResponseEntity<byte[]> summaryCsv(
            @RequestParam(required = false) String groupBy,
            @RequestParam(required = false) String from,
            @RequestParam(required = false) String to,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) Short floor,
            @RequestParam(required = false) Long roomId,
            @RequestParam(required = false) Long tenantId) {
        ReportQuery query = ReportQuery.parse(groupBy, from, to, status, floor, roomId, tenantId);
        return ReportCsv.of(summaryReportService.summary(query), query).asAttachment();
    }
}
