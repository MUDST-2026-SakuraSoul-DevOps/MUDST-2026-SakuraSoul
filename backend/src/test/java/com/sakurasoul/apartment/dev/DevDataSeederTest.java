package com.sakurasoul.apartment.dev;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.tuple;

import com.sakurasoul.apartment.dev.DevDataSeeder.SeedReceipt;
import com.sakurasoul.apartment.maintenance.SupplyDtos.SupplyItemRequest;
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

    /** สลับระหว่าง VITE_API_MOCK=1 กับ backend จริงแล้วต้องเห็นคลังชุดเดียวกัน เทสของหน้าเว็บก็อิงชื่อชุดนี้ */
    @Test
    @DisplayName("SSK-23 อุปกรณ์ตัวอย่างชุดเดียวกับ mock ชื่อ รหัส และหมวดตรงกัน")
    void supplyPlanMatchesTheMockSeeds() {
        assertThat(DevDataSeeder.supplyPlan())
                .extracting(SupplyItemRequest::name, SupplyItemRequest::sku, SupplyItemRequest::category)
                .containsExactly(
                        tuple("LED Bulbs 60W", "EL-001", "Electrical"),
                        tuple("Air Filters 16x20x1", "HV-042", "HVAC"),
                        tuple("Copper Pipe Fittings", "PL-108", "Plumbing"));
    }

    @Test
    @DisplayName("SSK-23 ทุกชิ้นผ่านกฎเพดาน และ Air Filters เหลือ 8 ต่ำกว่าขั้นต่ำหลังใบห้อง 106 เบิกไปหนึ่งชิ้น")
    void supplyPlanRespectsTheStockBounds() {
        List<SupplyItemRequest> plan = DevDataSeeder.supplyPlan();
        for (SupplyItemRequest item : plan) {
            assertThat(item.maxStock()).isGreaterThanOrEqualTo(item.minStock());
            assertThat(item.stock()).isBetween(1, item.maxStock());
        }

        SupplyItemRequest filters = plan.get(1);
        assertThat(filters.stock() - 1).isEqualTo(8).isLessThan(filters.minStock());
    }
}
