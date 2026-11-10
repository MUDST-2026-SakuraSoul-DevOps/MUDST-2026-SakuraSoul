package com.sakurasoul.apartment.billing;

import com.sakurasoul.apartment.lease.BillingCycle;
import com.sakurasoul.apartment.lease.Lease;
import com.sakurasoul.apartment.lease.LeaseCharges;
import com.sakurasoul.apartment.room.Room;
import com.sakurasoul.apartment.room.RoomType;
import com.sakurasoul.apartment.tenant.Tenant;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * ยอดยกมา ดอกเบี้ย และสถานะของใบเสร็จ (SSK-163, SSK-164) ตัวเลขมาจากตัวอย่างในสัญญา API
 * ค่าใช้จ่ายเดือนพฤศจิกายน 5,100.00 ยกมา 3,000.00 คิดดอกเบี้ย 1.50% ของ 3,000.00
 */
class ReceiptTest {

    private static final Instant ISSUED = Instant.parse("2026-12-01T02:00:00Z");
    private static final Receipt.CarryForward OCTOBER_CARRIED = new Receipt.CarryForward(
            new BigDecimal("3000.00"), "RC-2026-0011", new BigDecimal("3000.00"), new BigDecimal("1.50"));

    @Test
    @DisplayName("SSK-164 ยอดยกมากับดอกเบี้ยรวมอยู่ในยอดบิล ดอกเบี้ยคิดตอนออกครั้งเดียว ค่าใช้จ่ายเดือนนี้แยกได้")
    void theCarryAndInterestAreFrozenIntoTheBill() {
        Receipt november = november(OCTOBER_CARRIED);

        assertThat(november.getInterestAmount()).isEqualByComparingTo("45.00");
        assertThat(november.getTotalAmount()).isEqualByComparingTo("8145.00");
        assertThat(november.chargesAmount()).isEqualByComparingTo("5100.00");
        assertThat(november.ownAmount()).isEqualByComparingTo("5145.00");
        assertThat(november.getPreviousBalance()).isEqualByComparingTo("3000.00");
        assertThat(november.getPreviousBalanceReceipts()).isEqualTo("RC-2026-0011");
        assertThat(november.getInterestPrincipal()).isEqualByComparingTo("3000.00");
        assertThat(november.getInterestRatePercent()).isEqualByComparingTo("1.50");
        assertThat(november.getStatus()).isEqualTo(ReceiptStatus.PENDING);
    }

    @Test
    @DisplayName("SSK-164 ใบที่ไม่มียอดยกมามีตัวเลขเท่าก่อน Phase 2 ยอดบิลคือค่าใช้จ่ายเดือนนี้")
    void aBillWithoutACarryKeepsItsOldNumbers() {
        Receipt november = november(Receipt.CarryForward.NONE);

        assertThat(november.getTotalAmount()).isEqualByComparingTo("5100.00");
        assertThat(november.chargesAmount()).isEqualByComparingTo("5100.00");
        assertThat(november.getInterestAmount()).isEqualByComparingTo("0.00");
        assertThat(november.getPreviousBalanceReceipts()).isNull();
    }

    @Test
    @DisplayName("SSK-163 ใบที่ค่าใช้จ่ายกับดอกเบี้ยเป็นศูนย์ไม่มีอะไรต้องจ่าย จึง PAID ตั้งแต่ออก")
    void aZeroBillIsPaidWhenIssued() {
        Receipt zero = Receipt.issue(lease("0.00", "0.00"), LocalDate.of(2026, 11, 1), BigDecimal.ZERO, BigDecimal.ZERO,
                LocalDate.of(2026, 12, 5), ISSUED, Set.of(), Receipt.CarryForward.NONE);

        assertThat(zero.getStatus()).isEqualTo(ReceiptStatus.PAID);
        assertThat(zero.getPaidAt()).isEqualTo(ISSUED);
    }

    /** สถานะมองจากค่าใช้จ่ายกับดอกเบี้ยของใบเอง (5,145.00) ไม่ใช่ยอดบิลที่รวมยอดยกมา */
    @Test
    @DisplayName("SSK-163 สถานะตามเงินที่ถูกตัดเข้าใบ ยังไม่ถูกตัด ตัดบางส่วน ตัดครบ และกลับหลังยกเลิก")
    void theStatusFollowsTheAmountSettledIntoTheReceipt() {
        Receipt november = november(OCTOBER_CARRIED);
        Instant settledAt = Instant.parse("2026-12-03T04:00:00Z");

        november.applySettlement(new BigDecimal("20.00"), settledAt, "Cash");
        assertThat(november.getStatus()).isEqualTo(ReceiptStatus.PARTIAL);
        assertThat(november.getPaidAt()).isNull();
        assertThat(november.getPaymentMethod()).isNull();

        november.applySettlement(new BigDecimal("5145.00"), settledAt, "Bank transfer");
        assertThat(november.getStatus()).isEqualTo(ReceiptStatus.PAID);
        assertThat(november.getPaidAt()).isEqualTo(settledAt);
        assertThat(november.getPaymentMethod()).isEqualTo("Bank transfer");

        // ครบอยู่แล้ว ไม่เขียนทับเวลาที่จ่ายเดิม
        november.applySettlement(new BigDecimal("5145.00"), settledAt.plusSeconds(60), "Cash");
        assertThat(november.getPaidAt()).isEqualTo(settledAt);
        assertThat(november.getPaymentMethod()).isEqualTo("Bank transfer");

        // ยกเลิกการชำระจนไม่เหลือเงินที่ถูกตัด
        november.applySettlement(BigDecimal.ZERO, settledAt, null);
        assertThat(november.getStatus()).isEqualTo(ReceiptStatus.PENDING);
        assertThat(november.getPaidAt()).isNull();
    }

    @Test
    @DisplayName("SSK-163 ถูกตัดเกินยอดของใบคือบั๊ก ไม่ใช่เงินเกินที่เก็บไว้")
    void settlingMoreThanTheReceiptOwesIsABug() {
        Receipt november = november(OCTOBER_CARRIED);

        assertThatThrownBy(() -> november.applySettlement(new BigDecimal("5145.01"), ISSUED, null))
                .isInstanceOf(IllegalStateException.class);
    }

    @Test
    @DisplayName("SSK-155 แก้หน่วยของใบที่มียอดยกมา ค่าใช้จ่ายคิดใหม่ ยอดยกมากับดอกเบี้ยที่แช่แข็งไว้ไม่เปลี่ยน")
    void editingUnitsKeepsTheFrozenCarryAndInterest() {
        Receipt november = november(OCTOBER_CARRIED);

        november.update(LocalDate.of(2026, 11, 1), new BigDecimal("110"), new BigDecimal("15"), ISSUED);

        assertThat(november.chargesAmount()).isEqualByComparingTo("5195.00");
        assertThat(november.getTotalAmount()).isEqualByComparingTo("8240.00");
        assertThat(november.getPreviousBalance()).isEqualByComparingTo("3000.00");
        assertThat(november.getInterestAmount()).isEqualByComparingTo("45.00");
        assertThat(november.getStatus()).isEqualTo(ReceiptStatus.PENDING);
    }

    @Test
    @DisplayName("SSK-164 ใบที่ถูกยกยอดชี้ไปบิลใหม่ ตัวเลขและสถานะของใบเดิมไม่เปลี่ยน")
    void carryingAReceiptOnlyPointsItAtTheNewBill() {
        Receipt november = november(Receipt.CarryForward.NONE);

        november.carryTo(13L);

        assertThat(november.getCarriedToReceiptId()).isEqualTo(13L);
        assertThat(november.getTotalAmount()).isEqualByComparingTo("5100.00");
        assertThat(november.getStatus()).isEqualTo(ReceiptStatus.PENDING);
    }

    @Test
    @DisplayName("SSK-168 ใบเก็บสำเนาบัญชีรับเงินของตัวเอง ไม่ใช่ instance เดียวกับค่าตั้ง ไม่ได้ตั้งบัญชีคือไม่มีสำเนา")
    void aReceiptKeepsItsOwnCopyOfTheBankAccount() {
        Receipt withAccount = november(Receipt.CarryForward.NONE);
        Receipt withoutAccount = november(Receipt.CarryForward.NONE);

        withAccount.payableTo(ContractExample.BANK);
        withoutAccount.payableTo(null);

        assertThat(withAccount.getBankAccount()).isEqualTo(ContractExample.BANK).isNotSameAs(ContractExample.BANK);
        assertThat(withoutAccount.getBankAccount()).isNull();
    }

    /** คอลัมน์ของสำเนาเป็น updatable = false การเรียกหลังบันทึกจะไม่ลงฐานข้อมูลเงียบ ๆ จึงต้องดังแทน */
    @Test
    @DisplayName("SSK-168 คัดลอกบัญชีหลังใบถูกบันทึกแล้วไม่ได้")
    void theBankAccountCannotBeCopiedAfterTheReceiptIsSaved() {
        Receipt saved = november(Receipt.CarryForward.NONE);
        ReflectionTestUtils.setField(saved, "id", 12L);

        assertThatThrownBy(() -> saved.payableTo(ContractExample.BANK))
                .isInstanceOf(IllegalStateException.class);
        assertThat(saved.getBankAccount()).isNull();
    }

    /** ค่าเช่า 3,500 ส่วนกลาง 350 ไฟ 100 หน่วย x 9.50 น้ำ 15 หน่วย x 20 รวม 5,100.00 */
    private static Receipt november(Receipt.CarryForward carry) {
        return Receipt.issue(lease("3500.00", "350.00"), LocalDate.of(2026, 11, 1), new BigDecimal("100"),
                new BigDecimal("15"), LocalDate.of(2026, 12, 5), ISSUED, Set.of(), carry);
    }

    private static Lease lease(String rent, String commonArea) {
        Room room = new Room("101", (short) 1, RoomType.SINGLE);
        Tenant tenant = new Tenant("มานี รักเรียน", "1500000000004", null, "081-000-0004", null);
        Lease lease = new Lease(room, tenant, LocalDate.of(2026, 1, 1), null, new BigDecimal(rent), BillingCycle.MONTHLY,
                new LeaseCharges(new BigDecimal("7000.00"), new BigDecimal("9.50"), new BigDecimal("20.00"),
                        new BigDecimal(commonArea), new BigDecimal("0.00")));
        ReflectionTestUtils.setField(lease, "id", 4L);
        return lease;
    }
}
