package com.sakurasoul.apartment.dev;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.tuple;

import com.sakurasoul.apartment.dev.DevDataSeeder.SeedReceipt;
import com.sakurasoul.apartment.dev.DevDataSeeder.SeedReminder;
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
    @DisplayName("SSK-16 ออกสี่ใบ เดือนก่อนสองใบ เดือนนี้สองใบ และกดรับชำระแค่ใบแรก")
    void planIssuesFourReceiptsAndPaysOnlyTheFirst() {
        List<SeedReceipt> plan = DevDataSeeder.receiptPlan(LocalDate.of(2026, 9, 25), 1L, 2L, 3L);

        assertThat(plan).extracting(seed -> seed.request().billingMonth())
                .containsExactly("2026-08", "2026-08", "2026-09", "2026-09");
        assertThat(plan).extracting(seed -> seed.request().leaseId()).containsExactly(1L, 2L, 1L, 3L);
        assertThat(plan).extracting(SeedReceipt::paid).containsExactly(true, false, false, false);
    }

    /**
     * สัญญาที่สามเป็นของ Kenji ซึ่งไม่มีอีเมล ใบค้างของเขาทำให้ Send All Invoices บนฐานใหม่
     * ได้ทั้งใบที่ส่งและใบที่ถูกข้าม ถ้าใบนี้หายหรือกลายเป็นใบที่จ่ายแล้ว เดโมเคสไม่มีอีเมลจะไม่มีให้เห็น
     */
    @Test
    @DisplayName("SSK-143 สัญญาที่สาม (Kenji ไม่มีอีเมล) มีใบค้างของเดือนนี้หนึ่งใบไว้เดโมการข้ามตอนส่งอีเมล")
    void thirdLeaseHasOneUnpaidReceiptThisMonth() {
        List<SeedReceipt> plan = DevDataSeeder.receiptPlan(LocalDate.of(2026, 9, 25), 1L, 2L, 3L);

        assertThat(plan).filteredOn(seed -> seed.request().leaseId().equals(3L))
                .singleElement()
                .satisfies(seed -> {
                    assertThat(seed.request().billingMonth()).isEqualTo("2026-09");
                    assertThat(seed.paid()).isFalse();
                });
    }

    @Test
    @DisplayName("SSK-16 ใบค้างของเดือนก่อนเลยกำหนดแล้วเสมอ แม้ seed วันที่ 1 ของเดือน")
    void overdueReceiptIsOverdueEvenOnTheFirstOfTheMonth() {
        LocalDate firstOfMonth = LocalDate.of(2026, 10, 1);

        SeedReceipt overdue = DevDataSeeder.receiptPlan(firstOfMonth, 1L, 2L, 3L).get(1);

        // ถ้าใช้ค่าตั้งต้นวันที่ 5 ใบนี้จะครบกำหนด 2026-10-05 ซึ่งยังไม่เลย ตอนเดโมจะไม่เห็น Overdue
        assertThat(overdue.request().dueDate()).isBefore(firstOfMonth);
    }

    @Test
    @DisplayName("SSK-16 ข้ามปีได้ seed เดือนมกราคม ใบของเดือนก่อนเป็นธันวาคมของปีก่อน")
    void lastMonthCrossesTheYear() {
        List<SeedReceipt> plan = DevDataSeeder.receiptPlan(LocalDate.of(2027, 1, 10), 1L, 2L, 3L);

        assertThat(plan.get(0).request().billingMonth()).isEqualTo("2026-12");
        assertThat(plan.get(2).request().billingMonth()).isEqualTo("2027-01");
    }

    @Test
    @DisplayName("SSK-16 หน่วยไฟน้ำของทุกใบไม่ติดลบ ออกผ่านกฎของ ReceiptService ได้")
    void unitsAreValid() {
        for (SeedReceipt seed : DevDataSeeder.receiptPlan(LocalDate.of(2026, 9, 25), 1L, 2L, 3L)) {
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

    /** ชื่อชุดเดียวกับ mock ของหน้าเว็บ มีทั้งงานของห้อง งานของทั้งตึก และรอบที่พักไว้ให้เห็นทุกป้าย */
    @Test
    @DisplayName("SSK-20 รอบแจ้งเตือนตัวอย่างชุดเดียวกับ mock มีงานของห้อง 104 งานของทั้งตึก และรอบที่พักไว้")
    void reminderPlanMatchesTheMockSeeds() {
        List<SeedReminder> plan = DevDataSeeder.reminderPlan(LocalDate.of(2026, 9, 25), 4L);

        assertThat(plan).extracting(seed -> seed.request().name())
                .containsExactly("HVAC Inspection", "Fire Safety Audit", "Roofing Inspection", "AC Filter Cleaning");
        assertThat(plan).extracting(seed -> seed.request().roomId()).containsExactly(null, null, null, 4L);
        assertThat(plan).extracting(SeedReminder::paused).containsExactly(false, false, true, false);
        // ใบห้อง 104 เริ่มอีกเจ็ดวัน ไม่ถูกยิงทันทีตอนเปิดแอป
        assertThat(plan.get(3).request().startDate()).isEqualTo(LocalDate.of(2026, 10, 2));
    }

    /**
     * ปฏิทินรายสัปดาห์ของหน้าเว็บแสดงจันทร์ถึงศุกร์ และนับวันอาทิตย์เป็นสัปดาห์ที่เพิ่งผ่าน (workWeekOf)
     * HVAC Inspection จึงต้องเริ่มวันพุธของสัปดาห์เดียวกันนั้น ไม่ว่าจะ seed วันไหนของสัปดาห์
     */
    @Test
    @DisplayName("SSK-20 HVAC Inspection เริ่มวันพุธของสัปดาห์ที่ seed เสมอ วันอาทิตย์นับเป็นสัปดาห์ที่เพิ่งผ่าน")
    void hvacStartsOnTheWednesdayOfTheSeedingWeek() {
        // 21 ก.ย. 2569 เป็นวันจันทร์ 23 เป็นวันพุธ และ 27 เป็นวันอาทิตย์ของสัปดาห์เดียวกัน
        for (LocalDate seededOn : List.of(LocalDate.of(2026, 9, 21), LocalDate.of(2026, 9, 23),
                LocalDate.of(2026, 9, 27))) {
            assertThat(DevDataSeeder.reminderPlan(seededOn, 4L).get(0).request().startDate())
                    .isEqualTo(LocalDate.of(2026, 9, 23));
        }
    }
}
