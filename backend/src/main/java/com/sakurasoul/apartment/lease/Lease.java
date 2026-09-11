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

    /** สัญญาที่เพิ่งสร้างเริ่มที่ ACTIVE เสมอ การปิดสัญญาทำผ่าน terminate() (US-06) */
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
     * แก้สัญญาใบเดิมทั้งก้อนตาม US-06 ฝั่งหน้าเว็บส่ง body ชุดเดียวกับตอนสร้างมาให้
     * <p>
     * ไม่รับ Room เข้ามาเพราะการย้ายสัญญาข้ามห้องยังไม่ได้ตกลงกันว่าจะนับเป็นสัญญาใหม่
     * หรือแก้ของเดิม (docs/api-contract-lease.md หัวข้อ "ของที่ยังไม่ได้ตกลง") ตัวที่ปฏิเสธ
     * คำขอย้ายห้องคือ LeaseService ส่วนตรงนี้แค่ไม่เปิดช่องให้เปลี่ยนได้เลย
     * <p>
     * charges ให้ผู้เรียกประกอบมาให้เสร็จ เพราะกฎว่า "ช่องไหนไม่ส่งมาให้คงค่าที่ล็อกไว้เดิม"
     * ต้องเทียบกับ request ซึ่งเป็นเรื่องของชั้น service ไม่ใช่ของ entity
     * <p>
     * ไม่แตะ status เพราะการปิดสัญญาเป็นงานของ terminate() คนละเจตนากัน
     */
    public void update(Tenant tenant, LocalDate startDate, LocalDate endDate,
            BigDecimal monthlyRent, BillingCycle billingCycle, LeaseCharges charges) {
        this.tenant = tenant;
        this.startDate = startDate;
        this.endDate = endDate;
        this.monthlyRent = monthlyRent;
        this.billingCycle = billingCycle;
        this.charges = charges;
    }

    /**
     * ปิดสัญญาตาม US-06-S1 ตั้งวันสิ้นสุดเป็นวันที่แอดมินเลือกแล้วเปลี่ยนสถานะเป็น ENDED
     * <p>
     * ไม่ต้องไปสั่งให้ห้องว่างเพิ่ม เพราะสถานะห้องคำนวณจากสัญญา ACTIVE ที่ครอบวันนี้เท่านั้น
     * (RoomService.activeLeasesToday) พอใบนี้ไม่ ACTIVE แล้วห้องจึงกลับไป AVAILABLE ทันที
     * กฎเดียวกับ statusOf ใน frontend/src/api/mockApi.ts ที่หน้าเว็บเขียนเทสไว้แล้ว
     * <p>
     * และเพราะ constraint lease_no_overlap มี WHERE (status = 'ACTIVE') ใบที่ปิดแล้ว
     * จึงไม่กันช่วงวันที่ของห้องนี้อีก ปล่อยเช่าต่อทับช่วงเดิมได้เลย
     */
    public void terminate(LocalDate endDate) {
        this.endDate = endDate;
        this.status = LeaseStatus.ENDED;
    }

    /** ปิดไปแล้วหรือยัง ใช้กันไม่ให้แก้หรือปิดซ้ำ */
    public boolean isEnded() {
        return status == LeaseStatus.ENDED;
    }

    /**
     * สัญญาใบนี้ครอบวันที่ที่ถามมาหรือเปล่า ใช้ตัดสินว่าห้องมีคนอยู่วันนี้ไหม
     * ปิดสองด้านทั้งวันเริ่มและวันจบ ให้ตรงกับ daterange(..., '[]') ใน V4
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
