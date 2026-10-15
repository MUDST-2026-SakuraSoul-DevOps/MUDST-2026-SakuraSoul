package com.sakurasoul.apartment.apartmentconfig;

import com.sakurasoul.apartment.apartmentconfig.ApartmentConfigDtos.ApartmentConfigRequest;
import com.sakurasoul.apartment.apartmentconfig.ApartmentConfigDtos.ApartmentConfigResponse;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * อัตราค่าสาธารณูปโภคระดับตึก (US-16) ตาม docs/api-contract-lease.md
 * <p>
 * ไม่มี POST กับ DELETE เพราะตารางมีแถวเดียวที่ migration ใส่ไว้ให้แล้ว
 * การใช้งานมีแค่ดูกับแก้
 * <p>
 * ไม่ใส่ @Valid เพราะการตรวจอยู่ที่ ApartmentConfigRules เพื่อให้ข้อความเตือน
 * ออกทางฟิลด์ detail ที่หน้าเว็บอ่านไปโชว์ ดูเหตุผลเต็มใน ApartmentConfigDtos
 */
@RestController
@RequestMapping("/api/apartment-config")
public class ApartmentConfigController {

    private final ApartmentConfigService apartmentConfigService;

    public ApartmentConfigController(ApartmentConfigService apartmentConfigService) {
        this.apartmentConfigService = apartmentConfigService;
    }

    @GetMapping
    public ApartmentConfigResponse get() {
        return apartmentConfigService.get();
    }

    @PutMapping
    public ApartmentConfigResponse update(@RequestBody ApartmentConfigRequest request) {
        return apartmentConfigService.update(request);
    }
}
