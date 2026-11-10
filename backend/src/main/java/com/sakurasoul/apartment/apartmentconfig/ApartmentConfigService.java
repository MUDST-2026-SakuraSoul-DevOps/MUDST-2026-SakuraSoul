package com.sakurasoul.apartment.apartmentconfig;

import com.sakurasoul.apartment.apartmentconfig.ApartmentConfigDtos.ApartmentConfigRequest;
import com.sakurasoul.apartment.apartmentconfig.ApartmentConfigDtos.ApartmentConfigResponse;
import com.sakurasoul.apartment.apartmentconfig.ApartmentConfigDtos.LateInterestRequest;
import com.sakurasoul.apartment.common.Money;
import com.sakurasoul.apartment.common.NotFoundException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.temporal.ChronoUnit;

@Service
public class ApartmentConfigService {

    /** ตารางนี้มีแถวเดียวเสมอ id ถูกล็อกไว้ด้วย CHECK constraint ใน V3 */
    private static final short SINGLETON_ID = 1;

    private final ApartmentConfigRepository apartmentConfigRepository;

    public ApartmentConfigService(ApartmentConfigRepository apartmentConfigRepository) {
        this.apartmentConfigRepository = apartmentConfigRepository;
    }

    @Transactional(readOnly = true)
    public ApartmentConfigResponse get() {
        return ApartmentConfigResponse.of(load());
    }

    /**
     * ตั้งอัตราใหม่ทั้งชุด (US-16-S1) ไม่แตะดอกเบี้ยค้างชำระ ซึ่งตั้งที่ {@link #updateLateInterest}
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

        ApartmentConfig config = loadForUpdate();
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

    /**
     * ตั้งดอกเบี้ยค้างชำระต่อเดือนกับวันผ่อนผัน (SSK-164) ไม่แตะอัตราสี่ตัวและ updatedAt
     * <p>
     * มีผลกับสัญญาที่ทำหลังจากนี้เท่านั้น สัญญาใหม่คัดลอกสองค่านี้ไปตอนเซ็น (LeaseService.create)
     * บิลของสัญญาเดิมจึงคิดดอกเบี้ยตามค่าที่ตกลงไว้ตอนเซ็นเสมอ
     */
    @Transactional
    public ApartmentConfigResponse updateLateInterest(LateInterestRequest request) {
        String invalid = LateInterestRules.validate(request);
        if (invalid != null) {
            throw new IllegalArgumentException(invalid);
        }

        ApartmentConfig config = loadForUpdate();
        // ผ่านกฎแล้ววันผ่อนผันเป็นจำนวนเต็ม 0 ถึง 31 แปลงเป็น short ได้เสมอ
        config.applyLateInterest(round(request.lateInterestPercentPerMonth()), request.graceDays().shortValueExact());
        apartmentConfigRepository.saveAndFlush(config);

        return ApartmentConfigResponse.of(config);
    }

    /** ปัดให้ตรงกับที่ NUMERIC(10,2) เก็บจริง ดูเหตุผลที่ {@link Money} */
    private static BigDecimal round(BigDecimal value) {
        return Money.round(value);
    }

    /**
     * แถวเดียวของตารางนี้ถูกใส่ไว้ตั้งแต่ migration V3 ถ้าหาไม่เจอแปลว่ามีคนลบทิ้ง
     * หรือ migration ไม่ได้รัน ซึ่งควรดังออกมาเป็น 404 ให้เห็น ไม่ใช่เงียบแล้วสร้างใหม่
     * เพราะการสร้างใหม่เงียบ ๆ จะทำให้อัตราเด้งกลับไปเป็นค่าตั้งต้นโดยไม่มีใครรู้
     */
    private ApartmentConfig load() {
        return apartmentConfigRepository.findById(SINGLETON_ID).orElseThrow(ApartmentConfigService::missingRow);
    }

    /** ทั้งสอง PUT อ่านแถวด้วยล็อก กันสองคำขอเขียนทั้งแถวทับค่าที่อีกฝั่งเพิ่งตั้ง ดู findByIdForUpdate */
    private ApartmentConfig loadForUpdate() {
        return apartmentConfigRepository.findByIdForUpdate(SINGLETON_ID).orElseThrow(ApartmentConfigService::missingRow);
    }

    private static NotFoundException missingRow() {
        return new NotFoundException("No apartment config in the database. Check that migration V3 has run");
    }
}
