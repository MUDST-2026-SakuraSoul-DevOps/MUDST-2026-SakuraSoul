package com.sakurasoul.apartment.usage;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * GET /api/usage กราฟการใช้น้ำไฟรายเดือนหรือรายปี (SSK-167)
 * <p>
 * พารามิเตอร์ข้อความทุกตัวไม่บังคับที่นี่ UsageQuery.parse เป็นคนตอบ 400 ด้วยข้อความที่ตกลงไว้
 * ถ้าบังคับด้วย Spring ผู้ใช้จะได้ข้อความของ framework แทน
 */
@RestController
public class UsageController {

    private final UsageService usageService;

    public UsageController(UsageService usageService) {
        this.usageService = usageService;
    }

    @GetMapping("/api/usage")
    public List<UsagePoint> usage(
            @RequestParam(required = false) String metric,
            @RequestParam(required = false) String scope,
            @RequestParam(required = false) String granularity,
            @RequestParam(required = false) Long roomId,
            @RequestParam(required = false) Short floor,
            @RequestParam(required = false) String from,
            @RequestParam(required = false) String to) {
        return usageService.usage(UsageQuery.parse(metric, scope, granularity, roomId, floor, from, to));
    }
}
