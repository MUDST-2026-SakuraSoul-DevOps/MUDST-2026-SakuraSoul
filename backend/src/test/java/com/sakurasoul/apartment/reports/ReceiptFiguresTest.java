package com.sakurasoul.apartment.reports;

import com.sakurasoul.apartment.billing.LeaseAccount;
import com.sakurasoul.apartment.billing.LeaseAccount.Settled;
import com.sakurasoul.apartment.billing.Receipt;
import com.sakurasoul.apartment.lease.Lease;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.YearMonth;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * ตัวเลขของใบเดียวตามเรื่องในสัญญา API ย้ายมาใช้อัตราตั้งต้นของตึก
 * ใบ ต.ค. ค่าใช้จ่าย 5,030.00 ใบ พ.ย. ค่าใช้จ่าย 5,030.00 ยกมา 3,030.00 ดอกเบี้ย 1.50% ของ 3,000.00 = 45.00
 * เงินที่ถูกตัด: ใบ ต.ค. ครบ 5,030.00 ใบ พ.ย. ตัดดอกเบี้ย 45.00 กับต้นเงิน 955.00
 */
class ReceiptFiguresTest {

    private final Lease lease = ReportFixtures.lease(4L, 10L, "101", 1, 20L, "มานี รักเรียน");
    private final Receipt october = ReportFixtures.receipt(lease, 11L, "2026-10", "10");
    private final Receipt november = ReportFixtures.receipt(lease, 12L, "2026-11", "10",
            new Receipt.CarryForward(new BigDecimal("3030.00"), "RC-2026-0011", new BigDecimal("3000.00"),
                    new BigDecimal("1.50")));
    private final LeaseAccount account = LeaseAccount.of(List.of(october, november), Map.of(
                    11L, new Settled(BigDecimal.ZERO, new BigDecimal("5030.00")),
                    12L, new Settled(new BigDecimal("45.00"), new BigDecimal("955.00"))),
            List.of());

    @Test
    @DisplayName("SSK-170 อ่านทุกช่องจากสำเนาในใบ ห้องกับชั้นจากสำเนาในสัญญา ผู้เช่าจากสัญญา")
    void everyFigureComesFromTheReceipt() {
        ReceiptFigures figures = ReceiptFigures.of(october, account, new BigDecimal("0.00"));

        assertThat(figures.roomNumber()).isEqualTo("101");
        assertThat(figures.floor()).isEqualTo((short) 1);
        assertThat(figures.tenantId()).isEqualTo(20L);
        assertThat(figures.tenantName()).isEqualTo("มานี รักเรียน");
        assertThat(figures.month()).isEqualTo(YearMonth.of(2026, 10));
        assertThat(figures.totals()).isEqualTo(new ReportTotals(1, money("3500.00"), money("100.00"),
                money("800.00"), money("10.00"), money("180.00"), money("300.00"), money("250.00"), money("0.00"),
                money("0.00"), money("5030.00"), money("5030.00"), money("0.00")));
    }

    @Test
    @DisplayName("SSK-170 billed ไม่รวมยอดยกมาแต่รวมดอกเบี้ย received กับ outstanding ตรงกับบัญชีของสัญญา")
    void billedExcludesThePreviousBalance() {
        ReportTotals totals = ReceiptFigures.of(november, account, new BigDecimal("0.00")).totals();

        assertThat(november.getTotalAmount()).isEqualByComparingTo("8105.00");
        assertThat(totals.lateInterest()).isEqualByComparingTo("45.00");
        assertThat(totals.billed()).isEqualByComparingTo("5075.00");
        assertThat(totals.received()).isEqualByComparingTo(account.settledAmount(november)).isEqualByComparingTo("1000.00");
        assertThat(totals.outstanding()).isEqualByComparingTo(account.outstandingAmount(november))
                .isEqualByComparingTo("4075.00");
    }

    @Test
    @DisplayName("SSK-170 บรรทัดค่าใช้จ่ายพิเศษที่ไม่ตรงกับยอดของใบเป็นบั๊ก ไม่ตอบรายงานที่ผิดแบบเงียบ ๆ")
    void partsThatDoNotAddUpAreABug() {
        assertThatThrownBy(() -> ReceiptFigures.of(october, account, new BigDecimal("500.00")))
                .isInstanceOf(IllegalStateException.class)
                .hasMessage("Receipt RC-2026-0011 bills 5030.00 but its parts add up to 5530.00");
    }

    private static BigDecimal money(String value) {
        return new BigDecimal(value);
    }
}
