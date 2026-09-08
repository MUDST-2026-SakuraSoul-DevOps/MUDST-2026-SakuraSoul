package com.sakurasoul.apartment.lease;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface LeaseRepository extends JpaRepository<Lease, Long> {

    /** สัญญาใหม่สุดขึ้นก่อน ตรงกับลำดับที่หน้า Contract Management โชว์ */
    List<Lease> findAllByOrderByStartDateDesc();

    /** ใช้ตอนวาดผังห้องทั้งตึก ดึงทีเดียวแล้วจับคู่กับห้องในหน่วยความจำ ไม่ยิงทีละห้อง */
    List<Lease> findByStatus(LeaseStatus status);

    List<Lease> findByRoomIdAndStatus(Long roomId, LeaseStatus status);
}
