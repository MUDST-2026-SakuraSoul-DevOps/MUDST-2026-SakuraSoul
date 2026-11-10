package com.sakurasoul.apartment.billing;

import com.sakurasoul.apartment.billing.LeaseAccount.Settled;
import com.sakurasoul.apartment.billing.PaymentAllocator.Allocation;
import com.sakurasoul.apartment.billing.PaymentAllocator.Due;
import com.sakurasoul.apartment.lease.BillingCycle;
import com.sakurasoul.apartment.lease.Lease;
import com.sakurasoul.apartment.lease.LeaseCharges;
import com.sakurasoul.apartment.lease.LeaseLateTerms;
import com.sakurasoul.apartment.room.Room;
import com.sakurasoul.apartment.room.RoomType;
import com.sakurasoul.apartment.tenant.Tenant;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * บัญชีของสัญญาหนึ่งใบ (SSK-163, SSK-164) ไล่เรื่องเดียวกับสัญญา API ทุกขั้น อัตรา 1.50% ไม่มีวันผ่อนผัน
 * <ol>
 *   <li>ใบ ต.ค. ค่าใช้จ่าย 5,000.00 รับ 2,000.00 (การชำระ 30)</li>
 *   <li>ออกใบ พ.ย. วันที่ 1 ธ.ค. ค่าใช้จ่าย 5,100.00 ยกมา 3,000.00 ดอกเบี้ย 45.00 รวม 8,145.00</li>
 *   <li>รับ 3,000.00 บนใบ พ.ย. (การชำระ 31) ทั้งก้อนตัดเข้าใบ ต.ค. ยอดคงเหลือ 5,145.00</li>
 *   <li>ยกเลิกการชำระ 31 กลับไป 8,145.00</li>
 * </ol>
 */
class LeaseAccountTest {

    private static final LeaseLateTerms TERMS = LeaseLateTerms.of(new BigDecimal("1.50"), 0);

    private Lease lease;
    private Receipt october;
    private Receipt november;
    private final List<Payment> payments = new ArrayList<>();
    private final Map<Long, Settled> settled = new HashMap<>();
    private long nextPaymentId = 30;

    @BeforeEach
    void octoberWithTwoThousandPaid() {
        lease = lease();
        october = issue(11L, "RC-2026-0011", LocalDate.of(2026, 10, 1), "10", Receipt.CarryForward.NONE,
                Instant.parse("2026-11-01T02:00:00Z"));
        record(october, "2000.00");
    }

    @Test
    @DisplayName("ขั้น 0 ใบ ต.ค. ถูกตัด 2,000.00 ค้าง 3,000.00 บิลมียอดต้องจ่าย 3,000.00")
    void octoberIsPartlyPaid() {
        LeaseAccount account = account(october);

        assertThat(account.settledAmount(october)).isEqualByComparingTo("2000.00");
        assertThat(account.outstandingAmount(october)).isEqualByComparingTo("3000.00");
        assertThat(account.paidAmount(october)).isEqualByComparingTo("2000.00");
        assertThat(account.balanceDue()).isEqualByComparingTo("3000.00");
        account.assertBalanced();
    }

    @Test
    @DisplayName("ขั้น 1 ออกใบ พ.ย. ยกมา 3,000.00 พร้อมเลขที่ คิดดอกเบี้ยจากต้นเงินที่เลยกำหนด ยอดบิล 8,145.00")
    void issuingNovemberCarriesOctober() {
        Receipt.CarryForward carry = account(october)
                .carryForwardFor(YearMonth.of(2026, 11), LocalDate.of(2026, 12, 1), TERMS);

        assertThat(carry.previousBalance()).isEqualByComparingTo("3000.00");
        assertThat(carry.receiptNumbers()).isEqualTo("RC-2026-0011");
        assertThat(carry.interestPrincipal()).isEqualByComparingTo("3000.00");
        assertThat(carry.ratePercent()).isEqualByComparingTo("1.50");

        issueNovember(carry);
        LeaseAccount account = account(october, november);
        assertThat(november.getTotalAmount()).isEqualByComparingTo("8145.00");
        assertThat(account.balanceDue()).isEqualByComparingTo("8145.00");
        assertThat(account.isLatest(november)).isTrue();
        assertThat(account.isLatest(october)).isFalse();
        assertThat(account.duesOldestFirst()).containsExactly(
                new Due(11L, new BigDecimal("0.00"), new BigDecimal("3000.00")),
                new Due(12L, new BigDecimal("45.00"), new BigDecimal("5100.00")));
        account.assertBalanced();
    }

    @Test
    @DisplayName("ขั้น 2 รับ 3,000.00 บนใบ พ.ย. ตัดเข้าใบ ต.ค. จนครบ บิลเหลือ 5,145.00 ใบ พ.ย. ยังไม่ถูกตัด")
    void paymentOnNovemberSettlesOctoberFirst() {
        issueNovember(account(october).carryForwardFor(YearMonth.of(2026, 11), LocalDate.of(2026, 12, 1), TERMS));
        Payment payment = record(november, "3000.00");

        LeaseAccount account = account(october, november);
        assertThat(payment.getAllocations()).singleElement().satisfies(allocation -> {
            assertThat(allocation.getReceiptId()).isEqualTo(11L);
            assertThat(allocation.getPrincipalAmount()).isEqualByComparingTo("3000.00");
            assertThat(allocation.getInterestAmount()).isEqualByComparingTo("0.00");
        });
        assertThat(account.outstandingAmount(october)).isEqualByComparingTo("0.00");
        assertThat(account.settledAmount(november)).isEqualByComparingTo("0.00");
        assertThat(account.paidAmount(november)).isEqualByComparingTo("3000.00");
        assertThat(account.balanceDue()).isEqualByComparingTo("5145.00");
        // ใบ ต.ค. ตัดครบแล้ว ใบเก่าสุดที่ยังค้างจึงเป็นใบ พ.ย.
        assertThat(account.oldestUnpaidDueDate()).contains(LocalDate.of(2026, 12, 5));
        account.assertBalanced();
    }

    @Test
    @DisplayName("ขั้น 3 ยกเลิกการชำระก้อนล่าสุด ไม่นับการตัดของก้อนนั้น ยอดกลับไป 8,145.00 ทุกสตางค์")
    void voidingTheLatestPaymentRestoresTheBalance() {
        issueNovember(account(october).carryForwardFor(YearMonth.of(2026, 11), LocalDate.of(2026, 12, 1), TERMS));
        Payment payment = record(november, "3000.00");
        assertThat(account(october, november).latestActivePayment()).contains(payment);

        voidPayment(payment);

        LeaseAccount account = account(october, november);
        assertThat(account.outstandingAmount(october)).isEqualByComparingTo("3000.00");
        assertThat(account.paidAmount(november)).isEqualByComparingTo("0.00");
        assertThat(account.balanceDue()).isEqualByComparingTo("8145.00");
        assertThat(account.latestActivePayment()).map(Payment::getId).contains(30L);
        account.assertBalanced();
    }

    /** ตัวอย่างค้างสามเดือนในสัญญา: ดอกเบี้ยเดือนที่สามคิดจาก 3,000 + 5,100 = 8,100 ไม่ใช่ 8,145 เพราะ 45.00 เป็นดอกเบี้ย */
    @Test
    @DisplayName("ค้างสามเดือน ใบ ธ.ค. ยกมา 8,145.00 ฐานดอกเบี้ย 8,100.00 ดอกเบี้ย 121.50 รวม 13,266.50")
    void threeMonthsBehind() {
        issueNovember(account(october).carryForwardFor(YearMonth.of(2026, 11), LocalDate.of(2026, 12, 1), TERMS));

        Receipt.CarryForward carry = account(october, november)
                .carryForwardFor(YearMonth.of(2026, 12), LocalDate.of(2027, 1, 1), TERMS);
        Receipt december = issue(13L, "RC-2026-0013", LocalDate.of(2026, 12, 1), "10", carry,
                Instant.parse("2027-01-01T02:00:00Z"));

        assertThat(carry.previousBalance()).isEqualByComparingTo("8145.00");
        assertThat(carry.receiptNumbers()).isEqualTo("RC-2026-0011, RC-2026-0012");
        assertThat(carry.interestPrincipal()).isEqualByComparingTo("8100.00");
        assertThat(december.getInterestAmount()).isEqualByComparingTo("121.50");
        assertThat(december.getTotalAmount()).isEqualByComparingTo("13266.50");
        account(october, november, december).assertBalanced();
    }

    @Test
    @DisplayName("ภายในใบเดียวกันตัดดอกเบี้ยก่อนต้นเงิน ต้นเงินที่ค้างยังเป็นฐานของดอกเบี้ยรอบถัดไปเต็ม 5,100.00")
    void interestIsSettledBeforePrincipalWithinAReceipt() {
        issueNovember(account(october).carryForwardFor(YearMonth.of(2026, 11), LocalDate.of(2026, 12, 1), TERMS));
        record(november, "3020.00");

        LeaseAccount account = account(october, november);
        assertThat(account.interestDue(november)).isEqualByComparingTo("25.00");
        assertThat(account.principalDue(november)).isEqualByComparingTo("5100.00");
        assertThat(account.carryForwardFor(YearMonth.of(2026, 12), LocalDate.of(2027, 1, 1), TERMS).interestPrincipal())
                .isEqualByComparingTo("5100.00");
        account.assertBalanced();
    }

    @Test
    @DisplayName("เกินกำหนดเมื่อวันนี้เลยวันครบกำหนดของใบเก่าสุดที่ยังค้าง วันครบกำหนดพอดียังไม่เกิน")
    void overdueStartsTheDayAfterTheOldestUnpaidDueDate() {
        LeaseAccount account = account(october);

        assertThat(account.oldestUnpaidDueDate()).contains(LocalDate.of(2026, 11, 5));
        assertThat(account.isOverdue(LocalDate.of(2026, 11, 5))).isFalse();
        assertThat(account.isOverdue(LocalDate.of(2026, 11, 6))).isTrue();
    }

    @Test
    @DisplayName("การชำระบนบิลที่ไม่มีการตัดยอดรองรับทำให้สมการไม่จริง โยนแทนการเขียนต่อ")
    void anUnbalancedAccountIsRejected() {
        Payment orphan = Payment.record(october, new BigDecimal("100.00"), LocalDate.of(2026, 11, 2), PaymentMethod.CASH,
                null, null, Instant.parse("2026-11-02T03:00:00Z"),
                List.of(new Allocation(11L, BigDecimal.ZERO, new BigDecimal("100.00"))));
        ReflectionTestUtils.setField(orphan, "id", 99L);
        payments.add(orphan);

        assertThatThrownBy(() -> account(october).assertBalanced()).isInstanceOf(IllegalStateException.class);
    }

    private LeaseAccount account(Receipt... receipts) {
        return LeaseAccount.of(List.of(receipts), settled, payments);
    }

    private void issueNovember(Receipt.CarryForward carry) {
        november = issue(12L, "RC-2026-0012", LocalDate.of(2026, 11, 1), "15", carry,
                Instant.parse("2026-12-01T02:00:00Z"));
    }

    /** ค่าเช่า 3,500 ส่วนกลาง 350 ไฟ 100 หน่วย x 9.50 น้ำ x 20: น้ำ 10 หน่วยได้ 5,000.00 น้ำ 15 หน่วยได้ 5,100.00 */
    private Receipt issue(Long id, String receiptNo, LocalDate month, String waterUnits, Receipt.CarryForward carry,
            Instant issuedAt) {
        Receipt receipt = Receipt.issue(lease, month, new BigDecimal("100"), new BigDecimal(waterUnits),
                month.plusMonths(1).withDayOfMonth(5), issuedAt, Set.of(), carry);
        receipt.numberedAs(receiptNo);
        ReflectionTestUtils.setField(receipt, "id", id);
        return receipt;
    }

    /** รับเงินบนบิลนี้ ตัดยอดแบบที่ PaymentService จะทำ แล้วเก็บผลรวมการตัดของแต่ละใบไว้ให้บัญชีอ่าน */
    private Payment record(Receipt bill, String amount) {
        List<Receipt> all = november == null ? List.of(october) : List.of(october, november);
        List<Allocation> allocations = PaymentAllocator.allocate(new BigDecimal(amount),
                LeaseAccount.of(all, settled, payments).duesOldestFirst());
        Payment payment = Payment.record(bill, new BigDecimal(amount), LocalDate.of(2026, 12, 1), PaymentMethod.TRANSFER,
                null, null, Instant.parse("2026-12-01T03:00:00Z"), allocations);
        ReflectionTestUtils.setField(payment, "id", nextPaymentId++);
        payments.add(payment);
        for (Allocation allocation : allocations) {
            settled.merge(allocation.receiptId(), new Settled(allocation.interestAmount(), allocation.principalAmount()),
                    (left, right) -> new Settled(left.interest().add(right.interest()),
                            left.principal().add(right.principal())));
        }
        return payment;
    }

    private void voidPayment(Payment payment) {
        payment.voidAt(Instant.parse("2026-12-02T03:00:00Z"));
        for (PaymentAllocation allocation : payment.getAllocations()) {
            Settled before = settled.get(allocation.getReceiptId());
            settled.put(allocation.getReceiptId(), new Settled(
                    before.interest().subtract(allocation.getInterestAmount()),
                    before.principal().subtract(allocation.getPrincipalAmount())));
        }
    }

    private static Lease lease() {
        Room room = new Room("101", (short) 1, RoomType.SINGLE);
        Tenant tenant = new Tenant("มานี รักเรียน", "1500000000004", null, "081-000-0004", null);
        Lease lease = new Lease(room, tenant, LocalDate.of(2026, 1, 1), null, new BigDecimal("3500.00"),
                BillingCycle.MONTHLY, new LeaseCharges(new BigDecimal("7000.00"), new BigDecimal("9.50"),
                new BigDecimal("20.00"), new BigDecimal("350.00"), new BigDecimal("0.00")));
        ReflectionTestUtils.setField(lease, "id", 4L);
        lease.agreeLateTerms(TERMS);
        return lease;
    }
}
