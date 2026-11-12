package com.sakurasoul.apartment.apartmentconfig;

import com.sakurasoul.apartment.apartmentconfig.ApartmentConfigDtos.LateInterestRequest;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import java.math.BigDecimal;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * กฎของดอกเบี้ยค้างชำระกับวันผ่อนผัน (SSK-164) ข้อความตามตาราง error ใน docs/api-contract-payments-phase2.md
 * ค่าขอบทั้งสองด้านของทั้งสองช่อง
 */
class LateInterestRulesTest {

    @ParameterizedTest(name = "{0}% ต่อเดือน")
    @ValueSource(strings = {"0", "0.00", "1.5", "99.99", "100", "100.00"})
    @DisplayName("SSK-164 อัตรา 0 ถึง 100 รวมสองขอบผ่าน 0 คือไม่คิดดอกเบี้ย")
    void aRateFromZeroToOneHundredIsAccepted(String percent) {
        assertThat(LateInterestRules.validate(request(percent, "0"))).isNull();
    }

    /** 100.001 ปัดแล้วได้ 100.00 แต่ตรวจค่าที่ส่งมา ไม่ใช่ค่าหลังปัด */
    @ParameterizedTest(name = "{0}% ต่อเดือน")
    @ValueSource(strings = {"-0.01", "-1", "100.01", "100.001", "150"})
    @DisplayName("SSK-164 อัตราติดลบหรือเกิน 100 ไม่ผ่าน")
    void aRateOutsideTheRangeIsRejected(String percent) {
        assertThat(LateInterestRules.validate(request(percent, "0"))).isEqualTo(LateInterestRules.PERCENT_MESSAGE);
    }

    @Test
    @DisplayName("SSK-164 ไม่ส่งอัตรามาไม่ผ่าน ไม่ใช่คงค่าเดิม")
    void aMissingRateIsRejected() {
        assertThat(LateInterestRules.validate(new LateInterestRequest(null, BigDecimal.ZERO)))
                .isEqualTo("Late interest must be between 0 and 100 percent per month");
    }

    @ParameterizedTest(name = "{0} วัน")
    @ValueSource(strings = {"0", "7", "31", "2.0", "1E+1"})
    @DisplayName("SSK-164 วันผ่อนผันเป็นจำนวนเต็ม 0 ถึง 31 ผ่าน เขียนแบบมีศูนย์หลังจุดก็ยังเป็นจำนวนเต็ม")
    void wholeGraceDaysFromZeroToThirtyOneAreAccepted(String days) {
        assertThat(LateInterestRules.validate(request("1.5", days))).isNull();
    }

    @ParameterizedTest(name = "{0} วัน")
    @ValueSource(strings = {"-1", "32", "1.5", "0.5", "30.5"})
    @DisplayName("SSK-164 วันผ่อนผันติดลบ เกิน 31 หรือมีเศษไม่ผ่าน")
    void graceDaysOutsideTheRangeOrWithAFractionAreRejected(String days) {
        assertThat(LateInterestRules.validate(request("1.5", days))).isEqualTo(LateInterestRules.GRACE_DAYS_MESSAGE);
    }

    @Test
    @DisplayName("SSK-164 ไม่ส่งวันผ่อนผันมาไม่ผ่าน")
    void missingGraceDaysAreRejected() {
        assertThat(LateInterestRules.validate(new LateInterestRequest(new BigDecimal("1.5"), null)))
                .isEqualTo("Grace days must be a whole number from 0 to 31");
    }

    @Test
    @DisplayName("SSK-164 ผิดทั้งสองช่องได้ข้อความของอัตราก่อน ตามลำดับในฟอร์ม")
    void theRateIsCheckedBeforeTheGraceDays() {
        assertThat(LateInterestRules.validate(request("101", "32"))).isEqualTo(LateInterestRules.PERCENT_MESSAGE);
    }

    private static LateInterestRequest request(String percent, String graceDays) {
        return new LateInterestRequest(new BigDecimal(percent), new BigDecimal(graceDays));
    }
}
