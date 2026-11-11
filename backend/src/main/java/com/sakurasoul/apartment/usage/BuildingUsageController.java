package com.sakurasoul.apartment.usage;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * ภาพรวมการใช้น้ำไฟทั้งตึกหลายปี (SSK-181)
 * <p>
 * พารามิเตอร์ทุกตัวไม่บังคับที่นี่ BuildingUsageQuery.parse เป็นคนตอบ 400 ด้วยข้อความที่ตกลงไว้
 */
@RestController
public class BuildingUsageController {

    private final BuildingUsageService buildingUsageService;

    public BuildingUsageController(BuildingUsageService buildingUsageService) {
        this.buildingUsageService = buildingUsageService;
    }

    @GetMapping("/api/usage/building")
    public BuildingUsageReport building(
            @RequestParam(required = false) String from,
            @RequestParam(required = false) String to,
            @RequestParam(required = false) String metric,
            @RequestParam(required = false) String granularity,
            @RequestParam(required = false) String compare) {
        return buildingUsageService.report(BuildingUsageQuery.parse(metric, granularity, compare, from, to));
    }

    /**
     * ข้อมูลเดียวกันเป็นไฟล์ CSV (UTF-8 มี BOM) path เขียนเต็มตัว
     * <p>
     * ไม่ประกาศ produces CsvFile ตั้ง Content-Type ไว้ในคำตอบเอง ถ้าประกาศ fetch ของหน้าเว็บที่ส่ง
     * Accept: application/json ทุกครั้ง (send ใน client.ts) จะได้ 406 แม้แต่ตอน error (บทเรียนจาก SSK-169)
     */
    @GetMapping("/api/usage/building.csv")
    public ResponseEntity<byte[]> buildingCsv(
            @RequestParam(required = false) String from,
            @RequestParam(required = false) String to,
            @RequestParam(required = false) String metric,
            @RequestParam(required = false) String granularity,
            @RequestParam(required = false) String compare) {
        BuildingUsageQuery query = BuildingUsageQuery.parse(metric, granularity, compare, from, to);
        return BuildingUsageCsv.of(buildingUsageService.report(query), query).asAttachment();
    }
}
