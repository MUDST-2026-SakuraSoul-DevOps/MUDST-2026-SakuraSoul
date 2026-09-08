package com.sakurasoul.apartment.apartmentconfig;

import com.sakurasoul.apartment.apartmentconfig.ApartmentConfigDtos.ApartmentConfigRequest;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * เทสของ US-16-S2 เรื่องอัตราที่กรอกผิด
 * <p>
 * เคสชุดนี้ล้อมาจาก apartmentConfig.test.ts ฝั่งหน้าเว็บโดยตั้งใจ เพราะสองฝั่งต้อง
 * ตัดสินเหมือนกันและขึ้นข้อความเหมือนกัน ถ้าเทสฝั่งไหนเปลี่ยนต้องเปลี่ยนอีกฝั่งด้วย
 * <p>
 * ฝั่งโน้นมีเคส Infinity เพิ่มมาเพราะช่อง input type="number" คืน NaN กับ Infinity ได้
 * ฝั่งนี้ BigDecimal เป็นอนันต์ไม่ได้ ค่าที่หายไปจะมาถึงเป็น null แทน
 */
class ApartmentConfigRulesTest {

    @Test
    @DisplayName("กรอกครบและเป็นบวกทุกช่องต้องผ่าน")
    void acceptsValidRates() {
        assertThat(ApartmentConfigRules.validate(request("8", "18", "300", "250"))).isNull();
    }

    @Test
    @DisplayName("ศูนย์ใช้ได้ หอบางที่ไม่คิดค่าส่วนกลางหรือค่าอินเทอร์เน็ต")
    void acceptsZero() {
        assertThat(ApartmentConfigRules.validate(request("8", "18", "0", "0"))).isNull();
    }

    @Test
    @DisplayName("ค่าไฟติดลบต้องถูกปฏิเสธพร้อมบอกชื่อช่อง")
    void rejectsNegativeElectric() {
        assertThat(ApartmentConfigRules.validate(request("-1", "18", "300", "250")))
                .isEqualTo("ค่าไฟต่อหน่วย ต้องไม่ติดลบ");
    }

    @Test
    @DisplayName("ค่าน้ำติดลบแม้แต่เศษส่วนก็ต้องถูกปฏิเสธ")
    void rejectsNegativeWater() {
        assertThat(ApartmentConfigRules.validate(request("8", "-0.5", "300", "250")))
                .isEqualTo("ค่าน้ำต่อหน่วย ต้องไม่ติดลบ");
    }

    @Test
    @DisplayName("ค่าส่วนกลางติดลบต้องถูกปฏิเสธ")
    void rejectsNegativeCommonArea() {
        assertThat(ApartmentConfigRules.validate(request("8", "18", "-100", "250")))
                .isEqualTo("ค่าส่วนกลาง ต้องไม่ติดลบ");
    }

    @Test
    @DisplayName("ค่าอินเทอร์เน็ตติดลบต้องถูกปฏิเสธ")
    void rejectsNegativeInternet() {
        assertThat(ApartmentConfigRules.validate(request("8", "18", "300", "-1")))
                .isEqualTo("ค่าอินเทอร์เน็ต ต้องไม่ติดลบ");
    }

    @Test
    @DisplayName("ช่องที่ไม่ได้ส่งมาเลยต้องบอกว่าต้องเป็นตัวเลข")
    void rejectsMissingValue() {
        ApartmentConfigRequest request = new ApartmentConfigRequest(new BigDecimal("8"), null,
                new BigDecimal("300"), new BigDecimal("250"));

        assertThat(ApartmentConfigRules.validate(request)).isEqualTo("ค่าน้ำต่อหน่วย ต้องเป็นตัวเลข");
    }

    @Test
    @DisplayName("ผิดหลายช่องพร้อมกันต้องรายงานช่องแรกตามลำดับ ไม่ใช่ช่องท้าย")
    void reportsOnlyTheFirstOffendingField() {
        assertThat(ApartmentConfigRules.validate(request("-1", "-1", "-1", "-1")))
                .isEqualTo("ค่าไฟต่อหน่วย ต้องไม่ติดลบ");
    }

    @Test
    @DisplayName("ค่าไฟที่พิมพ์เกินจริงไปมากต้องโดนเพดานกัน ไม่ปล่อยให้ใบเสร็จพุ่งเป็นล้าน")
    void rejectsAbsurdElectricRate() {
        assertThat(ApartmentConfigRules.validate(request("9999999", "18", "300", "250")))
                .isEqualTo("ค่าไฟต่อหน่วย สูงเกินไป กรอกได้ไม่เกิน 1,000 บาท");
    }

    @Test
    @DisplayName("ค่าน้ำเกินเพดานหนึ่งบาทก็ต้องไม่ผ่าน")
    void rejectsWaterJustOverTheCap() {
        assertThat(ApartmentConfigRules.validate(request("8", "1001", "300", "250")))
                .contains("สูงเกินไป");
    }

    @Test
    @DisplayName("ค่าที่พอดีเพดานยังผ่านได้")
    void acceptsExactlyAtTheCap() {
        assertThat(ApartmentConfigRules.validate(request("1000", "1000", "100000", "100000"))).isNull();
    }

    @Test
    @DisplayName("ค่าส่วนกลางเกินเพดานต้องบอกเพดานเป็นตัวเลขคั่นหลักพัน")
    void rejectsCommonAreaOverTheCap() {
        assertThat(ApartmentConfigRules.validate(request("8", "18", "100001", "250")))
                .isEqualTo("ค่าส่วนกลาง สูงเกินไป กรอกได้ไม่เกิน 100,000 บาท");
    }

    @Test
    @DisplayName("อัตราจริงที่หอพักใช้กันต้องผ่านหมด")
    void acceptsRealWorldRates() {
        assertThat(ApartmentConfigRules.validate(request("8", "18", "300", "250"))).isNull();
    }

    private static ApartmentConfigRequest request(String electric, String water,
            String commonArea, String internet) {
        return new ApartmentConfigRequest(new BigDecimal(electric), new BigDecimal(water),
                new BigDecimal(commonArea), new BigDecimal(internet));
    }
}
