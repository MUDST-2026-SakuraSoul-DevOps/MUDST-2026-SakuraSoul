package com.sakurasoul.apartment.billing;

import com.sakurasoul.apartment.extracharge.ChargeRecurrence;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Set;

public interface ReceiptLineRepository extends JpaRepository<ReceiptLine, Long> {

    /**
     * id ของค่าใช้จ่ายพิเศษความถี่นั้นที่ใบเสร็จของสัญญานี้เคยเก็บไปแล้ว ทุกใบทุกสถานะ
     * ใช้กับ ONE_TIME ตอนออกใบใหม่ ค่าครั้งเดียวที่อยู่ในนี้แล้วจะไม่ถูกเก็บซ้ำ (SSK-165)
     */
    @Query("select l.chargeId from ReceiptLine l where l.leaseId = :leaseId and l.recurrence = :recurrence")
    Set<Long> findChargeIdsBilledToLease(@Param("leaseId") Long leaseId,
            @Param("recurrence") ChargeRecurrence recurrence);
}
