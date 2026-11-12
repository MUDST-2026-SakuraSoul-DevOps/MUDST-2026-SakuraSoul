package com.sakurasoul.apartment.billing;

import com.sakurasoul.apartment.billing.LeaseAccount.Settled;
import com.sakurasoul.apartment.lease.BillingCycle;
import com.sakurasoul.apartment.lease.Lease;
import com.sakurasoul.apartment.lease.LeaseCharges;
import com.sakurasoul.apartment.room.Room;
import com.sakurasoul.apartment.room.RoomType;
import com.sakurasoul.apartment.tenant.Tenant;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.test.util.ReflectionTestUtils;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

/** หนี้ค้างของสัญญาหนึ่งใบ (SSK-163) อายุหนี้นับจากวันครบกำหนดของใบเก่าสุดที่ยังค้าง ตามเวลาไทย */
class DebtResponseTest {

    /** ใบ ก.ย. ครบกำหนด 5 ต.ค. 2569 */
    private static final LocalDate DUE = LocalDate.of(2026, 10, 5);

    @ParameterizedTest(name = "{0} วัน → {1}")
    @CsvSource({"0, 0-30", "30, 0-30", "31, 31-60", "60, 31-60", "61, 61+", "400, 61+"})
    @DisplayName("SSK-163 ช่วงอายุหนี้ 0-30 31-60 และ 61+ รวมสองขอบของแต่ละช่วง")
    void theBucketFollowsTheDaysOverdue(long days, String bucket) {
        assertThat(DebtResponse.bucket(days)).isEqualTo(bucket);
    }

    @Test
    @DisplayName("SSK-163 วันครบกำหนดพอดียังไม่เกิน วันถัดไปเกินหนึ่งวัน ยังไม่ถึงกำหนดเป็น 0 ไม่ติดลบ")
    void daysOverdueCountFromTheDayAfterTheDueDate() {
        Lease lease = lease();
        Receipt september = receipt(lease, 11L, LocalDate.of(2026, 9, 1));
        LeaseAccount account = LeaseAccount.of(List.of(september), Map.of(), List.of());

        assertThat(DebtResponse.of(lease, account, DUE.minusDays(3)).orElseThrow().daysOverdue()).isZero();
        assertThat(DebtResponse.of(lease, account, DUE).orElseThrow().daysOverdue()).isZero();
        assertThat(DebtResponse.of(lease, account, DUE.plusDays(1)).orElseThrow().daysOverdue()).isEqualTo(1);
        assertThat(DebtResponse.of(lease, account, DUE.plusDays(31)).orElseThrow().bucket()).isEqualTo("31-60");
    }

    @Test
    @DisplayName("SSK-163 แถวมาจากใบล่าสุด เลขห้องจากสำเนาในสัญญา ชื่อผู้เช่าปัจจุบัน")
    void theRowDescribesTheLatestBill() {
        Lease lease = lease();
        Receipt september = receipt(lease, 11L, LocalDate.of(2026, 9, 1));

        DebtResponse debt = DebtResponse.of(lease, LeaseAccount.of(List.of(september), Map.of(), List.of()),
                DUE.plusDays(10)).orElseThrow();

        assertThat(debt.leaseId()).isEqualTo(4L);
        assertThat(debt.roomNumber()).isEqualTo("101");
        assertThat(debt.tenantName()).isEqualTo("มานี รักเรียน");
        assertThat(debt.receiptId()).isEqualTo(11L);
        assertThat(debt.receiptNo()).isEqualTo("RC-2026-0011");
        assertThat(debt.billingMonth()).isEqualTo("2026-09");
        assertThat(debt.balanceDue()).isEqualByComparingTo(september.getTotalAmount());
        assertThat(debt.oldestUnpaidDueDate()).isEqualTo(DUE);
        assertThat(debt.bucket()).isEqualTo("0-30");
    }

    @Test
    @DisplayName("SSK-163 สัญญาที่ตัดครบแล้วไม่มีแถว")
    void aLeaseThatOwesNothingHasNoRow() {
        Lease lease = lease();
        Receipt september = receipt(lease, 11L, LocalDate.of(2026, 9, 1));
        BigDecimal total = september.getTotalAmount();
        Payment payment = Payment.record(september, total, LocalDate.of(2026, 10, 1), PaymentMethod.CASH, null, null,
                Instant.parse("2026-10-01T03:00:00Z"), List.of(new PaymentAllocator.Allocation(11L, BigDecimal.ZERO, total)));
        ReflectionTestUtils.setField(payment, "id", 30L);

        LeaseAccount account = LeaseAccount.of(List.of(september),
                Map.of(11L, new Settled(BigDecimal.ZERO, total)), List.of(payment));

        assertThat(DebtResponse.of(lease, account, DUE.plusDays(100))).isEmpty();
    }

    /** ค่าเช่า 3,500 ส่วนกลาง 350 ไฟ 100 หน่วย x 9.50 น้ำ 10 หน่วย x 20 รวม 5,000.00 ครบกำหนดวันที่ 5 เดือนถัดไป */
    private static Receipt receipt(Lease lease, Long id, LocalDate month) {
        Receipt receipt = Receipt.issue(lease, month, new BigDecimal("100"), new BigDecimal("10"),
                month.plusMonths(1).withDayOfMonth(5), Instant.parse("2026-10-01T02:00:00Z"), Set.of(),
                Receipt.CarryForward.NONE);
        receipt.numberedAs("RC-2026-%04d".formatted(id));
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
