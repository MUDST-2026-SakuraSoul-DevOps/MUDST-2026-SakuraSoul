package com.sakurasoul.apartment.maintenance;

import com.sakurasoul.apartment.maintenance.StockLedger.Change;
import com.sakurasoul.apartment.maintenance.StockMovement.Kind;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/** ประวัติความเคลื่อนไหวพร้อมยอดคงเหลือ (SSK-171) เทสแรกใช้ตัวเลขเดียวกับ buildMovements ใน supplyStock.test.ts */
class StockLedgerTest {

    private static final Instant ADDED = at("2026-01-01");

    @Test
    @DisplayName("SSK-171 เรียงตามเวลา ยอดต่อเนื่องจนจบที่ยอดปัจจุบัน ยอดตั้งต้นย้อนคำนวณ")
    void ordersTheChangesAndKeepsTheBalanceContinuous() {
        List<StockMovement> movements = StockLedger.of(12, ADDED, List.of(
                Change.usage(at("2026-03-01"), 3, 4),
                Change.restock(at("2026-02-01"), 10),
                Change.adjustment(at("2026-04-01"), -1)));

        assertThat(movements).containsExactly(
                new StockMovement(ADDED, Kind.OPENING, 6, 6, null),
                new StockMovement(at("2026-02-01"), Kind.RESTOCK, 10, 16, null),
                new StockMovement(at("2026-03-01"), Kind.USAGE, -3, 13, "Maintenance ticket #4"),
                new StockMovement(at("2026-04-01"), Kind.ADJUSTMENT, -1, 12, null));
    }

    @Test
    @DisplayName("SSK-171 ของที่ยังไม่เคยเคลื่อนไหวมีแค่บรรทัดยอดตั้งต้นที่เท่ายอดปัจจุบัน")
    void anItemWithoutChangesHasOnlyTheOpeningLine() {
        assertThat(StockLedger.of(7, ADDED, List.of()))
                .containsExactly(new StockMovement(ADDED, Kind.OPENING, 7, 7, null));
    }

    @Test
    @DisplayName("SSK-171 รายการที่เกิดเวลาเดียวกันเรียงเติม เบิก แล้วปรับยอด ไม่ขึ้นกับลำดับที่ส่งเข้ามา")
    void changesAtTheSameInstantAreOrderedByKind() {
        Instant same = at("2026-02-01");

        List<StockMovement> movements = StockLedger.of(5, ADDED, List.of(
                Change.adjustment(same, 2), Change.usage(same, 1, 9), Change.restock(same, 4)));

        assertThat(movements).extracting(StockMovement::kind)
                .containsExactly(Kind.OPENING, Kind.RESTOCK, Kind.USAGE, Kind.ADJUSTMENT);
        assertThat(movements).extracting(StockMovement::balanceAfter).containsExactly(0, 4, 3, 5);
    }

    private static Instant at(String date) {
        return Instant.parse(date + "T00:00:00Z");
    }
}
