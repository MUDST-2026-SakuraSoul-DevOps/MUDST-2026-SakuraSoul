package com.sakurasoul.apartment.maintenance;

import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

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
}
