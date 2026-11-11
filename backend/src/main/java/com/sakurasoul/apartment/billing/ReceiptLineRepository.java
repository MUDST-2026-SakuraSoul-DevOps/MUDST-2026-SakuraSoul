package com.sakurasoul.apartment.billing;

import com.sakurasoul.apartment.extracharge.ChargeRecurrence;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Set;

public interface ReceiptLineRepository extends JpaRepository<ReceiptLine, Long> {

    /**
     * id ของค่าใช้จ่ายพิเศษความถี่นั้นที่ใบเสร็จของสัญญานี้เคยเก็บไปแล้ว ทุกใบทุกสถานะ
     * ใช้กับ ONE_TIME ตอนออกใบใหม่ ค่าครั้งเดียวที่อยู่ในนี้แล้วจะไม่ถูกเก็บซ้ำ (SSK-165)
     */
    @Query("select l.chargeId from ReceiptLine l where l.leaseId = :leaseId and l.recurrence = :recurrence")
    Set<Long> findChargeIdsBilledToLease(@Param("leaseId") Long leaseId,
            @Param("recurrence") ChargeRecurrence recurrence);

    /**
     * ผลรวมบรรทัดค่าใช้จ่ายพิเศษต่อใบ ของใบทุกเดือนในช่วง (SSK-170) ใบที่ไม่มีบรรทัดไม่อยู่ในผล
     * <p>
     * รายงานใช้ตัวนี้แทน receipt.getLines() เพราะบรรทัดโหลดทีละชุดห้าสิบใบ (@BatchSize) ช่วงสิบปีจะกลายเป็นหลายสิบคิวรี
     */
    @Query("""
            select l.receipt.id as receiptId, sum(l.amount) as amount
            from ReceiptLine l
            where l.receipt.billingMonth between :firstMonth and :lastMonth
            group by l.receipt.id""")
    List<ReceiptTotal> sumByReceiptInMonths(@Param("firstMonth") LocalDate firstMonth,
            @Param("lastMonth") LocalDate lastMonth);

    interface ReceiptTotal {

        Long getReceiptId();

        BigDecimal getAmount();
    }
}
