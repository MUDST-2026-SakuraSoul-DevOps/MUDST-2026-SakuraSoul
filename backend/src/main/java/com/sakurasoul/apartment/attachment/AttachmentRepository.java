package com.sakurasoul.apartment.attachment;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

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
}
