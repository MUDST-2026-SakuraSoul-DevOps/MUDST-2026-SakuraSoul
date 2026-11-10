package com.sakurasoul.apartment.billing;

import com.sakurasoul.apartment.billing.PaymentAllocator.Allocation;
import com.sakurasoul.apartment.billing.PaymentAllocator.Due;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.NullSource;
import org.junit.jupiter.params.provider.ValueSource;

import java.math.BigDecimal;
import java.util.Arrays;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * การตัดยอดแบบ FIFO และดอกเบี้ยก่อนต้นเงิน (SSK-163) ตัวเลขชุดแรกมาจากตัวอย่างในสัญญา API
 * ใบ A ค้างต้นเงิน 3,000 ใบ B ค้างดอกเบี้ย 45 กับต้นเงิน 5,100 ใบ C ค้างดอกเบี้ย 121.50 กับต้นเงิน 5,000
 */
class PaymentAllocatorTest {

    private static final Due A = due(11L, "0.00", "3000.00");
    private static final Due B = due(12L, "45.00", "5100.00");
    private static final Due C = due(13L, "121.50", "5000.00");

    /** แต่ละแถวคือ จำนวนเงิน แล้วตามด้วย "ใบ:ดอกเบี้ย/ต้นเงิน" ของทุกส่วนที่ได้ คั่นด้วยช่องว่าง */
    @ParameterizedTest(name = "{0} -> {1}")
    @CsvSource(delimiter = '|', value = {
            "3000.00 | 11:0.00/3000.00",
            "3020.00 | 11:0.00/3000.00 12:20.00/0.00",
            "3045.00 | 11:0.00/3000.00 12:45.00/0.00",
            "3045.01 | 11:0.00/3000.00 12:45.00/0.01",
            "8145.00 | 11:0.00/3000.00 12:45.00/5100.00",
            "0.01    | 11:0.00/0.01"
    })
    @DisplayName("SSK-163 ใบเก่าสุดก่อน ภายในใบตัดดอกเบี้ยก่อนต้นเงิน ใบที่ไม่ได้อะไรไม่อยู่ในผล")
    void oldestFirstAndInterestBeforePrincipal(String amount, String expected) {
        List<Allocation> allocations = PaymentAllocator.allocate(new BigDecimal(amount), List.of(A, B));

        assertThat(allocations).containsExactlyElementsOf(parse(expected));
        assertThat(sum(allocations)).isEqualByComparingTo(amount);
    }

    @Test
    @DisplayName("SSK-163 สามใบ เงินเหลือหลังสองใบแรกเข้าดอกเบี้ยของใบที่สามก่อน")
    void theRemainderGoesToTheNextReceiptsInterestFirst() {
        List<Allocation> allocations = PaymentAllocator.allocate(new BigDecimal("8200.00"), List.of(A, B, C));

        assertThat(allocations).containsExactlyElementsOf(
                parse("11:0.00/3000.00 12:45.00/5100.00 13:55.00/0.00"));
    }

    @Test
    @DisplayName("SSK-163 ใบที่เหลือแต่ดอกเบี้ยถูกตัดได้ ไม่มีแถวที่เป็นศูนย์ทั้งคู่")
    void aReceiptWithOnlyInterestLeft() {
        List<Allocation> allocations = PaymentAllocator.allocate(new BigDecimal("10.00"),
                List.of(due(5L, "10.00", "0.00"), due(6L, "0.00", "0.00"), due(7L, "0.00", "100.00")));

        assertThat(allocations).containsExactlyElementsOf(parse("5:10.00/0.00"));
    }

    @Test
    @DisplayName("SSK-163 เกินยอดค้างรวมโยนแทนการเก็บเงินเกินไว้ ผู้เรียกต้องตรวจกับข้อความของผู้ใช้มาก่อน")
    void moreThanIsDueIsRejected() {
        assertThatThrownBy(() -> PaymentAllocator.allocate(new BigDecimal("8145.01"), List.of(A, B)))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @ParameterizedTest(name = "{0}")
    @NullSource
    @ValueSource(strings = {"0", "0.00", "-1"})
    @DisplayName("SSK-163 ศูนย์ ติดลบ หรือไม่มีจำนวนเงินโยน")
    void zeroNegativeOrMissingAmountsAreRejected(String amount) {
        BigDecimal value = amount == null ? null : new BigDecimal(amount);

        assertThatThrownBy(() -> PaymentAllocator.allocate(value, List.of(A, B)))
                .isInstanceOf(IllegalArgumentException.class);
    }

    private static Due due(Long receiptId, String interest, String principal) {
        return new Due(receiptId, new BigDecimal(interest), new BigDecimal(principal));
    }

    private static List<Allocation> parse(String allocations) {
        return Arrays.stream(allocations.trim().split("\\s+")).map(part -> {
            String[] idAndAmounts = part.split(":");
            String[] amounts = idAndAmounts[1].split("/");
            return new Allocation(Long.valueOf(idAndAmounts[0]), new BigDecimal(amounts[0]), new BigDecimal(amounts[1]));
        }).toList();
    }

    private static BigDecimal sum(List<Allocation> allocations) {
        return allocations.stream().map(Allocation::total).reduce(BigDecimal.ZERO, BigDecimal::add);
    }
}
