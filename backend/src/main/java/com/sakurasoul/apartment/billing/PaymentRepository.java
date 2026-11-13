package com.sakurasoul.apartment.billing;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface PaymentRepository extends JpaRepository<Payment, Long> {

    /** การชำระทุกก้อนของสัญญา รวมที่ยกเลิก เรียงตามลำดับที่บันทึก (id) ใช้ทำบัญชีของสัญญา (LeaseAccount) */
    List<Payment> findByLeaseIdOrderByIdAsc(Long leaseId);

    /** แบบเดียวกันของหลายสัญญาในคิวรีเดียว ใช้ตอนประกอบรายการใบเสร็จ (ReceiptViews) */
    List<Payment> findByLeaseIdInOrderByIdAsc(Collection<Long> leaseIds);

    /** การชำระที่บันทึกบนบิลใบนี้ รวมที่ยกเลิก (GET /api/receipts/{id}/payments) */
    List<Payment> findByReceiptIdOrderByIdAsc(Long receiptId);

    /**
     * สัญญาของการชำระก้อนนี้ อ่านค่าเดียวโดยไม่โหลด entity เพราะต้องล็อกสัญญาก่อนแล้วค่อยอ่านการชำระ
     * ถ้าโหลดก่อน ตัวที่อ่านหลังล็อกจะเป็นก้อนเดิมใน persistence context ซึ่งเป็นค่าเก่า lease_id ของการชำระไม่เคยเปลี่ยน
     */
    @Query("select p.leaseId from Payment p where p.id = :id")
    Optional<Long> findLeaseIdById(@Param("id") Long id);
}
