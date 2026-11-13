package com.sakurasoul.apartment.dev;

import com.sakurasoul.apartment.dev.UsageHistoryPlan.MonthUsage;
import com.sakurasoul.apartment.dev.UsageHistoryPlan.RoomHistory;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.time.YearMonth;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class UsageHistoryPlanTest {

    private static final LocalDate TODAY = LocalDate.of(2026, 11, 11);

    @Test
    @DisplayName("SSK-181 seed คงที่ เรียกสองครั้งได้แผนเดียวกัน")
    void sameSeedSamePlan() {
        assertThat(UsageHistoryPlan.plan(TODAY, 6)).isEqualTo(UsageHistoryPlan.plan(TODAY, 6));
    }

    @Test
    @DisplayName("SSK-181 สามปีเต็ม จบที่สองเดือนก่อน ไม่ทับเดือนของใบเสร็จตัวอย่าง (เดือนก่อนกับเดือนนี้)")
    void threeYearsEndingTwoMonthsAgo() {
        List<RoomHistory> plans = UsageHistoryPlan.plan(TODAY, 6);
        RoomHistory first = plans.getFirst();

        assertThat(first.months()).hasSize(36);
        assertThat(first.months().getFirst().month()).isEqualTo(YearMonth.of(2023, 10));
        assertThat(first.months().getLast().month()).isEqualTo(YearMonth.of(2026, 9));
        assertThat(first.start()).isEqualTo(LocalDate.of(2023, 10, 1));
        assertThat(first.end()).isEqualTo(LocalDate.of(2026, 9, 30));
        assertThat(plans).allSatisfy(plan -> assertThat(plan.months())
                .allSatisfy(month -> assertThat(month.month()).isBefore(YearMonth.of(2026, 10))));
    }

    @Test
    @DisplayName("SSK-181 ห้องที่สามของชั้นเริ่มช้าหนึ่งปี ห้องที่สองย้ายออกกลางเดือน เดือนอยู่ในช่วงสัญญาและเรียงกัน")
    void leasesShapeTheHistory() {
        List<RoomHistory> plans = UsageHistoryPlan.plan(TODAY, 6);

        assertThat(plans.get(2).start()).isEqualTo(LocalDate.of(2024, 10, 1));
        assertThat(plans.get(2).months()).hasSize(24);
        assertThat(plans.get(1).end()).isEqualTo(LocalDate.of(2026, 3, 15));
        for (RoomHistory plan : plans) {
            List<YearMonth> months = plan.months().stream().map(MonthUsage::month).toList();
            assertThat(months).isSorted().doesNotHaveDuplicates();
            assertThat(months.getFirst()).isEqualTo(YearMonth.from(plan.start()));
            assertThat(months.getLast()).isEqualTo(YearMonth.from(plan.end()));
            assertThat(plan.months()).allSatisfy(month -> {
                assertThat(month.electricUnits()).isPositive();
                assertThat(month.waterUnits()).isPositive();
            });
        }
    }

    @Test
    @DisplayName("SSK-181 ห้องแรกของแต่ละชั้นมีใบเสร็จและค่ามิเตอร์ทุกเดือน ห้องอื่นไม่มีใบ และขาดค่ามิเตอร์บางเดือน")
    void receiptsOnTheFirstRoomOfEachFloorAndSomeGaps() {
        List<RoomHistory> plans = UsageHistoryPlan.plan(TODAY, 6);

        assertThat(plans.get(0).months()).allSatisfy(month -> assertThat(month.receipt() && month.reading()).isTrue());
        assertThat(plans.get(3).months()).allMatch(MonthUsage::receipt);
        assertThat(plans.stream().filter(plan -> plan.index() % 3 != 0).flatMap(plan -> plan.months().stream()))
                .noneMatch(MonthUsage::receipt)
                .anyMatch(month -> !month.reading());
    }

    @Test
    @DisplayName("SSK-181 หน่วยตามฤดู พ.ค. ใช้ไฟมากกว่า ม.ค. ของปีเดียวกัน")
    void hotMonthsUseMore() {
        RoomHistory room = UsageHistoryPlan.plan(TODAY, 1).getFirst();

        MonthUsage may = room.months().stream().filter(month -> month.month().equals(YearMonth.of(2025, 5)))
                .findFirst().orElseThrow();
        MonthUsage january = room.months().stream().filter(month -> month.month().equals(YearMonth.of(2025, 1)))
                .findFirst().orElseThrow();
        assertThat(may.electricUnits()).isGreaterThan(january.electricUnits());
    }
}
