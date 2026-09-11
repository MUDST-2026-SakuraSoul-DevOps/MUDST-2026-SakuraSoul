package com.sakurasoul.apartment.apartmentconfig;

import com.fasterxml.jackson.annotation.JsonFormat;

import java.math.BigDecimal;
import java.time.Instant;

/**
 * รูปร่าง request กับ response ของอัตราค่าสาธารณูปโภค ตกลงไว้ใน docs/api-contract-lease.md
 * <p>
 * ไม่ได้ใส่ annotation ของ bean validation ไว้ที่ request ทั้งที่ปกติโปรเจกต์นี้ใส่
 * เพราะ handler ของ MethodArgumentNotValidException เอาข้อความไปใส่ที่ property ชื่อ
 * fields แล้วตั้ง detail เป็นข้อความกลาง ๆ ว่า "ข้อมูลที่ส่งมาไม่ถูกต้อง"
 * แต่หน้าเว็บอ่านข้อความจาก detail ไปโชว์ใต้ฟอร์มตรง ๆ และสัญญา API กำหนดว่าต้องได้
 * ข้อความที่บอกชื่อช่องที่ผิด การตรวจจึงไปอยู่ที่ ApartmentConfigRules แล้วโยน
 * IllegalArgumentException ซึ่ง handler แปลงเป็น 400 พร้อมข้อความเต็มใน detail
 */
public final class ApartmentConfigDtos {

    private ApartmentConfigDtos() {
    }

    /** ไม่รับ updatedAt เพราะ server เป็นคนใส่เองตอนบันทึก */
    public record ApartmentConfigRequest(
            BigDecimal electricRatePerUnit,
            BigDecimal waterRatePerUnit,
            BigDecimal commonAreaFee,
            BigDecimal internetFee) {
    }

    public record ApartmentConfigResponse(
            BigDecimal electricRatePerUnit,
            BigDecimal waterRatePerUnit,
            BigDecimal commonAreaFee,
            BigDecimal internetFee,

            /*
             * บังคับรูปแบบให้เป็น ISO-8601 โซน UTC ละเอียดระดับมิลลิวินาที ความยาวคงที่
             * เช่น 2026-09-11T03:12:45.123Z ที่ต้องล็อกความยาวเพราะหน้าเว็บเทียบ
             * updatedAt สองครั้งด้วยเครื่องหมาย > บนสตริงตรง ๆ
             * (frontend/src/api/client.test.ts) ถ้าปล่อยให้ Jackson ตัดศูนย์ท้ายทิ้ง
             * ตามใจ ความยาวจะไม่เท่ากันแล้วการเทียบแบบ lexicographic จะให้ผลผิด
             */
            @JsonFormat(shape = JsonFormat.Shape.STRING,
                    pattern = "yyyy-MM-dd'T'HH:mm:ss.SSSX", timezone = "UTC")
            Instant updatedAt) {

        public static ApartmentConfigResponse of(ApartmentConfig config) {
            return new ApartmentConfigResponse(config.getElectricRatePerUnit(),
                    config.getWaterRatePerUnit(), config.getCommonAreaFee(),
                    config.getInternetFee(), config.getUpdatedAt());
        }
    }
}
