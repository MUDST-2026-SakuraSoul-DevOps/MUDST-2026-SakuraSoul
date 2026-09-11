package com.sakurasoul.apartment.lease;

import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

/**
 * ทั้งสามเมธอดติด @EntityGraph ให้ดึง room กับ tenant มาพร้อมกันในคิวรีเดียว
 * <p>
 * Lease ถือทั้งสองตัวเป็น LAZY (ดู Lease) แต่ LeaseResponse กับ LeaseBrief อ่านเลขห้อง
 * และชื่อผู้เช่าของ "ทุกแถว" ที่ดึงมา ถ้าไม่บอก entity graph ไว้ แต่ละแถวจะเสียคิวรี
 * เพิ่มอีกสองครั้งตอนแตะ proxy กลายเป็นปัญหา N+1 ที่โตตามจำนวนสัญญาในตาราง
 */
public interface LeaseRepository extends JpaRepository<Lease, Long> {

    /** สัญญาใหม่สุดขึ้นก่อน ตรงกับลำดับที่หน้า Contract Management โชว์ */
    @EntityGraph(attributePaths = {"room", "tenant"})
    List<Lease> findAllByOrderByStartDateDesc();

    /** ใช้ตอนวาดผังห้องทั้งตึก ดึงทีเดียวแล้วจับคู่กับห้องในหน่วยความจำ ไม่ยิงทีละห้อง */
    @EntityGraph(attributePaths = {"room", "tenant"})
    List<Lease> findByStatus(LeaseStatus status);

    @EntityGraph(attributePaths = {"room", "tenant"})
    List<Lease> findByRoomIdAndStatus(Long roomId, LeaseStatus status);
}
