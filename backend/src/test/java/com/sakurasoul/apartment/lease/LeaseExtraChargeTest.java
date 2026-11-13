package com.sakurasoul.apartment.lease;

import com.sakurasoul.apartment.extracharge.ChargeRecurrence;
import com.sakurasoul.apartment.extracharge.ExtraChargeTerms;
import com.sakurasoul.apartment.extracharge.RoomExtraCharge;
import com.sakurasoul.apartment.room.Room;
import com.sakurasoul.apartment.room.RoomType;
import com.sakurasoul.apartment.tenant.Tenant;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.test.util.ReflectionTestUtils;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.List;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * กฎว่าบิลเดือนไหนต้องเก็บค่าใช้จ่ายพิเศษรายการไหน (SSK-165) เป็นฝาแฝดของ dueExtraCharges ฝั่งหน้าเว็บ
 * และการคัดลอกรายการของห้องลงสัญญาตอนเซ็น ทั้งหมดเป็น logic ล้วนไม่แตะฐานข้อมูล
 */
class LeaseExtraChargeTest {

    private static final Set<Long> NOTHING_BILLED = Set.of();

    private final Room room = new Room("109", (short) 1, RoomType.SINGLE);

    @ParameterizedTest(name = "{0} -> {1}")
    @CsvSource({
            "2026-11, false",
            "2026-12, true",
            "2027-02, true",
            "2027-03, true",
            "2027-04, false",
    })
    @DisplayName("รายเดือนเก็บตั้งแต่เดือนแรกถึงเดือนสุดท้าย รวมทั้งสองเดือนนั้น")
    void monthlyChargesAreDueWithinTheirMonths(String month, boolean due) {
        LeaseExtraCharge parking = agreed(charge(1L, ChargeRecurrence.MONTHLY, "2026-12", "2027-03", true));

        assertThat(parking.isDueIn(YearMonth.parse(month), NOTHING_BILLED)).isEqualTo(due);
    }

    @Test
    @DisplayName("รายเดือนที่ไม่มีเดือนสุดท้ายเก็บไปเรื่อย ๆ หลังเดือนแรก")
    void openEndedMonthlyChargesNeverStop() {
        LeaseExtraCharge parking = agreed(charge(1L, ChargeRecurrence.MONTHLY, "2026-12", null, true));

        assertThat(parking.isDueIn(YearMonth.of(2026, 11), NOTHING_BILLED)).isFalse();
        assertThat(parking.isDueIn(YearMonth.of(2040, 1), NOTHING_BILLED)).isTrue();
    }

    @Test
    @DisplayName("ค่าครั้งเดียวเก็บได้ตั้งแต่เดือนแรก จนกว่าบิลของสัญญานี้จะเก็บไปแล้วหนึ่งครั้ง")
    void oneTimeChargesAreDueUntilBilledOnce() {
        LeaseExtraCharge keyCard = agreed(charge(7L, ChargeRecurrence.ONE_TIME, "2026-12", null, true));

        assertThat(keyCard.isDueIn(YearMonth.of(2026, 11), NOTHING_BILLED)).isFalse();
        assertThat(keyCard.isDueIn(YearMonth.of(2026, 12), NOTHING_BILLED)).isTrue();
        // บิลแรกออกช้าไปหลายเดือนก็ยังเก็บ เพราะเป็นบิลแรกของสัญญาที่ถึงเดือนแรกแล้ว
        assertThat(keyCard.isDueIn(YearMonth.of(2027, 5), NOTHING_BILLED)).isTrue();
        // รายการอื่นที่เก็บไปแล้วไม่เกี่ยว
        assertThat(keyCard.isDueIn(YearMonth.of(2027, 1), Set.of(8L))).isTrue();
        assertThat(keyCard.isDueIn(YearMonth.of(2027, 1), Set.of(7L))).isFalse();
    }

    @Test
    @DisplayName("ปิดรายการที่ห้องแล้วสำเนาในสัญญาหยุดเก็บทันที เปิดใหม่ก็กลับมาเก็บ")
    void deactivatingTheRoomChargeStopsEveryCopy() {
        RoomExtraCharge roomCharge = charge(1L, ChargeRecurrence.MONTHLY, "2026-12", null, true);
        LeaseExtraCharge parking = agreed(roomCharge);

        ReflectionTestUtils.setField(roomCharge, "active", false);
        assertThat(parking.isActive()).isFalse();
        assertThat(parking.isDueIn(YearMonth.of(2027, 1), NOTHING_BILLED)).isFalse();

        ReflectionTestUtils.setField(roomCharge, "active", true);
        assertThat(parking.isDueIn(YearMonth.of(2027, 1), NOTHING_BILLED)).isTrue();
    }

    @Test
    @DisplayName("สัญญาคัดลอกเฉพาะรายการที่เปิดอยู่ตอนเซ็น พร้อมชื่อ ยอด และช่วงเดือนของวันนั้น")
    void aNewLeaseCopiesOnlyActiveCharges() {
        RoomExtraCharge parking = charge(1L, ChargeRecurrence.MONTHLY, "2026-12", "2027-12", true);
        RoomExtraCharge closed = charge(2L, ChargeRecurrence.MONTHLY, "2026-12", null, false);
        RoomExtraCharge keyCard = charge(3L, ChargeRecurrence.ONE_TIME, "2026-12", null, true);
        Lease lease = lease();

        lease.agreeExtraCharges(List.of(parking, closed, keyCard));

        assertThat(lease.getExtraCharges()).extracting(LeaseExtraCharge::getChargeId).containsExactly(1L, 3L);
        LeaseExtraCharge copy = lease.getExtraCharges().get(0);
        assertThat(copy.getLabel()).isEqualTo("Charge 1");
        assertThat(copy.getAmount()).isEqualByComparingTo("500.00");
        assertThat(copy.getStartMonth()).isEqualTo(LocalDate.of(2026, 12, 1));
        assertThat(copy.getEndMonth()).isEqualTo(LocalDate.of(2027, 12, 1));

        // แก้รายการของห้องทีหลัง สำเนาในสัญญาไม่เปลี่ยน
        ReflectionTestUtils.setField(parking, "amount", new BigDecimal("800.00"));
        assertThat(copy.getAmount()).isEqualByComparingTo("500.00");
    }

    @Test
    @DisplayName("รายการที่ต้องเก็บของเดือนหนึ่งเรียงตามลำดับที่คัดลอก")
    void dueChargesKeepTheirAgreedOrder() {
        Lease lease = lease();
        lease.agreeExtraCharges(List.of(
                charge(1L, ChargeRecurrence.MONTHLY, "2026-12", null, true),
                charge(2L, ChargeRecurrence.MONTHLY, "2027-06", null, true),
                charge(3L, ChargeRecurrence.ONE_TIME, "2026-12", null, true)));

        assertThat(lease.extraChargesDueIn(YearMonth.of(2027, 1), Set.of(3L)))
                .extracting(LeaseExtraCharge::getChargeId).containsExactly(1L);
        assertThat(lease.extraChargesDueIn(YearMonth.of(2027, 6), NOTHING_BILLED))
                .extracting(LeaseExtraCharge::getChargeId).containsExactly(1L, 2L, 3L);
    }

    private RoomExtraCharge charge(long id, ChargeRecurrence recurrence, String start, String end, boolean active) {
        RoomExtraCharge charge = new RoomExtraCharge(room, new ExtraChargeTerms("Charge " + id,
                new BigDecimal("500"), recurrence, YearMonth.parse(start), end == null ? null : YearMonth.parse(end)),
                active);
        ReflectionTestUtils.setField(charge, "id", id);
        return charge;
    }

    private LeaseExtraCharge agreed(RoomExtraCharge charge) {
        Lease lease = lease();
        lease.agreeExtraCharges(List.of(charge));
        return lease.getExtraCharges().get(0);
    }

    private Lease lease() {
        Tenant tenant = new Tenant("ทดสอบ ค่าใช้จ่าย", "2200000000009", null, "082-165-0009", null);
        return new Lease(room, tenant, LocalDate.of(2026, 12, 1), null, new BigDecimal("3500.00"),
                BillingCycle.MONTHLY, new LeaseCharges(BigDecimal.ZERO, new BigDecimal("8.00"),
                new BigDecimal("18.00"), new BigDecimal("300.00"), new BigDecimal("250.00")));
    }
}
