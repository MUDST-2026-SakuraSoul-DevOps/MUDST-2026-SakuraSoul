package com.sakurasoul.apartment.billing;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import org.hibernate.annotations.Immutable;

import java.math.BigDecimal;

/**
 * ส่วนของการชำระหนึ่งก้อนที่ตัดเข้าใบหนึ่งใบ แยกดอกเบี้ยกับต้นเงิน (SSK-163)
 * <p>
 * เก็บแยกต่อใบ ไม่ใช่แค่ยอดรวมของการชำระ เพราะการยกเลิกต้องคืนยอดได้ตรงทุกสตางค์ (แค่ไม่นับแถวของก้อนที่ยกเลิก)
 * และดอกเบี้ยรอบถัดไปต้องคิดจากต้นเงินที่เหลือจริง ซึ่งรู้ได้จากส่วนต้นเงินที่ถูกตัดไปเท่านั้น
 * <p>
 * {@link Immutable} เพราะการตัดยอดที่เกิดแล้วไม่ถูกแก้ ยกเลิกทำที่ Payment Hibernate จึงไม่ส่ง UPDATE ของแถวนี้เลย
 * receiptId กับ leaseId เป็น id เปล่าแบบ ReceiptLine ฐานข้อมูลผูกคู่ (…, lease_id) ทั้งกับการชำระและกับใบเสร็จ
 */
@Entity
@Immutable
@Table(name = "payment_allocation")
public class PaymentAllocation {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "payment_id", nullable = false)
    private Payment payment;

    /** ใบที่เงินถูกตัดเข้า อาจเก่ากว่าบิลที่บันทึกการชำระ */
    @Column(name = "receipt_id", nullable = false)
    private Long receiptId;

    @Column(name = "lease_id", nullable = false)
    private Long leaseId;

    @Column(name = "interest_amount", nullable = false, precision = 10, scale = 2)
    private BigDecimal interestAmount;

    @Column(name = "principal_amount", nullable = false, precision = 10, scale = 2)
    private BigDecimal principalAmount;

    protected PaymentAllocation() {
    }

    static PaymentAllocation of(Payment payment, PaymentAllocator.Allocation allocation) {
        PaymentAllocation row = new PaymentAllocation();
        row.payment = payment;
        row.receiptId = allocation.receiptId();
        row.leaseId = payment.getLeaseId();
        row.interestAmount = allocation.interestAmount();
        row.principalAmount = allocation.principalAmount();
        return row;
    }

    public Long getId() {
        return id;
    }

    public Payment getPayment() {
        return payment;
    }

    public Long getReceiptId() {
        return receiptId;
    }

    public Long getLeaseId() {
        return leaseId;
    }

    public BigDecimal getInterestAmount() {
        return interestAmount;
    }

    public BigDecimal getPrincipalAmount() {
        return principalAmount;
    }
}
