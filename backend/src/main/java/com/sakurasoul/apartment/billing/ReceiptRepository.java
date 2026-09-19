package com.sakurasoul.apartment.billing;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;

import java.time.LocalDate;
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
     * อ่านใบเสร็จพร้อมล็อกแถวไว้ (SELECT ... FOR UPDATE) ใช้ตอนรับชำระเงินเท่านั้น
     * <p>
     * การเช็คใน {@link Receipt#markPaid} เป็นการเช็คในหน่วยความจำล้วน สองคำขอที่เข้ามา
     * พร้อมกัน (กดปุ่มสองครั้ง หรือเปิดหน้าเว็บค้างไว้สองแท็บ) จะอ่านได้ PENDING ทั้งคู่
     * ภายใต้ READ COMMITTED แล้วผ่านการเช็คทั้งคู่ ใบหลังจะเขียนทับวันที่ชำระจริงกับ
     * ช่องทางการจ่ายของใบแรกเงียบ ๆ แล้วตอบ 200 ซึ่งเป็นอาการที่ Javadoc ของ markPaid
     * บอกว่ากันไว้แล้ว แต่กันไม่ได้จริงถ้าไม่มีอะไรบังคับที่ database
     * <p>
     * ล็อกแถวจึงเป็นตัวกันของจริง คำขอที่สองจะรอจนคำขอแรก commit แล้วค่อยได้อ่าน
     * ซึ่งตอนนั้นสถานะเป็น PAID แล้ว markPaid จึงโยน 409 ให้ตามที่สัญญา API เขียนไว้
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
     * นับใบที่ออกไปแล้วในปีนั้นเพื่อหาเลขลำดับถัดไป prefix ที่ส่งเข้ามาคือ "RC-2026-"
     * <p>
     * นับจาก prefix ของเลขที่ ไม่ได้นับจากปีของ issued_at เพราะเลขที่คือสิ่งที่ต้องไม่ซ้ำ
     * ถ้านับคนละอย่างกับที่ constraint กัน สองอย่างจะเลื่อนหลุดจากกันวันที่มีใครแก้
     * ตอนออกใบย้อนหลังข้ามปี
     */
    long countByReceiptNoStartingWith(String prefix);

    /** ใช้ทำข้อความ 409 ที่อ่านรู้เรื่อง ตัวกันซ้ำจริงคือ receipt_lease_month_uk ใน V9 */
    boolean existsByLeaseIdAndBillingMonth(Long leaseId, LocalDate billingMonth);
}
