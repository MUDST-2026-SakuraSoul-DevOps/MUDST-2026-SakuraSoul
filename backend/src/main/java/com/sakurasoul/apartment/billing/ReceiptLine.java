package com.sakurasoul.apartment.billing;

import com.sakurasoul.apartment.extracharge.ChargeRecurrence;
import com.sakurasoul.apartment.lease.LeaseExtraCharge;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
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
 * บรรทัดค่าใช้จ่ายพิเศษในใบเสร็จ (SSK-165) ต่อท้ายบรรทัดมาตรฐานห้าบรรทัดที่เป็นคอลัมน์ของ receipt อยู่แล้ว
 * <p>
 * คัดลอกชื่อ ความถี่ และยอดจากสำเนาในสัญญามาเก็บในแถวนี้ตอนออกใบ ด้วยเหตุผลเดียวกับที่ Receipt คัดลอกอัตรา
 * (US-16-S3) ใบที่ออกแล้วต้องไม่เปลี่ยนตามการแก้หรือปิดรายการทีหลัง
 * <p>
 * leaseId กับ chargeId เป็น id เปล่า ๆ ไม่ใช่ association เพราะไม่มีใครเดินจากบรรทัดไปหาสัญญาหรือรายการต้นทาง
 * leaseId มีไว้ให้ receipt_line_one_time_uk กันค่าครั้งเดียวซ้ำข้ามใบของสัญญาเดียวกัน ส่วน chargeId ส่งให้หน้าเว็บ
 */
@Entity
@Table(name = "receipt_line")
@Immutable
public class ReceiptLine {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "receipt_id", nullable = false)
    private Receipt receipt;

    @Column(name = "lease_id", nullable = false)
    private Long leaseId;

    @Column(name = "charge_id", nullable = false)
    private Long chargeId;

    @Column(name = "label", nullable = false, length = 80)
    private String label;

    @Enumerated(EnumType.STRING)
    @Column(name = "recurrence", nullable = false, length = 10)
    private ChargeRecurrence recurrence;

    @Column(name = "amount", nullable = false, precision = 10, scale = 2)
    private BigDecimal amount;

    protected ReceiptLine() {
    }

    /** เรียกจาก Receipt.issue เท่านั้น บรรทัดเกิดพร้อมใบเสร็จและไม่เปลี่ยนอีก */
    static ReceiptLine of(Receipt receipt, LeaseExtraCharge charge) {
        ReceiptLine line = new ReceiptLine();
        line.receipt = receipt;
        line.leaseId = receipt.getLease().getId();
        line.chargeId = charge.getChargeId();
        line.label = charge.getLabel();
        line.recurrence = charge.getRecurrence();
        line.amount = charge.getAmount();
        return line;
    }

    public Long getId() {
        return id;
    }

    public Long getChargeId() {
        return chargeId;
    }

    public String getLabel() {
        return label;
    }

    public ChargeRecurrence getRecurrence() {
        return recurrence;
    }

    public BigDecimal getAmount() {
        return amount;
    }
}
