package com.sakurasoul.apartment.dev;

import static org.assertj.core.api.Assertions.assertThat;

import com.sakurasoul.apartment.dev.DevDataSeeder.SeedReceipt;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * ชุดใบเสร็จตัวอย่างของ DevDataSeeder (SSK-16)
 * <p>
 * เทสแค่แผนของข้อมูล ไม่ได้เปิด Spring เพราะตัวที่ออกใบจริงคือ ReceiptService ซึ่งมีเทสของมันเองแล้ว
 * สิ่งที่พังเงียบได้คือแผน เช่น เดือนหลุดช่วงสัญญา หรือใบค้างที่ไม่เลยกำหนดจริงในบางวันของเดือน
 */
class DevDataSeederTest {

    @Test
    @DisplayName("SSK-16 ออกสามใบ เดือนก่อนสองใบ เดือนนี้หนึ่งใบ และกดรับชำระแค่ใบแรก")
    void planIssuesThreeReceiptsAndPaysOnlyTheFirst() {
        List<SeedReceipt> plan = DevDataSeeder.receiptPlan(LocalDate.of(2026, 9, 25), 1L, 2L);

        assertThat(plan).extracting(seed -> seed.request().billingMonth())
                .containsExactly("2026-08", "2026-08", "2026-09");
        assertThat(plan).extracting(seed -> seed.request().leaseId()).containsExactly(1L, 2L, 1L);
        assertThat(plan).extracting(SeedReceipt::paid).containsExactly(true, false, false);
    }

    @Test
    @DisplayName("SSK-16 ใบค้างของเดือนก่อนเลยกำหนดแล้วเสมอ แม้ seed วันที่ 1 ของเดือน")
    void overdueReceiptIsOverdueEvenOnTheFirstOfTheMonth() {
        LocalDate firstOfMonth = LocalDate.of(2026, 10, 1);

        SeedReceipt overdue = DevDataSeeder.receiptPlan(firstOfMonth, 1L, 2L).get(1);

        // ถ้าใช้ค่าตั้งต้นวันที่ 5 ใบนี้จะครบกำหนด 2026-10-05 ซึ่งยังไม่เลย ตอนเดโมจะไม่เห็น Overdue
        assertThat(overdue.request().dueDate()).isBefore(firstOfMonth);
    }

    @Test
    @DisplayName("SSK-16 ข้ามปีได้ seed เดือนมกราคม ใบของเดือนก่อนเป็นธันวาคมของปีก่อน")
    void lastMonthCrossesTheYear() {
        List<SeedReceipt> plan = DevDataSeeder.receiptPlan(LocalDate.of(2027, 1, 10), 1L, 2L);

        assertThat(plan.get(0).request().billingMonth()).isEqualTo("2026-12");
        assertThat(plan.get(2).request().billingMonth()).isEqualTo("2027-01");
    }

    @Test
    @DisplayName("SSK-16 หน่วยไฟน้ำของทุกใบไม่ติดลบ ออกผ่านกฎของ ReceiptService ได้")
    void unitsAreValid() {
        for (SeedReceipt seed : DevDataSeeder.receiptPlan(LocalDate.of(2026, 9, 25), 1L, 2L)) {
            assertThat(seed.request().electricUnits()).isGreaterThanOrEqualTo(BigDecimal.ZERO);
            assertThat(seed.request().waterUnits()).isGreaterThanOrEqualTo(BigDecimal.ZERO);
        }
    }
}
