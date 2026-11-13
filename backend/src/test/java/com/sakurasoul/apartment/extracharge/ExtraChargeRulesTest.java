package com.sakurasoul.apartment.extracharge;

import com.sakurasoul.apartment.extracharge.ExtraChargeDtos.ExtraChargeRequest;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import java.math.BigDecimal;
import java.time.YearMonth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * กฎตรวจค่าใช้จ่ายพิเศษของ SSK-165 เขียนเป็นตารางเคส ข้อความต้องตรงกับ validateExtraCharge ฝั่งหน้าเว็บทุกตัวอักษร
 * ช่องว่างในตาราง (ไม่ใส่ค่า) คือไม่ได้ส่งช่องนั้นมา
 */
class ExtraChargeRulesTest {

    private static final String START = "Please choose the first month to charge (YYYY-MM)";

    @ParameterizedTest(name = "label={0} amount={1} recurrence={2} start={3} end={4} -> {5}")
    @CsvSource(delimiter = '|', value = {
            "         | 500     | MONTHLY  | 2026-12 |         | Please describe the charge",
            "'   '    | 500     | MONTHLY  | 2026-12 |         | Please describe the charge",
            "Parking  |         | MONTHLY  | 2026-12 |         | Amount must be a number",
            "Parking  | -0.01   | MONTHLY  | 2026-12 |         | Amount cannot be negative",
            "Parking  | 1000001 | MONTHLY  | 2026-12 |         | Amount is too high",
            "Parking  | 500     |          | 2026-12 |         | Frequency must be ONE_TIME or MONTHLY",
            "Parking  | 500     | monthly  | 2026-12 |         | Frequency must be ONE_TIME or MONTHLY",
            "Parking  | 500     | WEEKLY   | 2026-12 |         | Frequency must be ONE_TIME or MONTHLY",
            "Parking  | 500     | MONTHLY  |         |         | " + START,
            "Parking  | 500     | MONTHLY  | 2026-13 |         | " + START,
            "Parking  | 500     | MONTHLY  | 12/2026 |         | " + START,
            "Parking  | 500     | MONTHLY  | 2026-12 | 2027-1  | The last month must be YYYY-MM",
            "Parking  | 500     | MONTHLY  | 2026-12 | 2026-11 | The last month cannot be before the first month",
            // ค่าครั้งเดียวทิ้งเดือนสุดท้าย แต่ยังตรวจก่อนทิ้งเหมือนหน้าเว็บ
            "Key card | 200     | ONE_TIME | 2026-12 | 2026-11 | The last month cannot be before the first month",
            // ผิดหลายช่องได้ข้อความของช่องแรก ลำดับเดียวกับฟอร์ม: ชื่อ → ยอด → ความถี่ → เดือนแรก → เดือนสุดท้าย
            "         | -1      | WEEKLY   | 2026-13 | 2026-01 | Please describe the charge",
            "Parking  | -1      | WEEKLY   | 2026-13 | 2026-01 | Amount cannot be negative",
            "Parking  | 500     | WEEKLY   | 2026-13 | 2026-01 | Frequency must be ONE_TIME or MONTHLY",
            "Parking  | 500     | MONTHLY  | 2026-13 | 2026-01 | " + START,
    })
    @DisplayName("ค่าที่ผิดต้องได้ข้อความของช่องแรกที่ผิด")
    void invalidChargesReportTheFirstProblem(String label, String amount, String recurrence, String startMonth,
            String endMonth, String message) {
        ExtraChargeRequest request = new ExtraChargeRequest(label, amount == null ? null : new BigDecimal(amount),
                recurrence, startMonth, endMonth, null);

        assertThatThrownBy(() -> ExtraChargeRules.parse(request))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage(message);
    }

    @Test
    @DisplayName("ชื่อยาวได้ 80 ตัวพอดีหลังตัดช่องว่างหัวท้าย ตัวที่ 81 ไม่ได้")
    void labelIsLimitedTo80Characters() {
        String exactly80 = "ก".repeat(80);
        assertThat(ExtraChargeRules.parse(monthly("  " + exactly80 + "  ", "500")).label()).isEqualTo(exactly80);

        assertThatThrownBy(() -> ExtraChargeRules.parse(monthly(exactly80 + "ก", "500")))
                .hasMessage("The description must be 80 characters or fewer");
    }

    @Test
    @DisplayName("ยอดศูนย์และยอดเพดานพอดีผ่าน ยอดเก็บเป็นสองตำแหน่งตอนบันทึก")
    void amountBoundsArePermitted() {
        assertThat(ExtraChargeRules.parse(monthly("Free parking", "0")).amount()).isEqualByComparingTo("0");
        assertThat(ExtraChargeRules.parse(monthly("Parking", "1000000")).amount()).isEqualByComparingTo("1000000");
    }

    @Test
    @DisplayName("รายเดือนเก็บเดือนสุดท้ายถ้ามี เดือนสุดท้ายที่ว่างหรือเท่าเดือนแรกก็ได้")
    void monthlyKeepsItsLastMonth() {
        ExtraChargeTerms terms = ExtraChargeRules.parse(
                new ExtraChargeRequest(" Parking ", new BigDecimal("500"), "MONTHLY", "2026-12", "2027-03", null));

        assertThat(terms).isEqualTo(new ExtraChargeTerms("Parking", new BigDecimal("500"),
                ChargeRecurrence.MONTHLY, YearMonth.of(2026, 12), YearMonth.of(2027, 3)));
        assertThat(ExtraChargeRules.parse(
                new ExtraChargeRequest("Parking", BigDecimal.TEN, "MONTHLY", "2026-12", "", null)).endMonth()).isNull();
        assertThat(ExtraChargeRules.parse(
                new ExtraChargeRequest("Parking", BigDecimal.TEN, "MONTHLY", "2026-12", "2026-12", null)).endMonth())
                .isEqualTo(YearMonth.of(2026, 12));
    }

    @Test
    @DisplayName("ค่าครั้งเดียวไม่มีเดือนสุดท้ายเสมอ ถึงจะส่งเดือนที่ถูกรูปแบบมาก็ตาม")
    void oneTimeChargesDropTheLastMonth() {
        ExtraChargeTerms terms = ExtraChargeRules.parse(
                new ExtraChargeRequest("Key card", new BigDecimal("200"), "ONE_TIME", "2026-12", "2027-03", null));

        assertThat(terms.recurrence()).isEqualTo(ChargeRecurrence.ONE_TIME);
        assertThat(terms.endMonth()).isNull();
    }

    private static ExtraChargeRequest monthly(String label, String amount) {
        return new ExtraChargeRequest(label, new BigDecimal(amount), "MONTHLY", "2026-12", null, null);
    }
}
