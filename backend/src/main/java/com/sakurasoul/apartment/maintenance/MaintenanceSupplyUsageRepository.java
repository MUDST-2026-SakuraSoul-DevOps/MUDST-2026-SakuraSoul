package com.sakurasoul.apartment.maintenance;

import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;

public interface MaintenanceSupplyUsageRepository extends JpaRepository<MaintenanceSupplyUsage, Long> {

    /**
     * ของที่ใช้ไปของใบแจ้งซ่อมหลายใบพร้อมกัน ดึงทีเดียวแล้วจับกลุ่มในหน่วยความจำ
     * ไม่ยิงทีละใบ เหตุผลเดียวกับ RoomService.activeLeasesToday
     * <p>
     * ติด @EntityGraph เพราะ response ต้องมีชื่ออุปกรณ์ ไม่ใช่แค่ id
     */
    @EntityGraph(attributePaths = "supply")
    List<MaintenanceSupplyUsage> findByTicketIdInOrderByIdAsc(Collection<Long> ticketIds);
}
