package com.sakurasoul.apartment.maintenance;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

public interface MaintenanceReminderRepository extends JpaRepository<MaintenanceReminder, Long> {

    /**
     * ใบแจ้งเตือนทั้งหมด เรียงตามวันครบกำหนดที่ใกล้ที่สุดก่อน ตามที่การ์ดบนหน้าจอโชว์
     * ใช้ตอนตอบ GET /api/reminders
     */
    @EntityGraph(attributePaths = "room")
    List<MaintenanceReminder> findAllByOrderByNextDueDateAscIdAsc();

    @EntityGraph(attributePaths = "room")
    Optional<MaintenanceReminder> findWithRoomById(Long id);

    /**
     * ใบที่ถึงกำหนดแล้วและยังเปิดอยู่ พร้อมล็อกแถวไว้จนจบ transaction ของงานประจำวัน
     * <p>
     * ที่ต้องล็อกเพราะ k8s รัน backend สอง pod (replicas: 2 ใน k8s/20-backend.yaml)
     * งานประจำวันตอนแปดโมงจึงยิงพร้อมกันสองที่ ถ้าอ่านแบบธรรมดา ทั้งคู่จะเห็นใบเดียวกัน
     * ว่าถึงกำหนดก่อนที่ฝ่ายไหนจะ commit แล้วสร้างใบแจ้งซ่อมคนละใบให้รอบเดียวกัน
     * พอล็อกแถวไว้ pod ที่สองจะรอจนตัวแรก commit แล้ว PostgreSQL จะเอาเงื่อนไข WHERE
     * มาตรวจแถวที่ล็อกได้ใหม่อีกรอบ ซึ่งตอนนั้น next_due_date ถูกเลื่อนพ้นวันนี้ไปแล้ว
     * ใบจึงหลุดออกจากผลลัพธ์เอง (ด่านสุดท้ายคือ index maintenance_ticket_reminder_due_uk)
     * <p>
     * ตัวนี้ไม่มี {@code @EntityGraph} ต่างจากสองเมธอดข้างบน เพราะ PostgreSQL ไม่ยอมให้
     * ใช้ FOR UPDATE กับฝั่งที่เป็น LEFT JOIN (ห้องเป็น null ได้) ห้องจึงถูกโหลดทีหลัง
     * ตอน runDue เรียก getRoom() ซึ่งยังอยู่ใน transaction เดิม
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select r from MaintenanceReminder r where r.active = true and r.nextDueDate <= :today order by r.id asc")
    List<MaintenanceReminder> findDueForUpdate(@Param("today") LocalDate today);
}
