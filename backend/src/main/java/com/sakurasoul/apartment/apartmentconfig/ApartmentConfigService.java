package com.sakurasoul.apartment.apartmentconfig;

import com.sakurasoul.apartment.apartmentconfig.ApartmentConfigDtos.ApartmentConfigRequest;
import com.sakurasoul.apartment.apartmentconfig.ApartmentConfigDtos.ApartmentConfigResponse;
import com.sakurasoul.apartment.common.NotFoundException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.ZoneId;

@Service
public class ApartmentConfigService {

    /** ตารางนี้มีแถวเดียวเสมอ id ถูกล็อกไว้ด้วย CHECK constraint ใน V4 */
    private static final short SINGLETON_ID = 1;

    /**
     * วันที่แก้ล่าสุดต้องเป็นวันตามเวลาไทย ไม่ใช่ UTC ไม่งั้นคนที่กดบันทึกตอนตีหนึ่ง
     * จะเห็นวันที่ย้อนหลังไปหนึ่งวัน
     * <p>
     * PR ของ SSK-10 เพิ่ม common/AppTime ที่ทำเรื่องเดียวกันนี้ไว้แล้ว พอสอง PR
     * merge เข้ามาครบให้ย้ายมาเรียกตัวนั้นแทนแล้วลบตรงนี้ทิ้ง ตอนนี้ยังเรียกไม่ได้
     * เพราะสอง branch แยกกันอยู่
     */
    private static final ZoneId BANGKOK = ZoneId.of("Asia/Bangkok");

    private final ApartmentConfigRepository apartmentConfigRepository;

    public ApartmentConfigService(ApartmentConfigRepository apartmentConfigRepository) {
        this.apartmentConfigRepository = apartmentConfigRepository;
    }

    @Transactional(readOnly = true)
    public ApartmentConfigResponse get() {
        return ApartmentConfigResponse.of(load());
    }

    /**
     * ตั้งอัตราใหม่ทั้งชุด (US-16-S1)
     * <p>
     * อัตราใหม่มีผลกับสัญญาที่สร้างหลังจากนี้เท่านั้น สัญญาที่เซ็นไปแล้วเก็บอัตรา
     * ของตัวเองไว้ในตาราง lease ตั้งแต่ตอนบันทึก จึงไม่ถูกกระทบ (US-16-S3)
     */
    @Transactional
    public ApartmentConfigResponse update(ApartmentConfigRequest request) {
        String invalid = ApartmentConfigRules.validate(request);
        if (invalid != null) {
            throw new IllegalArgumentException(invalid);
        }

        ApartmentConfig config = load();
        config.apply(request.electricRatePerUnit(), request.waterRatePerUnit(),
                request.commonAreaFee(), request.internetFee(), LocalDate.now(BANGKOK));

        return ApartmentConfigResponse.of(config);
    }

    /**
     * แถวเดียวของตารางนี้ถูกใส่ไว้ตั้งแต่ migration V4 ถ้าหาไม่เจอแปลว่ามีคนลบทิ้ง
     * หรือ migration ไม่ได้รัน ซึ่งควรดังออกมาเป็น 404 ให้เห็น ไม่ใช่เงียบแล้วสร้างใหม่
     * เพราะการสร้างใหม่เงียบ ๆ จะทำให้อัตราเด้งกลับไปเป็นค่าตั้งต้นโดยไม่มีใครรู้
     */
    private ApartmentConfig load() {
        return apartmentConfigRepository.findById(SINGLETON_ID)
                .orElseThrow(() -> new NotFoundException("อัตราค่าสาธารณูปโภค", SINGLETON_ID));
    }
}
