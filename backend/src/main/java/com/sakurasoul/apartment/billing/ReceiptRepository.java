package com.sakurasoul.apartment.billing;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

/**
 * ทุกเมธอดที่ต้องเอาไปทำ ReceiptResponse ติด @EntityGraph ให้ลากสัญญา ห้อง และผู้เช่า
 * มาในคิวรีเดียว
 * <p>
 * Receipt ถือ Lease เป็น LAZY และ Lease เองก็ถือ Room กับ Tenant เป็น LAZY อีกชั้น
 * แต่ทุก response ของใบเสร็จต้องมีเลขห้องกับชื่อผู้เช่า ถ้าไม่บอก entity graph ไว้
 * การดึงใบเสร็จ n ใบจะเสียคิวรีเพิ่มอีก 3n ครั้งตอนแตะ proxy กลายเป็นปัญหา N+1
 * ที่โตตามจำนวนใบเสร็จในตาราง ซึ่งเป็นตารางที่โตเร็วที่สุดของระบบนี้ (24 ห้อง x 12 เดือน ต่อปี)
 */
public interface ReceiptRepository extends JpaRepository<Receipt, Long> {

    /** ใบใหม่สุดขึ้นก่อน ตรงกับลำดับที่หน้า Payment Management โชว์ */
    @EntityGraph(attributePaths = {"lease", "lease.room", "lease.tenant"})
    List<Receipt> findAllByOrderByIssuedAtDesc();

    @EntityGraph(attributePaths = {"lease", "lease.room", "lease.tenant"})
    Optional<Receipt> findWithLeaseById(Long id);

    /**
     * หลายใบพร้อมสัญญา ห้อง และผู้เช่าในคิวรีเดียว ใช้ตอนส่งอีเมลหลายใบพร้อมกัน (SSK-143)
     * <p>
     * ลำดับที่ได้ไม่ตรงกับลำดับของ id ที่ส่งเข้ามา ผู้เรียกต้องเรียงกลับเอง
     * id ที่ไม่มีในตารางก็แค่ไม่อยู่ในผลลัพธ์ ไม่ได้โยน error
     */
    @EntityGraph(attributePaths = {"lease", "lease.room", "lease.tenant"})
    List<Receipt> findWithLeaseByIdIn(Collection<Long> ids);

    /**
     * ใบทุกใบของสัญญาเหล่านี้ ใช้ทำบัญชีของสัญญา (ReceiptViews) ไม่ติด @EntityGraph เพราะการคิดยอดไม่แตะสัญญา ห้อง
     * หรือผู้เช่า ใบที่จะเอาไปตอบโหลดมาพร้อมสัญญาตั้งแต่คิวรีก่อนหน้าแล้ว Hibernate คืนก้อนเดิมให้
     */
    List<Receipt> findByLeaseIdIn(Collection<Long> leaseIds);

    /** ใบทุกใบที่สถานะนี้ ใบใหม่สุดก่อน ใช้กับรอบเตือนใบค้างรายเดือน (SSK-143) */
    @EntityGraph(attributePaths = {"lease", "lease.room", "lease.tenant"})
    List<Receipt> findAllByStatusOrderByIssuedAtDesc(ReceiptStatus status);

    /**
     * อ่านใบเสร็จพร้อมล็อกแถวไว้ (SELECT ... FOR UPDATE) ใช้นับครั้งที่ส่งอีเมล (SSK-143)
     * <p>
     * sentCount นับเพิ่มจากค่าที่อ่านมา สองคำขอที่เข้ามาพร้อมกันภายใต้ READ COMMITTED จะอ่านค่าเดียวกันแล้ว
     * ต่างคนต่างเขียนทับกันเงียบ ๆ ล็อกแถวจึงเป็นตัวกันของจริง คำขอที่สองรอจนคำขอแรก commit แล้วค่อยได้อ่านค่าใหม่
     * ทุกเส้นทางที่เขียนยอด (ออกใบ แก้ใบ รับชำระ ยกเลิก) ล็อกทั้งสัญญาผ่าน LeaseAccounts.lock แทน
     * <p>
     * ไม่ติด @EntityGraph ให้เมธอดนี้โดยตั้งใจ เพราะ FOR UPDATE จะลามไปล็อกแถวของ
     * สัญญา ห้อง และผู้เช่าที่ถูก join มาด้วย ทั้งที่ไม่มีใครแก้สามตารางนั้นในจังหวะนี้
     * การอ่านเพื่อประกอบ response ใช้ findWithLeaseById อีกรอบแทน
     * <p>
     * เมธอดนี้ต้องเป็นการอ่านใบเสร็จ "ครั้งแรก" ของ transaction เสมอ ถ้าอ่านใบเดียวกัน
     * ไปแล้วก่อนหน้า Hibernate จะคืนตัวที่ค้างอยู่ใน persistence context ให้ ค่าที่ได้
     * จะเป็นค่าเก่าก่อนล็อก ซึ่งทำให้การล็อกไม่ได้ช่วยอะไรเลย
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    Optional<Receipt> findForUpdateById(Long id);

    /**
     * สัญญาของใบนี้ อ่านค่าเดียวโดยไม่โหลด entity (SSK-163) เพราะต้องล็อกสัญญาก่อนแล้วค่อยอ่านใบ ถ้าโหลดใบก่อน
     * ตัวที่อ่านหลังล็อกจะเป็นก้อนเดิมใน persistence context ซึ่งเป็นค่าเก่า lease_id ของใบไม่เคยเปลี่ยน จึงอ่านก่อนล็อกได้
     */
    @Query("select r.lease.id from Receipt r where r.id = :id")
    Optional<Long> findLeaseIdById(@Param("id") Long id);

    /**
     * ใบทุกใบของสัญญาพร้อมล็อกแถว เรียงตาม id ใช้หลังล็อกสัญญาแล้วเท่านั้น (LeaseAccounts.lock)
     * <p>
     * ล็อกตามลำดับ id ทุกครั้ง สองเส้นทางที่ล็อกหลายใบจึงไม่มีวงรอกัน ไม่ติด @EntityGraph ด้วยเหตุผลเดียวกับ
     * findForUpdateById คือ FOR UPDATE จะลามไปล็อกสัญญา ห้อง และผู้เช่าที่ถูก join มาด้วย
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select r from Receipt r where r.lease.id = :leaseId order by r.id")
    List<Receipt> findByLeaseIdForUpdate(@Param("leaseId") Long leaseId);

    /**
     * นับใบที่ออกไปแล้วในปีนั้นเพื่อหาเลขลำดับถัดไป prefix ที่ส่งเข้ามาคือ "RC-2026-"
     * <p>
     * นับจาก prefix ของเลขที่ ไม่ได้นับจากปีของ issued_at เพราะเลขที่คือสิ่งที่ต้องไม่ซ้ำ
     * ถ้านับคนละอย่างกับที่ constraint กัน สองอย่างจะเลื่อนหลุดจากกันวันที่มีใครแก้
     * ตอนออกใบย้อนหลังข้ามปี
     */
    long countByReceiptNoStartingWith(String prefix);

    /**
     * ห้องนี้มีใบเสร็จของเดือนนั้นหรือหลังจากนั้นแล้วหรือยัง นับทุกสัญญาของห้อง ทั้งที่ยังเช่าและที่ปิดไปแล้ว
     * ใช้กันการตั้งอัตราต่อห้องย้อนหลังทับเดือนที่ออกบิลไปแล้ว (SSK-162)
     */
    boolean existsByLeaseRoomIdAndBillingMonthGreaterThanEqual(Long roomId, LocalDate month);
}
