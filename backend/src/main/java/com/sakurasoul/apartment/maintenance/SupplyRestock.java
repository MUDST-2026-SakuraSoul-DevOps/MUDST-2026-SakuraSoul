package com.sakurasoul.apartment.maintenance;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;

import java.time.Instant;

/**
 * การเติมของเข้าคลังหนึ่งครั้ง (US-17-S2)
 * <p>
 * มีไว้เพื่อตอบการ์ด "restocked this week" บนหน้าคลังอุปกรณ์ ซึ่งดูจากยอดคงเหลืออย่างเดียว
 * ไม่มีทางรู้ว่าสัปดาห์นี้เติมอะไรไปเท่าไหร่ ตารางนี้จึงเป็นสมุดบันทึก ไม่ใช่ตัวเลขสรุป
 * <p>
 * ไม่มีเมธอดแก้ค่าใด ๆ เพราะแถวประวัติที่แก้ย้อนหลังได้คือประวัติที่เชื่อไม่ได้
 */
@Entity
@Table(name = "supply_restock")
public class SupplyRestock {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "supply_id", nullable = false)
    private SupplyItem supply;

    @Column(name = "quantity", nullable = false)
    private int quantity;

    @Column(name = "restocked_at", nullable = false)
    private Instant restockedAt;

    protected SupplyRestock() {
    }

    public SupplyRestock(SupplyItem supply, int quantity, Instant restockedAt) {
        this.supply = supply;
        this.quantity = quantity;
        this.restockedAt = restockedAt;
    }

    @PrePersist
    void onCreate() {
        if (restockedAt == null) {
            restockedAt = Instant.now();
        }
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

    public Instant getRestockedAt() {
        return restockedAt;
    }
}
