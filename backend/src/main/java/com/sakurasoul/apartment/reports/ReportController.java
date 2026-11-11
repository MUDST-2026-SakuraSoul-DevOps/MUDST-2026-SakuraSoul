package com.sakurasoul.apartment.reports;

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
}
