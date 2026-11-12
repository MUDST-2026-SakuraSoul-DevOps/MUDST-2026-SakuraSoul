package com.sakurasoul.apartment.maintenance;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

import java.time.Instant;

/**
 * การตั้งยอดคงเหลือใหม่ตรง ๆ จากฟอร์มแก้ไขหนึ่งครั้ง (SSK-171)
 * <p>
 * เก็บเป็นส่วนต่าง (ยอดใหม่ลบยอดเดิม) ไม่ใช่ยอดใหม่ ประวัติความเคลื่อนไหวจึงบวกแถวนี้ต่อกับการเติมและการเบิกได้ตรง ๆ
 * (StockLedger) ถ้าไม่มีตารางนี้ ยอดในประวัติจะไม่ตรงกับยอดจริงทุกครั้งที่มีคนนับสต็อกแล้วแก้ตัวเลขในฟอร์ม
 * <p>
 * ไม่มีเมธอดแก้ค่า เหตุผลเดียวกับ SupplyRestock คือแถวประวัติที่แก้ย้อนหลังได้คือประวัติที่เชื่อไม่ได้
 */
@Entity
@Table(name = "supply_adjustment")
public class SupplyAdjustment {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "supply_id", nullable = false)
    private SupplyItem supply;

    /** บวกคือเพิ่ม ลบคือลด ไม่เป็นศูนย์ (supply_adjustment_quantity_ck) */
    @Column(name = "quantity", nullable = false)
    private int quantity;

    @Column(name = "adjusted_at", nullable = false)
    private Instant adjustedAt;

    protected SupplyAdjustment() {
    }

    public SupplyAdjustment(SupplyItem supply, int quantity, Instant adjustedAt) {
        this.supply = supply;
        this.quantity = quantity;
        this.adjustedAt = adjustedAt;
    }

    public Long getId() {
        return id;
    }

    public SupplyItem getSupply() {
        return supply;
    }

    public int getQuantity() {
        return quantity;
    }

    public Instant getAdjustedAt() {
        return adjustedAt;
    }
}
