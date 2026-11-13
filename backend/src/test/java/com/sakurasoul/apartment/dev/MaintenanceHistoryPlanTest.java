package com.sakurasoul.apartment.dev;

import com.sakurasoul.apartment.dev.MaintenanceHistorySeeder.SeedHistory;
import com.sakurasoul.apartment.maintenance.MaintenancePredictor;
import com.sakurasoul.apartment.maintenance.MaintenancePredictor.Forecast;
import com.sakurasoul.apartment.maintenance.PredictionConfidence;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.util.HashSet;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * แผนประวัติงานซ่อมตัวอย่าง (SSK-173) เทสแค่แผน ไม่เปิด Spring ตัวที่บันทึกจริงพิสูจน์ที่ MaintenanceHistorySeederTest
 * <p>
 * สิ่งที่พังเงียบได้คือแผน เช่น ช่วงห่างเปลี่ยนจนความมั่นใจตกระดับ หรือวันที่หลุดไปอนาคต
 * เคส live E2E-LIVE-MAINT-004 อ่านคำแนะนำของห้อง 104 จากชุดนี้ ถ้าแผนเปลี่ยนเคสนั้นจะพังด้วย
 */
class MaintenanceHistoryPlanTest {

    private static final LocalDate TODAY = LocalDate.of(2026, 11, 13);

    /** ชุดเดียวกับ MAINTENANCE_TYPES ใน frontend/src/domain/maintenanceTicket.ts ที่เกี่ยวกับแผนนี้ */
    private static final List<String> UI_TYPES = List.of("Air Conditioning", "Plumbing");

    private static Forecast forecastOf(SeedHistory history) {
        return MaintenancePredictor.predictNext(history.closedOn()).orElseThrow();
    }

    @Test
    @DisplayName("ห้อง 104 ล้างแอร์ทุก 90 วัน ความมั่นใจสูง สี่งาน ครบรอบอีกสิบวัน")
    void airConditioningInRoom104IsAQuarterlyHighConfidenceSuggestion() {
        SeedHistory ac = MaintenanceHistorySeeder.plan(TODAY).get(0);

        assertThat(ac.roomNumber()).isEqualTo("104");
        assertThat(ac.maintenanceType()).isEqualTo("Air Conditioning");
        assertThat(forecastOf(ac)).isEqualTo(new Forecast(TODAY.minusDays(80), 90, TODAY.plusDays(10),
                PredictionConfidence.HIGH, 4));
    }

    @Test
    @DisplayName("ห้อง 201 ท่อตันทุก 30 วัน ความมั่นใจกลาง ห้างาน ครบรอบอีกยี่สิบเอ็ดวัน")
    void plumbingInRoom201IsAMonthlyMediumConfidenceSuggestion() {
        SeedHistory drain = MaintenanceHistorySeeder.plan(TODAY).get(1);

        assertThat(drain.roomNumber()).isEqualTo("201");
        assertThat(drain.maintenanceType()).isEqualTo("Plumbing");
        assertThat(forecastOf(drain)).isEqualTo(new Forecast(TODAY.minusDays(9), 30, TODAY.plusDays(21),
                PredictionConfidence.MEDIUM, 5));
    }

    @Test
    @DisplayName("ทุกวันอยู่ในอดีตและไม่ซ้ำกัน ประเภทงานสะกดตรงกับตัวเลือกบนหน้าจอ และชื่อใบไม่ซ้ำข้ามกลุ่ม")
    void everyDateIsPastAndDistinctAndTypesMatchTheUi() {
        List<SeedHistory> plan = MaintenanceHistorySeeder.plan(TODAY);

        for (SeedHistory history : plan) {
            assertThat(history.closedOn()).allSatisfy(day -> assertThat(day).isBefore(TODAY));
            assertThat(new HashSet<>(history.closedOn())).hasSameSizeAs(history.closedOn());
            assertThat(UI_TYPES).contains(history.maintenanceType());
        }
        assertThat(plan).extracting(SeedHistory::title).doesNotHaveDuplicates();
    }
}
