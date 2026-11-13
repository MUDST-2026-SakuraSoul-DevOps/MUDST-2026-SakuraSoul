package com.sakurasoul.apartment.billing;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;
import java.util.Collection;
import java.util.List;

public interface PaymentAllocationRepository extends JpaRepository<PaymentAllocation, Long> {

    /**
     * เงินที่ถูกตัดเข้าแต่ละใบของสัญญาเหล่านี้ เฉพาะการชำระที่ยังไม่ถูกยกเลิก แยกดอกเบี้ยกับต้นเงิน
     * รวมในฐานข้อมูลคิวรีเดียว ใบที่ยังไม่ถูกตัดไม่อยู่ในผล
     */
    @Query("""
            select a.receiptId as receiptId, sum(a.interestAmount) as interest, sum(a.principalAmount) as principal
            from PaymentAllocation a
            where a.leaseId in :leaseIds and a.payment.voidedAt is null
            group by a.receiptId""")
    List<SettledRow> sumActiveByLeaseIds(@Param("leaseIds") Collection<Long> leaseIds);

    /** ผลรวมของใบหนึ่ง */
    interface SettledRow {

        Long getReceiptId();

        BigDecimal getInterest();

        BigDecimal getPrincipal();
    }
}
