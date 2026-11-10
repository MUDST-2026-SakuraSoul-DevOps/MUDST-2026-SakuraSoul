package com.sakurasoul.apartment.maintenance;

import org.springframework.data.jpa.repository.JpaRepository;

import java.time.Instant;
import java.util.List;

public interface SupplyRestockRepository extends JpaRepository<SupplyRestock, Long> {

    /** ของที่เติมเข้าคลังตั้งแต่เวลาที่กำหนด ใช้ตอบการ์ด restockedThisWeek (US-17-S2) */
    List<SupplyRestock> findByRestockedAtGreaterThanEqual(Instant since);

    /** การเติมของชิ้นเดียวตามลำดับที่เกิด ใช้ทำประวัติความเคลื่อนไหว (SSK-171) */
    List<SupplyRestock> findBySupplyIdOrderByIdAsc(Long supplyId);

    /** ประวัติการเติมของชิ้นที่ถูกลบ ลบไปพร้อมกับตัวของ (SupplyService.delete, SSK-23) */
    void deleteBySupplyId(Long supplyId);
}
