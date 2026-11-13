package com.sakurasoul.apartment.dev;

import com.sakurasoul.apartment.common.AppTime;
import com.sakurasoul.apartment.maintenance.MaintenanceDtos.CreateTicketRequest;
import com.sakurasoul.apartment.maintenance.MaintenanceDtos.TicketResponse;
import com.sakurasoul.apartment.maintenance.MaintenanceDtos.UpdateTicketRequest;
import com.sakurasoul.apartment.maintenance.MaintenanceService;
import com.sakurasoul.apartment.room.Room;
import com.sakurasoul.apartment.room.RoomRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.util.Arrays;
import java.util.List;
import java.util.Optional;

/**
 * ประวัติงานซ่อมที่ปิดแล้วย้อนหลังของสองห้อง ให้ส่วน Suggested maintenance (SSK-173) มีคำแนะนำให้เห็นตั้งแต่เปิดเครื่อง
 * <p>
 * ข้อมูลตัวอย่างเดิมมีแต่ใบที่ยังไม่ปิด คำแนะนำต้องมีงานประเภทเดียวกันในห้องเดียวกันที่ปิดแล้วอย่างน้อยสามวัน
 * ถ้าไม่มีชุดนี้ หน้าเดโมและเคส live E2E-LIVE-MAINT-004 จะเห็นแค่ข้อความว่าประวัติยังไม่พอ
 * <p>
 * สร้างและปิดใบผ่าน MaintenanceService ให้เดินผ่านกฎเดียวกับหน้าจอ แล้วค่อยย้อนวันที่แจ้งกับวันที่ปิดด้วย SQL
 * เพราะ service ตั้งวันที่ปิดเป็นตอนนี้เสมอ วิธีเดียวกับ UsageHistorySeeder ส่วนวันที่แจ้งต้องย้อนด้วย
 * ไม่งั้นใบเก่าหลายเดือนจะไปอยู่บนสุดของ Maintenance Log ที่เรียงตามวันที่แจ้ง
 * <p>
 * ไม่ห่อทั้งกลุ่มด้วย transaction เดียว เพราะ Hibernate จะ flush สถานะ DONE พร้อมเวลาปิดเป็นตอนนี้ทับ UPDATE ของ SQL
 * ตอน commit ถ้ากลุ่มไหนพังกลางทางจะลบใบของกลุ่มนั้นทิ้ง สตาร์ตรอบหน้าจะได้ลองใหม่ทั้งกลุ่ม ไม่ค้างครึ่งเดียว
 * ผูกกับโปรไฟล์ dev เหมือนข้อมูลตัวอย่างอื่น k8s ไม่ได้เปิดโปรไฟล์นี้ ประวัติปลอมจึงไม่หลุดขึ้นไป
 */
@Component
@Profile("dev")
class MaintenanceHistorySeeder {

    private static final Logger log = LoggerFactory.getLogger(MaintenanceHistorySeeder.class);

    /** ใบชุดหนึ่งของห้องหนึ่ง ทุกใบใช้ชื่อเดียวกัน ใช้ชื่อเป็นตัวเช็คว่า seed ไปแล้วหรือยัง */
    record SeedHistory(String roomNumber, String maintenanceType, String title, String detail,
            List<LocalDate> closedOn) {
    }

    private final RoomRepository roomRepository;
    private final MaintenanceService maintenanceService;
    private final JdbcClient jdbc;

    MaintenanceHistorySeeder(RoomRepository roomRepository, MaintenanceService maintenanceService, JdbcClient jdbc) {
        this.roomRepository = roomRepository;
        this.maintenanceService = maintenanceService;
        this.jdbc = jdbc;
    }

    /**
     * วันที่นับถอยจากวันนี้ คำแนะนำจึงอยู่อีกไม่กี่วันข้างหน้าเสมอไม่ว่าจะเปิดเครื่องวันไหน
     * <ul>
     *   <li>ห้อง 104 ล้างแอร์ ห่าง 90, 91, 89 วัน → ทุก 90 วัน ความมั่นใจสูง ครบรอบอีก 10 วัน (ขึ้นป้าย Due soon)</li>
     *   <li>ห้อง 201 ท่อตัน ห่าง 30, 40, 30, 22 วัน → ทุก 30 วัน ความมั่นใจกลาง ครบรอบอีก 21 วัน</li>
     * </ul>
     * ใช้ห้องที่มีใบแจ้งซ่อมตัวอย่างอยู่แล้ว จะได้ไม่มีห้องเพิ่มที่ลบไม่ได้เพราะมีประวัติซ่อม
     * ประเภทงานต้องสะกดตรงกับตัวเลือกบนหน้าจอ (MAINTENANCE_TYPES ใน frontend/src/domain/maintenanceTicket.ts)
     */
    static List<SeedHistory> plan(LocalDate today) {
        return List.of(
                new SeedHistory("104", "Air Conditioning", "Quarterly AC filter cleaning",
                        "Filters washed and the drain line flushed.",
                        daysBefore(today, 350, 260, 169, 80)),
                new SeedHistory("201", "Plumbing", "Bathroom drain cleared",
                        "Hair trap emptied and the drain flushed.",
                        daysBefore(today, 131, 101, 61, 31, 9)));
    }

    private static List<LocalDate> daysBefore(LocalDate today, int... days) {
        return Arrays.stream(days).mapToObj(today::minusDays).toList();
    }

    /** @return จำนวนกลุ่มที่ seed รอบนี้ */
    int seed() {
        int seeded = 0;
        for (SeedHistory history : plan(AppTime.today())) {
            Optional<Room> room = roomRepository.findByRoomNumber(history.roomNumber());
            if (room.isEmpty() || alreadySeeded(room.get(), history)) {
                continue;
            }
            try {
                seedGroup(room.get(), history);
                seeded++;
            } catch (RuntimeException failed) {
                log.warn("seed ประวัติงานซ่อมของห้อง {} ไม่สำเร็จ ลบใบที่ทำไปแล้วทิ้ง: {}",
                        history.roomNumber(), failed.getMessage());
                removeGroup(room.get(), history);
            }
        }
        if (seeded > 0) {
            log.info("seed ประวัติงานซ่อมที่ปิดแล้ว {} กลุ่มเรียบร้อย", seeded);
        }
        return seeded;
    }

    private boolean alreadySeeded(Room room, SeedHistory history) {
        return jdbc.sql("SELECT EXISTS (SELECT 1 FROM maintenance_ticket WHERE room_id = :room AND title = :title)")
                .param("room", room.getId())
                .param("title", history.title())
                .query(Boolean.class)
                .single();
    }

    private void seedGroup(Room room, SeedHistory history) {
        for (LocalDate day : history.closedOn()) {
            TicketResponse ticket = maintenanceService.create(new CreateTicketRequest(room.getId(), history.title(),
                    history.detail(), history.maintenanceType(), "LOW", "Kenji Tanaka", "Front desk", day, null,
                    List.of()));
            maintenanceService.update(ticket.id(),
                    new UpdateTicketRequest("DONE", null, null, null, null, null, null, null, null));
            // ส่ง LocalDate แล้วแปลงเป็นเวลาไทยในฐานข้อมูล แจ้งเก้าโมงเช้าของวันก่อน ปิดบ่ายสามโมงของวันนัด
            jdbc.sql("""
                            UPDATE maintenance_ticket
                               SET reported_at = (CAST(:day AS date) - INTERVAL '1 day' + INTERVAL '9 hours') AT TIME ZONE 'Asia/Bangkok',
                                   closed_at = (CAST(:day AS date) + INTERVAL '15 hours') AT TIME ZONE 'Asia/Bangkok'
                             WHERE id = :id
                            """)
                    .param("day", day)
                    .param("id", ticket.id())
                    .update();
        }
    }

    private void removeGroup(Room room, SeedHistory history) {
        try {
            jdbc.sql("DELETE FROM maintenance_ticket WHERE room_id = :room AND title = :title")
                    .param("room", room.getId())
                    .param("title", history.title())
                    .update();
        } catch (RuntimeException failed) {
            log.warn("ลบใบประวัติของห้อง {} ไม่สำเร็จ: {}", history.roomNumber(), failed.getMessage());
        }
    }
}
