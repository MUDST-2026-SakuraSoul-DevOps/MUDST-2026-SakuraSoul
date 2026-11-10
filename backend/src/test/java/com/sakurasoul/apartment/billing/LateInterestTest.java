package com.sakurasoul.apartment.billing;

import com.sakurasoul.apartment.billing.LateInterest.Candidate;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/** ดอกเบี้ยค้างชำระ (SSK-164) ตัวเลขสองแถวแรกมาจากตัวอย่างค้างสามเดือนในสัญญา API */
class LateInterestTest {

    @ParameterizedTest(name = "{0} x {1}% = {2}")
    @CsvSource({
            "3000.00, 1.50, 45.00",
            "8100.00, 1.50, 121.50",
            // ปัดขึ้น ปัดลง ครึ่งพอดีปัดขึ้น และเล็กจนเป็นศูนย์
            "3333.33, 1.50, 50.00",
            "1234.50, 1.25, 15.43",
            "1.00,    0.50, 0.01",
            "0.33,    1.50, 0.00",
            "3000.00, 0.00, 0.00",
            "0.00,    1.50, 0.00"
    })
    @DisplayName("SSK-164 ต้นเงิน x อัตราต่อเดือน / 100 ปัดครึ่งขึ้นสองตำแหน่ง")
    void interestIsPrincipalTimesRateRoundedHalfUp(String principal, String percent, String expected) {
        assertThat(LateInterest.of(new BigDecimal(principal), new BigDecimal(percent))).isEqualTo(expected);
    }

    @ParameterizedTest(name = "บิล {0} ออกวันที่ {1} -> {2}")
    @CsvSource({
            // บิลที่ออกหลังสิ้นเดือนใช้สิ้นเดือน ตัวเลขจึงเท่ากันทุกวันที่กด
            "2026-11, 2026-12-01, 2026-11-30",
            "2026-11, 2027-01-15, 2026-11-30",
            "2028-02, 2028-03-01, 2028-02-29",
            // บิลที่ออกก่อนสิ้นเดือนใช้วันที่ออก (ตัดสิน 10 พ.ย.)
            "2026-11, 2026-11-03, 2026-11-03",
            "2026-11, 2026-11-30, 2026-11-30"
    })
    @DisplayName("SSK-164 วันอ้างอิงคือวันที่มาก่อนระหว่างวันออกบิลกับสิ้นเดือนที่เรียกเก็บ")
    void theReferenceDateIsTheEarlierOfIssueDateAndMonthEnd(String month, String issued, String expected) {
        assertThat(LateInterest.referenceDate(YearMonth.parse(month), LocalDate.parse(issued)))
                .isEqualTo(expected);
    }

    @ParameterizedTest(name = "ครบ {0} ผ่อนผัน {1} วัน อ้างอิง {2} -> เลยกำหนด {3}")
    @CsvSource({
            "2026-11-30, 0,  2026-11-30, false",
            "2026-11-29, 0,  2026-11-30, true",
            "2026-11-05, 25, 2026-11-30, false",
            "2026-11-05, 24, 2026-11-30, true",
            "2026-11-05, 26, 2026-11-30, false"
    })
    @DisplayName("SSK-164 เลยกำหนดเมื่อวันอ้างอิงอยู่หลังวันครบกำหนดบวกวันผ่อนผัน ครบกำหนดวันเดียวกันยังไม่นับ")
    void overdueMeansStrictlyAfterTheDueDatePlusGraceDays(String due, int graceDays, String reference,
            boolean overdue) {
        BigDecimal principal = LateInterest.overduePrincipal(
                List.of(new Candidate(new BigDecimal("3000.00"), LocalDate.parse(due))),
                graceDays, LocalDate.parse(reference));

        assertThat(principal).isEqualByComparingTo(overdue ? "3000.00" : "0.00");
    }

    @Test
    @DisplayName("SSK-164 หลายใบนับเฉพาะใบที่เลยกำหนด ใบที่เหลือแต่ดอกเบี้ยไม่เพิ่มฐาน")
    void onlyOverdueReceiptsCount() {
        List<Candidate> earlier = List.of(
                new Candidate(new BigDecimal("3000.00"), LocalDate.of(2026, 11, 5)),
                new Candidate(new BigDecimal("5100.00"), LocalDate.of(2026, 12, 5)),
                new Candidate(new BigDecimal("0.00"), LocalDate.of(2026, 10, 5)));

        assertThat(LateInterest.overduePrincipal(earlier, 0, LocalDate.of(2026, 11, 30)))
                .isEqualByComparingTo("3000.00");
        assertThat(LateInterest.overduePrincipal(earlier, 0, LocalDate.of(2026, 12, 31)))
                .isEqualByComparingTo("8100.00");
    }

    /** ผู้เช่าที่จ่ายทันก่อนครบกำหนดต้องไม่เสียดอกเบี้ย แม้แอดมินจะออกบิลเดือนนี้ตั้งแต่ต้นเดือน */
    @Test
    @DisplayName("SSK-164 ออกบิลต้นเดือนก่อนใบเดือนก่อนครบกำหนด ใบนั้นยังไม่ถูกคิดดอกเบี้ย")
    void aBillIssuedEarlyDoesNotChargeInterestOnAReceiptNotYetDue() {
        LocalDate reference = LateInterest.referenceDate(YearMonth.of(2026, 11), LocalDate.of(2026, 11, 3));

        BigDecimal principal = LateInterest.overduePrincipal(
                List.of(new Candidate(new BigDecimal("3000.00"), LocalDate.of(2026, 11, 5))), 0, reference);

        assertThat(principal).isEqualByComparingTo("0.00");
    }
}
