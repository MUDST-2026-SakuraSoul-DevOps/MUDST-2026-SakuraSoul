package com.sakurasoul.apartment.roomrate;

import com.sakurasoul.apartment.roomrate.RoomRateDtos.RoomRateRequest;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import java.math.BigDecimal;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * กฎตรวจอัตราต่อห้องของ SSK-162 เขียนเป็นตารางเคส ข้อความต้องตรงกับ validateRoomRate ฝั่งหน้าเว็บทุกตัวอักษร
 * ช่องว่างในตาราง (ไม่ใส่ค่า) คือไม่ได้ส่งช่องนั้นมา
 */
class RoomRateRulesTest {

    private static final String MONTH = "Please choose the month the rate starts (YYYY-MM)";

    @ParameterizedTest(name = "month={0} rent={1} electric={2} internet={3}")
    @CsvSource({
            "2026-12, 3800, 9, 250",
            "2027-01, 0, 0, 0",
            "2026-12, 1000000, 1000, 100000",
    })
    @DisplayName("ค่าที่อยู่ในช่วงต้องผ่าน รวมค่าศูนย์และค่าเพดานพอดี")
    void validRatesPass(String month, String rent, String electric, String internet) {
        assertThat(RoomRateRules.validate(request(month, rent, electric, internet, null))).isNull();
    }

    @ParameterizedTest(name = "month={0} rent={1} electric={2} internet={3} -> {4}")
    @CsvSource(delimiter = '|', value = {
            "         | 3800    | 9    | 250    | " + MONTH,
            "2026-13  | 3800    | 9    | 250    | " + MONTH,
            "2026-1   | 3800    | 9    | 250    | " + MONTH,
            "Dec 2026 | 3800    | 9    | 250    | " + MONTH,
            "2026-12  |         | 9    | 250    | Monthly rent must be a number",
            "2026-12  | -1      | 9    | 250    | Monthly rent cannot be negative",
            "2026-12  | 1000001 | 9    | 250    | Monthly rent is too high",
            "2026-12  | 3800    |      | 250    | Electricity rate per unit must be a number",
            "2026-12  | 3800    | -0.5 | 250    | Electricity rate per unit cannot be negative",
            "2026-12  | 3800    | 1001 | 250    | Electricity rate per unit is too high. The maximum is ฿1,000.00",
            "2026-12  | 3800    | 9    | 100001 | Internet fee is too high. The maximum is ฿100,000.00",
            // ผิดหลายช่องได้ข้อความของช่องแรก ลำดับเดียวกับฟอร์ม: เดือน → ค่าเช่า → อัตราสี่ตัว
            "2026-13  | -1      | -1   | -1     | " + MONTH,
            "2026-12  | -1      | -1   | -1     | Monthly rent cannot be negative",
    })
    @DisplayName("ค่าที่ผิดต้องได้ข้อความของช่องแรกที่ผิด")
    void invalidRatesReportTheFirstProblem(String month, String rent, String electric, String internet,
            String message) {
        assertThat(RoomRateRules.validate(request(month, rent, electric, internet, null))).isEqualTo(message);
    }

    @Test
    @DisplayName("โน้ตยาวเกิน 200 ตัวถูกปฏิเสธ ช่องว่างหัวท้ายไม่นับ")
    void noteIsLimitedTo200Characters() {
        String exactly200 = "a".repeat(200);
        assertThat(RoomRateRules.validate(request("2026-12", "3800", "9", "250", "  " + exactly200 + "  ")))
                .isNull();
        assertThat(RoomRateRules.validate(request("2026-12", "3800", "9", "250", exactly200 + "b")))
                .isEqualTo("The note must be 200 characters or fewer");
    }

    /** ค่าน้ำกับค่าส่วนกลางคงที่ เพราะกฎของสองช่องนั้นมีเทสอยู่แล้วใน ApartmentConfigRulesTest */
    private static RoomRateRequest request(String month, String rent, String electric, String internet,
            String note) {
        return new RoomRateRequest(month, decimal(rent), decimal(electric), new BigDecimal("18"),
                new BigDecimal("300"), decimal(internet), note);
    }

    private static BigDecimal decimal(String value) {
        return value == null ? null : new BigDecimal(value);
    }
}
