package com.sakurasoul.apartment.lease;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

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

    /**
     * ห้องไหนบ้างในชุดนี้ที่เคยมีสัญญา (ทุกสถานะ รวมที่ปิดไปแล้ว เพราะประวัติสัญญาเป็นข้อมูลที่หอพักต้องเก็บ)
     * ใช้ตัดสินว่าลบห้องได้ไหม ทั้งทีละห้องและตอนปรับผังตึก ผ่าน LeaseRoomHistory
     * ถามทีเดียวทั้งชุด เพราะการลดผังต้องเช็คได้หลายพันห้อง ถามทีละห้องช้ามาก
     */
    @Query("select distinct l.room.id from Lease l where l.room.id in :roomIds")
    List<Long> findRoomIdsAmong(@Param("roomIds") Collection<Long> roomIds);

    boolean existsByTenantId(Long tenantId);

    /**
     * สัญญาพร้อมล็อกแถวไว้จนจบ transaction (SSK-163) ทุกการตัดสินใจที่ขึ้นกับชุดใบเสร็จของสัญญาถือล็อกนี้ก่อน
     * คือออกใบ รับชำระ ยกเลิกการชำระ และแก้ใบ เช่นใบไหนล่าสุด ยอดค้างเท่าไหร่ การชำระก้อนไหนล่าสุด
     * <p>
     * ล็อกแถวใบเสร็จอย่างเดียวไม่พอ เพราะกันการแทรกใบใหม่ของสัญญาเดียวกันไม่ได้ ไม่ติด @EntityGraph
     * เพราะ FOR UPDATE จะลามไปล็อกห้องกับผู้เช่าที่ join มาด้วย (เหตุผลเดียวกับ ReceiptRepository.findForUpdateById)
     * ต้องเป็นการอ่านสัญญาครั้งแรกของ transaction ไม่งั้น Hibernate คืนตัวเก่าใน persistence context
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select l from Lease l where l.id = :id")
    Optional<Lease> findForUpdateById(@Param("id") Long id);

    /**
     * มีสัญญาใบไหนคัดลอกค่าใช้จ่ายพิเศษรายการนี้ไปแล้วหรือยัง (ทุกสถานะ) ใช้ตัดสินว่าลบรายการได้ไหม (SSK-165)
     * <p>
     * เขียนคิวรีเองแทน derived query (existsByExtraChargesChargeId) เพราะ Spring Data อ่าน ...ChargeId เป็น getter
     * LeaseExtraCharge.getChargeId ซึ่งไม่ใช่ attribute ของ Hibernate ตอนสตาร์ตตรวจผ่านเพราะเจอ getter
     * แต่พอเรียกจริง Hibernate หา attribute ไม่เจอแล้วโยน IllegalArgumentException การลบจึงได้ 400 (เจอใน ExtraChargeApiTest)
     */
    @Query("select count(c) > 0 from LeaseExtraCharge c where c.charge.id = :chargeId")
    boolean existsLeaseWithExtraCharge(@Param("chargeId") Long chargeId);
}
