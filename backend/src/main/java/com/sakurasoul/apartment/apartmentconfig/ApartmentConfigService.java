package com.sakurasoul.apartment.apartmentconfig;

import com.sakurasoul.apartment.apartmentconfig.ApartmentConfigDtos.ApartmentConfigRequest;
import com.sakurasoul.apartment.apartmentconfig.ApartmentConfigDtos.ApartmentConfigResponse;
import com.sakurasoul.apartment.common.NotFoundException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.temporal.ChronoUnit;

@Service
public class ApartmentConfigService {

    /** ตารางนี้มีแถวเดียวเสมอ id ถูกล็อกไว้ด้วย CHECK constraint ใน V3 */
    private static final short SINGLETON_ID = 1;

    /**
     * คอลัมน์อัตราเป็น NUMERIC(10,2) ฐานข้อมูลจึงปัดให้เหลือสองตำแหน่งอยู่แล้ว
     * ถ้าไม่ปัดเองก่อนตอบกลับ คนที่ส่ง 8.005 มาจะได้ response ว่า 8.005
     * แต่พอ GET รอบถัดไปกลับได้ 8.01 ซึ่งดูเหมือนระบบแอบเปลี่ยนค่าให้
     */
    private static final int RATE_SCALE = 2;

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
        // ตัดทศนิยมของ Instant ให้เหลือมิลลิวินาที เพราะรูปแบบ JSON ที่ตกลงไว้มีแค่สาม
        // ตำแหน่ง ถ้าเก็บละเอียดกว่านั้น ค่าที่ตอบกลับกับค่าที่อ่านจากฐานทีหลังจะไม่ตรงกัน
        config.apply(round(request.electricRatePerUnit()), round(request.waterRatePerUnit()),
                round(request.commonAreaFee()), round(request.internetFee()),
                Instant.now().truncatedTo(ChronoUnit.MILLIS));

        // flush ก่อนประกอบ response เพื่อให้ constraint ฝั่งฐานข้อมูลดังตรงนี้เลย
        // ไม่ใช่ไปดังตอน commit หลัง controller ตอบ 200 ไปแล้ว
        apartmentConfigRepository.saveAndFlush(config);

        return ApartmentConfigResponse.of(config);
    }

    /** ปัดให้ตรงกับที่ NUMERIC(10,2) เก็บจริง ดูเหตุผลที่ RATE_SCALE */
    private static BigDecimal round(BigDecimal value) {
        return value.setScale(RATE_SCALE, RoundingMode.HALF_UP);
    }

    /**
     * แถวเดียวของตารางนี้ถูกใส่ไว้ตั้งแต่ migration V3 ถ้าหาไม่เจอแปลว่ามีคนลบทิ้ง
     * หรือ migration ไม่ได้รัน ซึ่งควรดังออกมาเป็น 404 ให้เห็น ไม่ใช่เงียบแล้วสร้างใหม่
     * เพราะการสร้างใหม่เงียบ ๆ จะทำให้อัตราเด้งกลับไปเป็นค่าตั้งต้นโดยไม่มีใครรู้
     */
    private ApartmentConfig load() {
        return apartmentConfigRepository.findById(SINGLETON_ID)
                .orElseThrow(() -> new NotFoundException(
                        "ไม่พบอัตราค่าสาธารณูปโภคในระบบ ตรวจว่า migration V3 รันแล้ว"));
    }
}
