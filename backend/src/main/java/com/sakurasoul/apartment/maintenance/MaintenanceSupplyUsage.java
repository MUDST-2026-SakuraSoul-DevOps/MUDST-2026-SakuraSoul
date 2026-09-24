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
 * ของที่ใช้ไปกับงานซ่อมใบหนึ่ง (US-12-S1 ตอนที่ของถูกตัดออกจากสต็อกอัตโนมัติ)
 * <p>
 * เก็บแยกเป็นแถวแทนที่จะบันทึกแค่ว่าสต็อกลดลง เพราะ US-13 ให้ย้อนดูประวัติได้ว่าห้องนี้
 * เคยซ่อมอะไรและใช้อะไรไปบ้าง ซึ่งเป็นข้อมูลที่หายไปทันทีถ้าเก็บแต่ยอดคงเหลือ
 */
@Entity
@Table(name = "maintenance_supply_usage")
public class MaintenanceSupplyUsage {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "ticket_id", nullable = false)
    private MaintenanceTicket ticket;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "supply_id", nullable = false)
    private SupplyItem supply;

    @Column(name = "quantity", nullable = false)
    private int quantity;

    @Column(name = "used_at", nullable = false)
    private Instant usedAt;

    protected MaintenanceSupplyUsage() {
    }

    public MaintenanceSupplyUsage(MaintenanceTicket ticket, SupplyItem supply, int quantity, Instant usedAt) {
        this.ticket = ticket;
        this.supply = supply;
        this.quantity = quantity;
        this.usedAt = usedAt;
    }

    @PrePersist
    void onCreate() {
        if (usedAt == null) {
            usedAt = Instant.now();
        }
    }

    public Long getId() {
        return id;
    }

    public MaintenanceTicket getTicket() {
        return ticket;
    }

    public SupplyItem getSupply() {
        return supply;
    }

    public int getQuantity() {
        return quantity;
    }

    public Instant getUsedAt() {
        return usedAt;
    }
}
