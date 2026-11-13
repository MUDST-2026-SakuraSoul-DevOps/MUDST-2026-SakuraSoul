package com.sakurasoul.apartment.dev;

import com.sakurasoul.apartment.TestcontainersConfiguration;
import com.sakurasoul.apartment.common.AppTime;
import com.sakurasoul.apartment.dev.MaintenanceHistorySeeder.SeedHistory;
import com.sakurasoul.apartment.maintenance.MaintenanceDtos.PredictionResponse;
import com.sakurasoul.apartment.maintenance.MaintenanceService;
import com.sakurasoul.apartment.maintenance.PredictionConfidence;
import com.sakurasoul.apartment.room.RoomRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIf;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.testcontainers.DockerClientFactory;

import java.time.LocalDate;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.tuple;

/**
 * ประวัติงานซ่อมตัวอย่างของ SSK-173 ทำงานจริงกับ PostgreSQL ทั้ง service จริงและ SQL ที่ย้อนวันที่
 * <p>
 * MaintenanceHistorySeeder เป็น bean เฉพาะโปรไฟล์ dev เทสจึงประกอบเองจาก bean จริงแบบเดียวกับ UsageHistorySeederTest
 * ถ้าคอลัมน์ของใบแจ้งซ่อมหรือ SQL ย้อนวันที่พัง seeder จะ log แล้วข้ามเงียบ ๆ ตอนสตาร์ต แล้วหน้าเดโมว่าง เทสนี้คือตัวที่จับได้
 * ลบใบที่ seed สร้างทุกใบหลังจบ (ชื่อใบตามแผน ในห้องตามแผน)
 */
@SpringBootTest
@Import(TestcontainersConfiguration.class)
@EnabledIf("dockerAvailable")
class MaintenanceHistorySeederTest {

    @Autowired
    private RoomRepository roomRepository;

    @Autowired
    private MaintenanceService maintenanceService;

    @Autowired
    private JdbcClient jdbc;

    private MaintenanceHistorySeeder seeder;

    static boolean dockerAvailable() {
        return DockerClientFactory.instance().isDockerAvailable();
    }

    @BeforeEach
    void createSeeder() {
        seeder = new MaintenanceHistorySeeder(roomRepository, maintenanceService, jdbc);
    }

    @AfterEach
    void clearHistory() {
        for (SeedHistory history : MaintenanceHistorySeeder.plan(AppTime.today())) {
            jdbc.sql("""
                    DELETE FROM maintenance_ticket t USING room r
                     WHERE r.id = t.room_id AND r.room_number = :room AND t.title = :title""")
                    .param("room", history.roomNumber())
                    .param("title", history.title())
                    .update();
        }
    }

    @Test
    @DisplayName("SSK-173 สองกลุ่มกลายเป็นใบ DONE ย้อนหลังตามแผน คำแนะนำออกมาตรงแผน และ seed ซ้ำไม่สร้างใบเพิ่ม")
    void seedsClosedHistoryThatTurnsIntoSuggestionsOnce() {
        LocalDate today = AppTime.today();

        assertThat(seeder.seed()).isEqualTo(2);

        List<PredictionResponse> mine = maintenanceService.predictions().stream()
                .filter(p -> List.of("104", "201").contains(p.roomNumber()))
                .toList();
        assertThat(mine).extracting(PredictionResponse::roomNumber, PredictionResponse::maintenanceType,
                        PredictionResponse::medianIntervalDays, PredictionResponse::predictedDate,
                        PredictionResponse::confidence, PredictionResponse::sampleSize)
                .containsExactly(
                        tuple("104", "Air Conditioning", 90, today.plusDays(10), PredictionConfidence.HIGH, 4),
                        tuple("201", "Plumbing", 30, today.plusDays(21), PredictionConfidence.MEDIUM, 5));

        // วันที่ปิดงานเป็นวันตามแผนจริงเมื่อนับเป็นเวลาไทย และวันที่แจ้งย้อนไปก่อนหน้าหนึ่งวัน ไม่ค้างเป็นวันนี้
        String seeded = "FROM maintenance_ticket t JOIN room r ON r.id = t.room_id"
                + " WHERE (r.room_number, t.title) IN (('104', 'Quarterly AC filter cleaning'),"
                + " ('201', 'Bathroom drain cleared'))";
        assertThat(count("SELECT count(*) " + seeded + " AND t.status = 'DONE'")).isEqualTo(9);
        assertThat(count("SELECT count(*) " + seeded
                + " AND (t.closed_at AT TIME ZONE 'Asia/Bangkok')::date <> t.scheduled_date")).isZero();
        assertThat(count("SELECT count(*) " + seeded
                + " AND (t.reported_at AT TIME ZONE 'Asia/Bangkok')::date <> t.scheduled_date - 1")).isZero();
        assertThat(count("SELECT count(*) " + seeded + " AND t.closed_at >= now() - INTERVAL '1 day'")).isZero();

        assertThat(seeder.seed()).as("seed ครั้งที่สอง").isZero();
        assertThat(count("SELECT count(*) " + seeded)).isEqualTo(9);
    }

    private long count(String sql) {
        return jdbc.sql(sql).query(Long.class).single();
    }
}
