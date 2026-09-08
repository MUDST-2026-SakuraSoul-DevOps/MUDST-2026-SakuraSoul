package com.sakurasoul.apartment.lease;

import com.sakurasoul.apartment.room.Room;
import com.sakurasoul.apartment.tenant.Tenant;
import jakarta.persistence.Column;
import jakarta.persistence.Embedded;
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

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * สัญญาเช่าหนึ่งใบ ผูกผู้เช่าหนึ่งคนกับห้องหนึ่งห้องในช่วงวันที่หนึ่ง (US-04)
 * <p>
 * ถือ Room กับ Tenant เป็น association ไม่ใช่ id เปล่า ๆ เพราะทุก response ของสัญญา
 * ต้องส่งเลขห้องกับชื่อผู้เช่าไปด้วยตามสัญญา API ถ้าเก็บแค่ id จะต้องไปตามอ่านเองทุกที่
 * <p>
 * โหลดแบบ LAZY แล้วแตะชื่อตอนแปลงเป็น DTO ซึ่งยังอยู่ใน transaction เดิม
 * (application.yml ปิด open-in-view ไว้ การแตะนอก transaction จะพังทันทีให้เห็น)
 */
@Entity
@Table(name = "lease")
public class Lease {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "room_id", nullable = false)
    private Room room;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "tenant_id", nullable = false)
    private Tenant tenant;

    @Column(name = "start_date", nullable = false)
    private LocalDate startDate;

    /** ว่างได้ แปลว่ายังไม่กำหนดวันจบสัญญา ในเชิงช่วงวันที่ถือว่ายาวไปไม่มีที่สิ้นสุด */
    @Column(name = "end_date")
    private LocalDate endDate;

    @Column(name = "monthly_rent", nullable = false, precision = 10, scale = 2)
    private BigDecimal monthlyRent;

    @Enumerated(EnumType.STRING)
    @Column(name = "billing_cycle", nullable = false, length = 10)
    private BillingCycle billingCycle;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 10)
    private LeaseStatus status;

    /** เงินมัดจำกับอัตราค่าน้ำค่าไฟที่ล็อกไว้ตอนเซ็น ดูเหตุผลใน LeaseCharges */
    @Embedded
    private LeaseCharges charges;

    protected Lease() {
    }

    /** สัญญาที่เพิ่งสร้างเริ่มที่ ACTIVE เสมอ การปิดสัญญาเป็นงานของ US-06 */
    public Lease(Room room, Tenant tenant, LocalDate startDate, LocalDate endDate,
            BigDecimal monthlyRent, BillingCycle billingCycle, LeaseCharges charges) {
        this.room = room;
        this.tenant = tenant;
        this.startDate = startDate;
        this.endDate = endDate;
        this.monthlyRent = monthlyRent;
        this.billingCycle = billingCycle;
        this.charges = charges;
        this.status = LeaseStatus.ACTIVE;
    }

    /**
     * สัญญาใบนี้ครอบวันที่ที่ถามมาหรือเปล่า ใช้ตัดสินว่าห้องมีคนอยู่วันนี้ไหม
     * ปิดสองด้านทั้งวันเริ่มและวันจบ ให้ตรงกับ daterange(..., '[]') ใน V3
     */
    public boolean coversDate(LocalDate date) {
        if (date.isBefore(startDate)) {
            return false;
        }
        return endDate == null || !date.isAfter(endDate);
    }

    /**
     * ช่วงวันที่ที่ขอมาทับกับสัญญาใบนี้หรือเปล่า
     * <p>
     * ใช้เพื่อสร้างข้อความเตือนที่บอกได้ว่าไปชนกับสัญญาใบไหน ไม่ได้ใช้เป็นตัวกันจริง
     * ตัวกันจริงคือ constraint lease_no_overlap เพราะสองคำขอที่เข้ามาพร้อมกัน
     * จะเช็คตรงนี้ผ่านทั้งคู่แล้วเขียนลงไปทั้งคู่
     */
    public boolean overlaps(LocalDate otherStart, LocalDate otherEnd) {
        boolean startsBeforeThisEnds = endDate == null || !otherStart.isAfter(endDate);
        boolean thisStartsBeforeOtherEnds = otherEnd == null || !startDate.isAfter(otherEnd);
        return startsBeforeThisEnds && thisStartsBeforeOtherEnds;
    }

    public Long getId() {
        return id;
    }

    public Room getRoom() {
        return room;
    }

    public Tenant getTenant() {
        return tenant;
    }

    public LocalDate getStartDate() {
        return startDate;
    }

    public LocalDate getEndDate() {
        return endDate;
    }

    public BigDecimal getMonthlyRent() {
        return monthlyRent;
    }

    public BillingCycle getBillingCycle() {
        return billingCycle;
    }

    public LeaseStatus getStatus() {
        return status;
    }

    public LeaseCharges getCharges() {
        return charges;
    }
}
