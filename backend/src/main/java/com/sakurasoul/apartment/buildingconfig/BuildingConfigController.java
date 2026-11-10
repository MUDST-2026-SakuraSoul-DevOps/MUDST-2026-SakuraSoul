package com.sakurasoul.apartment.buildingconfig;

import com.sakurasoul.apartment.buildingconfig.BuildingConfigDtos.BuildingConfigRequest;
import com.sakurasoul.apartment.buildingconfig.BuildingConfigDtos.BuildingConfigResponse;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * ผังตึก จำนวนชั้นกับจำนวนห้องต่อชั้น (SSK-160) ตาม docs/api-contract-building-config.md
 * <p>
 * ไม่มี POST กับ DELETE เพราะตารางมีแถวเดียวที่ migration ใส่ไว้ให้แล้ว เพิ่มลดห้องทำผ่าน PUT ทีเดียวทั้งผัง
 * ไม่ใส่ @Valid เพราะการตรวจอยู่ที่ BuildingConfigRules ให้ข้อความเตือนออกทาง detail ที่หน้าเว็บอ่านไปโชว์
 */
@RestController
@RequestMapping("/api/building-config")
public class BuildingConfigController {

    private final BuildingConfigService buildingConfigService;

    public BuildingConfigController(BuildingConfigService buildingConfigService) {
        this.buildingConfigService = buildingConfigService;
    }

    @GetMapping
    public BuildingConfigResponse get() {
        return buildingConfigService.get();
    }

    @PutMapping
    public BuildingConfigResponse update(@RequestBody BuildingConfigRequest request) {
        return buildingConfigService.update(request);
    }
}
