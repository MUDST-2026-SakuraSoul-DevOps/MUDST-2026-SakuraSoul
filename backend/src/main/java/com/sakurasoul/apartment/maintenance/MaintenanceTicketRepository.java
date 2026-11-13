package com.sakurasoul.apartment.maintenance;

import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.Collection;
import java.util.List;

/**
 * ทุกเมธอดที่คืนใบแจ้งซ่อมติด @EntityGraph ให้ดึงห้องมาพร้อมกันในคิวรีเดียว
 * <p>
 * MaintenanceTicket ถือ Room เป็น LAZY แต่ทุก response ต้องส่ง roomNumber ไปด้วย
 * ถ้าไม่บอก entity graph ไว้ แต่ละแถวจะเสียคิวรีเพิ่มอีกหนึ่งครั้งตอนแตะ proxy
 * กลายเป็นปัญหา N+1 ที่โตตามจำนวนใบ เหตุผลเดียวกับ LeaseRepository
 * <p>
 * ทุกการเรียงลำดับมี id ต่อท้ายเสมอ เพราะใบที่ถูกบันทึกในวินาทีเดียวกันจะมี reportedAt
 * เท่ากันได้ ถ้าเรียงด้วยเวลาอย่างเดียว ลำดับของใบกลุ่มนั้นจะสลับไปมาระหว่างการโหลด
 * แต่ละครั้ง และ openMaintenanceTitle ของห้องจะไม่นิ่งทั้งที่ข้อมูลไม่ได้เปลี่ยน
 */
public interface MaintenanceTicketRepository extends JpaRepository<MaintenanceTicket, Long> {

    /** รายการทั้งอพาร์ตเมนต์ ใบใหม่สุดขึ้นก่อน ตามที่แท็บ Maintenance Log ต้องการ (US-13-S1) */
    @EntityGraph(attributePaths = "room")
    List<MaintenanceTicket> findAllByOrderByReportedAtDescIdDesc();

    /** ประวัติของห้องเดียว ใบใหม่สุดขึ้นก่อนเหมือนกัน (US-13-S1) */
    @EntityGraph(attributePaths = "room")
    List<MaintenanceTicket> findByRoomIdOrderByReportedAtDescIdDesc(Long roomId);

    /**
     * ห้องไหนบ้างในชุดนี้ที่เคยมีใบแจ้งซ่อม ห้องเหล่านั้นลบไม่ได้ ประวัติซ่อมต้องอยู่ครบ (ผ่าน MaintenanceRoomHistory)
     * ถามทีเดียวทั้งชุด ลดผัง 50 x 99 กลับเป็น 2 x 12 ต้องเช็คเกือบห้าพันห้อง ถามทีละห้องใช้เวลาเกือบยี่สิบวินาที
     */
    @Query("select distinct t.room.id from MaintenanceTicket t where t.room.id in :roomIds")
    List<Long> findRoomIdsAmong(@Param("roomIds") Collection<Long> roomIds);

    /** รอบแจ้งเตือนที่เคยสร้างใบแจ้งซ่อมแล้วลบไม่ได้ ใบเก่าชี้กลับมาที่รอบนี้ (DELETE /api/reminders/{id}, SSK-20) */
    boolean existsByReminderId(Long reminderId);

    /**
     * รอบนี้ของใบแจ้งเตือนมีใบแจ้งซ่อมแล้วหรือยัง ด่านกันใบซ้ำใน ReminderService.runDue (SSK-20)
     * เงื่อนไขเดียวกับ unique index maintenance_ticket_reminder_due_uk แต่ถามก่อนเขียน ไม่ต้องไปชน index
     * แล้วทำให้งานประจำวันทั้งชุดถูก rollback
     */
    boolean existsByReminderIdAndScheduledDate(Long reminderId, LocalDate scheduledDate);

    /**
     * ใบที่ยังไม่ปิดของทั้งตึก เรียงจากเก่าไปใหม่ ใช้เติม openMaintenanceCount กับ
     * openMaintenanceTitle ของ GET /api/rooms ในคิวรีเดียว
     * <p>
     * เรียงจากเก่าไปใหม่เพราะ openMaintenanceTitle คือชื่อของใบที่ค้างมานานที่สุด
     * ตัวแรกของแต่ละห้องจึงเป็นคำตอบเลยโดยไม่ต้องเทียบซ้ำ
     */
    @EntityGraph(attributePaths = "room")
    List<MaintenanceTicket> findByStatusNotOrderByReportedAtAscIdAsc(TicketStatus status);

    /** เหมือนเมธอดข้างบนแต่ของห้องเดียว ใช้กับ GET /api/rooms/{id} */
    @EntityGraph(attributePaths = "room")
    List<MaintenanceTicket> findByRoomIdAndStatusNotOrderByReportedAtAscIdAsc(Long roomId, TicketStatus status);

    /**
     * ใบตามสถานะที่มีประเภทงาน ใช้คำนวณคำแนะนำรอบซ่อมจากใบที่ปิดแล้ว (GET /api/maintenance/predictions, SSK-173)
     * ไม่ใส่การเรียงเพราะตัวคำนวณจัดกลุ่มและเรียงผลเอง ใบที่ไม่มีประเภทงานบอกไม่ได้ว่าเป็นงานชนิดเดียวกันจึงไม่ดึงมา
     */
    @EntityGraph(attributePaths = "room")
    List<MaintenanceTicket> findByStatusAndMaintenanceTypeIsNotNull(TicketStatus status);
}
