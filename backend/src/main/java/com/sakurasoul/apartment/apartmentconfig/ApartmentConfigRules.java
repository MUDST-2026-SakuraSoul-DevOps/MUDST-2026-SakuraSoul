package com.sakurasoul.apartment.apartmentconfig;

import com.sakurasoul.apartment.apartmentconfig.ApartmentConfigDtos.ApartmentConfigRequest;

import java.math.BigDecimal;
import java.util.Locale;

/**
 * ตรวจอัตราค่าสาธารณูปโภคก่อนบันทึก ตาม US-16-S2
 * <p>
 * เป็นฝาแฝดของ validateApartmentConfig ใน frontend/src/domain/apartmentConfig.ts
 * ทั้งลำดับการตรวจ ชื่อช่อง เพดาน และข้อความ ต้องตรงกันเป๊ะ เพราะหน้าเว็บเตือน
 * ตั้งแต่ก่อนกดส่งด้วยกฎฝั่งโน้น แล้วฝั่งนี้เป็นตาข่ายชั้นสุดท้าย ถ้าสองฝั่งเขียน
 * ข้อความไม่เหมือนกัน ผู้ใช้จะเจอคำเตือนคนละแบบกับเรื่องเดียวกัน
 * <p>
 * แก้ที่นี่แล้วต้องไปแก้อีกฝั่งด้วยเสมอ
 */
final class ApartmentConfigRules {

    /**
     * เพดานของแต่ละช่อง มาจากที่ QA ทักว่าเดิมกรอกค่าไฟหน่วยละ 9999999 ก็ผ่าน
     * พิมพ์ผิดทีเดียวใบเสร็จพุ่งเป็นล้านโดยไม่มีอะไรทัก
     * <p>
     * ตัวเลขพวกนี้ตั้งไว้เป็นกันพิมพ์ผิด ไม่ใช่กฎธุรกิจ จึงเผื่อไว้เยอะมาก
     * ค่าไฟจริงในไทยอยู่ราวหน่วยละ 4 ถึง 8 บาท ค่าน้ำราว 20 ถึง 30 บาท
     */
    private static final BigDecimal MAX_PER_UNIT = new BigDecimal("1000");
    private static final BigDecimal MAX_PER_MONTH = new BigDecimal("100000");

    private ApartmentConfigRules() {
    }

    /** คืนข้อความเตือนช่องแรกที่ผิด หรือ null เมื่อกรอกถูกทุกช่อง */
    static String validate(ApartmentConfigRequest request) {
        String message = check("Electricity rate per unit", request.electricRatePerUnit(), MAX_PER_UNIT);
        if (message != null) {
            return message;
        }
        message = check("Water rate per unit", request.waterRatePerUnit(), MAX_PER_UNIT);
        if (message != null) {
            return message;
        }
        message = check("Common area fee", request.commonAreaFee(), MAX_PER_MONTH);
        if (message != null) {
            return message;
        }
        return check("Internet fee", request.internetFee(), MAX_PER_MONTH);
    }

    private static String check(String label, BigDecimal value, BigDecimal max) {
        // ช่องที่ไม่ได้ส่งมาเลยถือว่ากรอกไม่ครบ ข้อความเดียวกับฝั่งหน้าเว็บที่เจอ NaN
        // จากช่อง input type="number" ที่ยังว่างอยู่
        if (value == null) {
            return label + " must be a number";
        }
        if (value.signum() < 0) {
            return label + " cannot be negative";
        }
        if (value.compareTo(max) > 0) {
            return label + " is too high. The maximum is ¥" + groupDigits(max);
        }
        return null;
    }

    /** ให้ได้ 1,000 กับ 100,000 เหมือน yenAmount ที่ฝั่งหน้าเว็บใช้ เยนไม่มีทศนิยม */
    private static String groupDigits(BigDecimal value) {
        return String.format(Locale.US, "%,d", value.longValueExact());
    }
}
