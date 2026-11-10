package com.sakurasoul.apartment.billing;

import com.sakurasoul.apartment.billing.LeaseAccount.Settled;
import com.sakurasoul.apartment.billing.PaymentAllocator.Allocation;
import com.sakurasoul.apartment.billing.PaymentDtos.PaymentResponse;
import com.sakurasoul.apartment.billing.ReceiptDtos.ReceiptItem;
import com.sakurasoul.apartment.billing.ReceiptDtos.ReceiptResponse;
import com.sakurasoul.apartment.lease.BillingCycle;
import com.sakurasoul.apartment.lease.Lease;
import com.sakurasoul.apartment.lease.LeaseCharges;
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
import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * รูปของใบเสร็จที่ตอบกลับ (SSK-163, SSK-164) ตัวเลขตรงกับตัวอย่าง JSON ในสัญญา API หัวข้อ "ใบเสร็จที่ตอบกลับ"
 * <ul>
 *   <li>ใบ ต.ค. (RC-2026-0011) ค่าใช้จ่าย 5,000.00 รับ 2,000.00 บนใบนั้น (การชำระ 30)</li>
 *   <li>ใบ พ.ย. (RC-2026-0012) ค่าใช้จ่าย 5,100.00 ยกมา 3,000.00 ดอกเบี้ย 1.50% เป็น 45.00 รวม 8,145.00</li>
 *   <li>รับ 3,000.00 บนใบ พ.ย. (การชำระ 31) ตัดเข้าใบ ต.ค. ทั้งก้อน</li>
 * </ul>
 */
class ReceiptResponseTest {

    /** ก่อนวันครบกำหนดของใบ พ.ย. (5 ธ.ค.) */
    private static final LocalDate BEFORE_DUE = LocalDate.of(2026, 12, 3);

    private Receipt october;
    private Receipt november;
    private Payment onOctober;
    private Payment onNovember;

    @BeforeEach
    void contractExample() {
        Lease lease = lease();
        october = issue(lease, 11L, "RC-2026-0011", LocalDate.of(2026, 10, 1), "10", Receipt.CarryForward.NONE,
                Instant.parse("2026-11-01T02:00:00Z"));
        november = issue(lease, 12L, "RC-2026-0012", LocalDate.of(2026, 11, 1), "15",
                new Receipt.CarryForward(new BigDecimal("3000.00"), "RC-2026-0011", new BigDecimal("3000.00"),
                        new BigDecimal("1.50")),
                Instant.parse("2026-12-01T02:00:00Z"));
        october.carryTo(12L);
        onOctober = payment(30L, october, "2000.00", Instant.parse("2026-11-10T03:00:00Z"));
        onNovember = payment(31L, november, "3000.00", Instant.parse("2026-12-01T03:12:44.120Z"));
        october.applySettlement(new BigDecimal("5000.00"), onNovember.getRecordedAt(), "Bank transfer");
    }

    @Test
    @DisplayName("SSK-163 ใบล่าสุดตอบยอดทั้งสองมุมตามตัวอย่างในสัญญา เงินบนบิลนี้ถูกตัดเข้าใบเก่า ใบนี้จึงยัง PENDING")
    void theLatestBillMatchesTheContractExample() {
        ReceiptResponse response = ReceiptResponse.of(november, account(octoberSettled("5000.00")), BEFORE_DUE);

        assertThat(response.latest()).isTrue();
        assertThat(response.chargesAmount()).isEqualByComparingTo("5100.00");
        assertThat(response.previousBalance()).isEqualByComparingTo("3000.00");
        assertThat(response.interestAmount()).isEqualByComparingTo("45.00");
        assertThat(response.totalAmount()).isEqualByComparingTo("8145.00");
        assertThat(response.paidAmount()).isEqualByComparingTo("3000.00");
        assertThat(response.balanceDue()).isEqualByComparingTo("5145.00");
        assertThat(response.settledAmount()).isEqualByComparingTo("0.00");
        assertThat(response.outstandingAmount()).isEqualByComparingTo("5145.00");
        assertThat(response.status()).isEqualTo(ReceiptStatus.PENDING);
        assertThat(response.oldestUnpaidDueDate()).isEqualTo(LocalDate.of(2026, 12, 5));
        assertThat(response.overdue()).isFalse();
        assertThat(response.carriedToReceiptId()).isNull();
        assertThat(response.payments()).containsExactly(new PaymentResponse(31L, new BigDecimal("3000.00"),
                LocalDate.of(2026, 12, 1), PaymentMethod.TRANSFER, "KBANK 0012", null,
                Instant.parse("2026-12-01T03:12:44.120Z"), null));
        assertThat(response.bank()).isNull();
        assertThat(response.promptPayPayload()).isNull();
    }

    @Test
    @DisplayName("SSK-164 บรรทัดยอดยกมากับดอกเบี้ยต่อท้ายใบ พร้อมที่มาในช่อง detail ผลรวมของบรรทัดเท่ายอดบิล")
    void theCarriedLinesComeLastAndAddUpToTheTotal() {
        List<ReceiptItem> items = ReceiptResponse.of(november, account(octoberSettled("5000.00")), BEFORE_DUE).items();

        assertThat(items).extracting(ReceiptItem::item).containsExactly(
                "Room rent", "Common area fee", "Internet", "Electricity", "Water", "Previous balance", "Late interest");
        assertThat(items.get(5)).isEqualTo(new ReceiptItem("Previous balance", "RC-2026-0011", null, null, null,
                new BigDecimal("3000.00"), null));
        assertThat(items.get(6)).isEqualTo(new ReceiptItem("Late interest", "1.50% of ฿3,000.00", null, null, null,
                new BigDecimal("45.00"), null));
        assertThat(items.stream().map(ReceiptItem::amount).reduce(BigDecimal.ZERO, BigDecimal::add))
                .isEqualByComparingTo(november.getTotalAmount());
    }

    @Test
    @DisplayName("SSK-164 ใบที่ถูกยกยอดแล้วชี้ไปบิลใหม่ ไม่ใช่ใบล่าสุดจึงไม่มี balanceDue ตัดครบจากเงินบนบิลอื่น และไม่มีบรรทัดยอดยกมา")
    void aCarriedReceiptShowsWhereItsBalanceWent() {
        ReceiptResponse response = ReceiptResponse.of(october, account(octoberSettled("5000.00")), BEFORE_DUE);

        assertThat(response.latest()).isFalse();
        assertThat(response.carriedToReceiptId()).isEqualTo(12L);
        assertThat(response.balanceDue()).isNull();
        assertThat(response.oldestUnpaidDueDate()).isNull();
        assertThat(response.paidAmount()).isEqualByComparingTo("2000.00");
        assertThat(response.settledAmount()).isEqualByComparingTo("5000.00");
        assertThat(response.outstandingAmount()).isEqualByComparingTo("0.00");
        assertThat(response.status()).isEqualTo(ReceiptStatus.PAID);
        assertThat(response.payments()).extracting(PaymentResponse::id).containsExactly(30L);
        assertThat(response.items()).hasSize(5);
    }

    @Test
    @DisplayName("SSK-163 เกินกำหนดเฉพาะใบล่าสุด และนับจากวันถัดจากวันครบกำหนดของใบเก่าสุดที่ยังค้าง")
    void onlyTheLatestBillIsOverdue() {
        LeaseAccount account = account(octoberSettled("5000.00"));
        LocalDate afterDue = LocalDate.of(2026, 12, 6);

        assertThat(ReceiptResponse.of(november, account, LocalDate.of(2026, 12, 5)).overdue()).isFalse();
        assertThat(ReceiptResponse.of(november, account, afterDue).overdue()).isTrue();
        assertThat(ReceiptResponse.of(october, account, afterDue).overdue()).isFalse();
    }

    @Test
    @DisplayName("SSK-163 การชำระที่ยกเลิกแล้วยังอยู่ในรายการของบิลพร้อมเวลาที่ยกเลิก แต่ไม่นับในยอดที่จ่าย")
    void aVoidedPaymentIsListedButNotCounted() {
        Instant voidedAt = Instant.parse("2026-12-02T03:00:00Z");
        onNovember.voidAt(voidedAt);
        october.applySettlement(new BigDecimal("2000.00"), voidedAt, null);

        ReceiptResponse response = ReceiptResponse.of(november, account(octoberSettled("2000.00")), BEFORE_DUE);

        assertThat(response.payments()).singleElement().satisfies(payment -> {
            assertThat(payment.id()).isEqualTo(31L);
            assertThat(payment.voidedAt()).isEqualTo(voidedAt);
        });
        assertThat(response.paidAmount()).isEqualByComparingTo("0.00");
        assertThat(response.balanceDue()).isEqualByComparingTo("8145.00");
        assertThat(response.oldestUnpaidDueDate()).isEqualTo(LocalDate.of(2026, 11, 5));
    }

    private LeaseAccount account(Map<Long, Settled> settled) {
        return LeaseAccount.of(List.of(october, november), settled, List.of(onOctober, onNovember));
    }

    /** การชำระที่ยังไม่ถูกยกเลิกทั้งหมดถูกตัดเข้าต้นเงินของใบ ต.ค. */
    private static Map<Long, Settled> octoberSettled(String principal) {
        return Map.of(11L, new Settled(BigDecimal.ZERO, new BigDecimal(principal)));
    }

    /** การชำระบนบิลนี้ จ่ายวันเดียวกับที่บันทึก (เวลาไทย) ตัดเข้าต้นเงินของใบ ต.ค. ทั้งก้อนตามตัวอย่าง */
    private static Payment payment(long id, Receipt bill, String amount, Instant recordedAt) {
        BigDecimal money = new BigDecimal(amount);
        Payment payment = Payment.record(bill, money, LocalDate.ofInstant(recordedAt, ZoneId.of("Asia/Bangkok")),
                PaymentMethod.TRANSFER, id == 31L ? "KBANK 0012" : null, null, recordedAt,
                List.of(new Allocation(11L, BigDecimal.ZERO, money)));
        ReflectionTestUtils.setField(payment, "id", id);
        return payment;
    }

    /** ค่าเช่า 3,500 ส่วนกลาง 350 ไฟ 100 หน่วย x 9.50 น้ำ x 20: น้ำ 10 หน่วยได้ 5,000.00 น้ำ 15 หน่วยได้ 5,100.00 */
    private static Receipt issue(Lease lease, Long id, String receiptNo, LocalDate month, String waterUnits,
            Receipt.CarryForward carry, Instant issuedAt) {
        Receipt receipt = Receipt.issue(lease, month, new BigDecimal("100"), new BigDecimal(waterUnits),
                month.plusMonths(1).withDayOfMonth(5), issuedAt, Set.of(), carry);
        receipt.numberedAs(receiptNo);
        ReflectionTestUtils.setField(receipt, "id", id);
        return receipt;
    }

    private static Lease lease() {
        Room room = new Room("101", (short) 1, RoomType.SINGLE);
        Tenant tenant = new Tenant("มานี รักเรียน", "1500000000004", null, "081-000-0004", null);
        Lease lease = new Lease(room, tenant, LocalDate.of(2026, 1, 1), null, new BigDecimal("3500.00"),
                BillingCycle.MONTHLY, new LeaseCharges(new BigDecimal("7000.00"), new BigDecimal("9.50"),
                new BigDecimal("20.00"), new BigDecimal("350.00"), new BigDecimal("0.00")));
        ReflectionTestUtils.setField(lease, "id", 4L);
        return lease;
    }
}
