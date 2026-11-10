package com.sakurasoul.apartment.billing;

import com.sakurasoul.apartment.common.ConflictException;
import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
import jakarta.persistence.Table;
import org.hibernate.annotations.BatchSize;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * เงินหนึ่งก้อนที่รับจากผู้เช่า (SSK-163) บันทึกบนบิล (ใบล่าสุดของสัญญาตอนนั้น) แล้วถูกตัดเข้าใบที่ค้างผ่าน PaymentAllocation
 * <p>
 * เกิดแล้วแก้ไม่ได้ ยกเว้นการยกเลิก (voidedAt) ถ้าบันทึกผิดให้ยกเลิกแล้วบันทึกใหม่ แถวที่ยกเลิกยังอยู่ เพราะประวัติการชำระ
 * ของบิลต้องแสดงรายการที่ยกเลิกด้วย ทุกการรวมยอดจึงต้องไม่นับก้อนที่ยกเลิกแล้ว
 * <p>
 * receiptId กับ leaseId เป็น id เปล่า ไม่ใช่ association เหมือน ReceiptLine ฐานข้อมูลผูกคู่นี้ด้วย foreign key
 * (receipt_id, lease_id) เงินของสัญญาหนึ่งจึงบันทึกบนบิลของอีกสัญญาไม่ได้
 */
@Entity
@Table(name = "payment")
public class Payment {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** บิลที่บันทึกการชำระนี้ เงินอาจถูกตัดเข้าใบที่เก่ากว่าก็ได้ ดู allocations */
    @Column(name = "receipt_id", nullable = false)
    private Long receiptId;

    @Column(name = "lease_id", nullable = false)
    private Long leaseId;

    @Column(name = "amount", nullable = false, precision = 10, scale = 2)
    private BigDecimal amount;

    /** วันที่ได้รับเงินจริง ไม่ใช่วันที่บันทึก */
    @Column(name = "paid_on", nullable = false)
    private LocalDate paidOn;

    @Enumerated(EnumType.STRING)
    @Column(name = "method", nullable = false, length = 10)
    private PaymentMethod method;

    @Column(name = "reference", length = 100)
    private String reference;

    @Column(name = "note", length = 500)
    private String note;

    @Column(name = "recorded_at", nullable = false)
    private Instant recordedAt;

    @Column(name = "voided_at")
    private Instant voidedAt;

    /** {@link BatchSize} เพราะบัญชีของสัญญาอ่านการตัดยอดของทุกก้อน ให้โหลดหลายก้อนในคิวรีเดียว */
    @OneToMany(mappedBy = "payment", cascade = CascadeType.PERSIST)
    @OrderBy("id")
    @BatchSize(size = 50)
    private List<PaymentAllocation> allocations = new ArrayList<>();

    protected Payment() {
    }

    /**
     * การชำระหนึ่งก้อนพร้อมการตัดยอดที่ PaymentAllocator คิดไว้แล้ว ผู้เรียกตรวจค่าในคำขอกับยอดค้างมาแล้ว
     * <p>
     * ผลรวมของการตัดต้องเท่ากับยอดเงินเป๊ะ ไม่เท่าคือบั๊กของเรา (IllegalStateException) ไม่ใช่ความผิดของผู้ใช้
     * เวลาที่บันทึกตัดเหลือมิลลิวินาทีให้ค่าที่ตอบตอนบันทึกกับที่อ่านทีหลังตรงกัน (เหตุผลเดียวกับ ReceiptDispatchService)
     */
    public static Payment record(Receipt bill, BigDecimal amount, LocalDate paidOn, PaymentMethod method,
            String reference, String note, Instant recordedAt, List<PaymentAllocator.Allocation> allocations) {
        BigDecimal allocated = allocations.stream()
                .map(PaymentAllocator.Allocation::total)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        if (allocated.compareTo(amount) != 0) {
            throw new IllegalStateException("Allocations of " + allocated + " do not add up to the payment of " + amount);
        }

        Payment payment = new Payment();
        payment.receiptId = bill.getId();
        payment.leaseId = bill.getLease().getId();
        payment.amount = amount;
        payment.paidOn = paidOn;
        payment.method = method;
        payment.reference = reference;
        payment.note = note;
        payment.recordedAt = recordedAt.truncatedTo(ChronoUnit.MILLIS);
        for (PaymentAllocator.Allocation allocation : allocations) {
            payment.allocations.add(PaymentAllocation.of(payment, allocation));
        }
        return payment;
    }

    /** ยกเลิกซ้ำได้ 409 ไม่ใช่เขียนทับเวลาที่ยกเลิกเดิม */
    public void voidAt(Instant voidedAt) {
        if (isVoided()) {
            throw new ConflictException("This payment has already been voided");
        }
        this.voidedAt = voidedAt.truncatedTo(ChronoUnit.MILLIS);
    }

    public boolean isVoided() {
        return voidedAt != null;
    }

    public Long getId() {
        return id;
    }

    public Long getReceiptId() {
        return receiptId;
    }

    public Long getLeaseId() {
        return leaseId;
    }

    public BigDecimal getAmount() {
        return amount;
    }

    public LocalDate getPaidOn() {
        return paidOn;
    }

    public PaymentMethod getMethod() {
        return method;
    }

    public String getReference() {
        return reference;
    }

    public String getNote() {
        return note;
    }

    public Instant getRecordedAt() {
        return recordedAt;
    }

    public Instant getVoidedAt() {
        return voidedAt;
    }

    public List<PaymentAllocation> getAllocations() {
        return Collections.unmodifiableList(allocations);
    }
}
