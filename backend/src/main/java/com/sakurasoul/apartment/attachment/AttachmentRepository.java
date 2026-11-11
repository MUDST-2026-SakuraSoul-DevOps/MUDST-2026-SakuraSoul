package com.sakurasoul.apartment.attachment;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

public interface AttachmentRepository extends JpaRepository<Attachment, Long> {

    /** ไฟล์ที่ยังไม่ถูกลบ ไฟล์ที่ลบแล้วนับว่าไม่มี (404) ทั้งตอนดาวน์โหลดและตอนลบซ้ำ */
    Optional<Attachment> findByIdAndDeletedAtIsNull(Long id);

    /**
     * ไฟล์แนบของเจ้าของรายหนึ่ง ใหม่สุดก่อน ไม่รวมไฟล์ที่ลบแล้ว และไม่รวมไฟล์ของเอกสารสแกน (ดูผ่าน /api/documents)
     * เจ้าของเลือกด้วยคอลัมน์ของชนิดนั้น ชนิดอื่นส่งเป็น null ซึ่งไม่ตรงกับแถวไหน
     */
    @Query("""
            select a from Attachment a
            where a.deletedAt is null
              and ((:type = 'LEASE' and a.leaseId = :id)
                or (:type = 'MAINTENANCE_TICKET' and a.ticketId = :id)
                or (:type = 'RECEIPT' and a.receiptId = :id)
                or (:type = 'PAYMENT' and a.paymentId = :id))
              and not exists (select 1 from Document d where d.attachmentId = a.id)
            order by a.uploadedAt desc, a.id desc""")
    List<Attachment> findLooseByOwner(@Param("type") String type, @Param("id") long id);

    /**
     * soft delete แบบมีเงื่อนไข ตอบจำนวนแถวที่เปลี่ยน (0 หรือ 1)
     * <p>
     * เขียนเป็น UPDATE ที่มี deleted_at IS NULL ในเงื่อนไข ไม่ใช่แก้ entity แล้ว flush เพราะสองคำขอที่ลบพร้อมกัน
     * อ่านเจอไฟล์ที่ยังไม่ถูกลบทั้งคู่ แล้ว UPDATE ของ Hibernate ที่ไม่มีเงื่อนไขจะทับร่องรอยของคนแรกด้วยของคนที่สอง
     * และตอบ 204 ทั้งคู่ ตอนนี้คำขอที่สองรอแถวที่ถูกล็อก แล้วเจอว่าลบไปแล้ว ได้ 0 แถว ผู้เรียกตอบ 404
     */
    @Modifying
    @Query("""
            update Attachment a set a.deletedAt = :at, a.deletedBy = :by
            where a.id = :id and a.deletedAt is null""")
    int markDeleted(@Param("id") long id, @Param("by") String by, @Param("at") Instant at);

    /** ไฟล์นี้เป็นของเอกสารสแกนไหม (SSK-172) ไฟล์แบบนี้ลบผ่าน /api/attachments ไม่ได้ */
    @Query("select count(d) > 0 from Document d where d.attachmentId = :id")
    boolean belongsToDocument(@Param("id") long id);
}
