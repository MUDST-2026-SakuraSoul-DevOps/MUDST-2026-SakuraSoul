package com.sakurasoul.apartment.usage;

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
}
