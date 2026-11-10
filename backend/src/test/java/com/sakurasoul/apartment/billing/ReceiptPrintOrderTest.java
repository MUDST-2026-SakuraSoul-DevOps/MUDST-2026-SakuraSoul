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
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

/** ลำดับหน้าของไฟล์พิมพ์รวม (SSK-169) ตามผังตึกจากสำเนาห้องในสัญญา แล้วเดือน แล้ว id */
class ReceiptPrintOrderTest {

    private static final LocalDate SEPTEMBER = LocalDate.of(2026, 9, 1);
    private static final LocalDate OCTOBER = LocalDate.of(2026, 10, 1);

    private long nextId = 1;

    @Test
    @DisplayName("SSK-169 ตามชั้นแล้วตามเลขห้องแบบผังตึก ห้อง 1001 อยู่หลัง 201 ไม่ใช่ก่อน 101 แบบเรียงตัวอักษร")
    void roomsFollowTheBuildingLayout() {
        List<Receipt> receipts = shuffled(receipt("1001", 10, SEPTEMBER), receipt("101", 1, SEPTEMBER),
                receipt("201", 2, SEPTEMBER), receipt("102", 1, SEPTEMBER));

        assertThat(sorted(receipts)).extracting(ReceiptPrintOrderTest::roomOf)
                .containsExactly("101", "102", "201", "1001");
    }

    @Test
    @DisplayName("SSK-169 ชั้นมาก่อนความยาวของเลขห้อง")
    void theFloorComesBeforeTheNumberLength() {
        List<Receipt> receipts = shuffled(receipt("12", 3, SEPTEMBER), receipt("101", 1, SEPTEMBER));

        assertThat(sorted(receipts)).extracting(ReceiptPrintOrderTest::roomOf).containsExactly("101", "12");
    }

    @Test
    @DisplayName("SSK-169 ห้องเดียวกันเรียงตามเดือน ใบที่ถูกยกยอดอยู่ก่อนบิลที่รับยอดไป")
    void theSameRoomIsInMonthOrder() {
        Lease lease = lease("101", 1);
        Receipt october = receipt(lease, OCTOBER);
        Receipt september = receipt(lease, SEPTEMBER);

        assertThat(sorted(List.of(october, september))).containsExactly(september, october);
    }

    @Test
    @DisplayName("SSK-169 ห้องเดียวกันเดือนเดียวกันคนละสัญญา ใบที่ออกก่อน (id น้อยกว่า) อยู่ก่อน ลำดับตายตัว")
    void twoLeasesOfOneRoomInOneMonthFollowTheIds() {
        Receipt later = receipt("101", 1, SEPTEMBER);
        Receipt earlier = receipt("101", 1, SEPTEMBER);
        ReflectionTestUtils.setField(later, "id", 7L);
        ReflectionTestUtils.setField(earlier, "id", 4L);

        assertThat(sorted(List.of(later, earlier))).containsExactly(earlier, later);
    }

    @Test
    @DisplayName("SSK-169 เรียงตามเลขห้องที่พิมพ์บนใบ (สำเนาในสัญญา) ไม่ใช่เลขของห้องตอนนี้")
    void theOrderFollowsTheLeaseSnapshot() {
        Receipt renamed = receipt("102", 1, SEPTEMBER);
        Receipt other = receipt("103", 1, SEPTEMBER);
        // ห้องของใบแรกถูกเปลี่ยนเลขทีหลัง ถ้าอ่านห้องปัจจุบันใบนี้จะไปอยู่ท้าย
        ReflectionTestUtils.setField(renamed.getLease().getRoom(), "roomNumber", "999");

        assertThat(sorted(List.of(other, renamed))).containsExactly(renamed, other);
    }

    private static List<Receipt> sorted(List<Receipt> receipts) {
        List<Receipt> copy = new ArrayList<>(receipts);
        copy.sort(ReceiptPrintOrder.BY_ROOM_THEN_MONTH);
        return copy;
    }

    private static List<Receipt> shuffled(Receipt... receipts) {
        List<Receipt> list = new ArrayList<>(List.of(receipts));
        Collections.reverse(list);
        return list;
    }

    private static String roomOf(Receipt receipt) {
        return receipt.getLease().getRoomSnapshot().getRoomNumber();
    }

    private Receipt receipt(String roomNumber, int floor, LocalDate month) {
        return receipt(lease(roomNumber, floor), month);
    }

    private Receipt receipt(Lease lease, LocalDate month) {
        Receipt receipt = Receipt.issue(lease, month, BigDecimal.TEN, BigDecimal.ONE, month.plusMonths(1).withDayOfMonth(5),
                Instant.parse("2026-11-01T02:00:00Z"), Set.of(), Receipt.CarryForward.NONE);
        ReflectionTestUtils.setField(receipt, "id", nextId++);
        return receipt;
    }

    private Lease lease(String roomNumber, int floor) {
        Room room = new Room(roomNumber, (short) floor, RoomType.SINGLE);
        ReflectionTestUtils.setField(room, "id", nextId++);
        Tenant tenant = new Tenant("มานี รักเรียน", "1500000000004", null, "081-000-0004", null);
        Lease lease = new Lease(room, tenant, LocalDate.of(2026, 1, 1), null, new BigDecimal("3500.00"),
                BillingCycle.MONTHLY, new LeaseCharges(new BigDecimal("7000.00"), new BigDecimal("9.50"),
                new BigDecimal("20.00"), new BigDecimal("350.00"), new BigDecimal("0.00")));
        ReflectionTestUtils.setField(lease, "id", nextId++);
        return lease;
    }
}
