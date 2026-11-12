package com.sakurasoul.apartment.maintenance;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface SupplyAdjustmentRepository extends JpaRepository<SupplyAdjustment, Long> {

    /** การปรับยอดของชิ้นเดียวตามลำดับที่เกิด ใช้ทำประวัติความเคลื่อนไหว (SSK-171) */
    List<SupplyAdjustment> findBySupplyIdOrderByIdAsc(Long supplyId);

    /** ประวัติการปรับยอดของชิ้นที่ถูกลบ ลบไปพร้อมกับตัวของเหมือนประวัติการเติม (SupplyService.delete) */
    void deleteBySupplyId(Long supplyId);
}
