package com.sakurasoul.apartment.extracharge;

import com.sakurasoul.apartment.common.Money;
import com.sakurasoul.apartment.room.Room;
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
import org.hibernate.annotations.BatchSize;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * ค่าใช้จ่ายพิเศษของห้องหนึ่งห้อง (SSK-165) เช่น ค่าที่จอดรถ ค่าเฟอร์นิเจอร์ เป็นค่าตั้งที่แอดมินแก้ได้
 * <p>
 * แถวนี้ไม่ได้ถูกคิดเงินตรง ๆ ตอนทำสัญญาจะถูกคัดลอกลงสัญญา (LeaseExtraCharge) แล้วบิลคิดจากสำเนานั้น
 * การแก้ชื่อหรือยอดที่นี่จึงมีผลกับสัญญาที่ทำหลังจากนี้เท่านั้น ข้อยกเว้นเดียวคือ {@link #isActive()}
 * ที่สำเนาทุกใบอ่านจากแถวนี้ตรง ๆ ปิดรายการแล้วบิลใหม่ของทุกสัญญาหยุดเก็บทันที
 * <p>
 * {@link BatchSize} เพราะหน้ารายการสัญญาต้องอ่านสถานะเปิดปิดของสำเนาทุกใบ ให้ Hibernate โหลดแถวที่ต้องใช้
 * ทีละหลายแถวในคิวรีเดียว ไม่ใช่คิวรีละแถว
 */
@Entity
@Table(name = "room_extra_charge")
@BatchSize(size = 50)
public class RoomExtraCharge {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "room_id", nullable = false)
    private Room room;

    @Column(name = "label", nullable = false, length = 80)
    private String label;

    @Column(name = "amount", nullable = false, precision = 10, scale = 2)
    private BigDecimal amount;

    @Enumerated(EnumType.STRING)
    @Column(name = "recurrence", nullable = false, length = 10)
    private ChargeRecurrence recurrence;

    /** วันที่ 1 ของเดือนแรกที่เก็บ บังคับด้วย room_extra_charge_months_ck ใน V18 */
    @Column(name = "start_month", nullable = false)
    private LocalDate startMonth;

    /** วันที่ 1 ของเดือนสุดท้ายที่เก็บ null คือไม่มีกำหนด ค่าครั้งเดียวเป็น null เสมอ */
    @Column(name = "end_month")
    private LocalDate endMonth;

    @Column(name = "active", nullable = false)
    private boolean active;

    protected RoomExtraCharge() {
    }

    public RoomExtraCharge(Room room, ExtraChargeTerms terms, boolean active) {
        this.room = room;
        apply(terms);
        this.active = active;
    }

    /** แก้ทั้งก้อนตาม PUT ของสัญญา API สัญญาที่คัดลอกไปแล้วยังคงชื่อกับยอดเดิม ดูคอมเมนต์ของคลาส */
    void update(ExtraChargeTerms terms, boolean active) {
        apply(terms);
        this.active = active;
    }

    /** ยอดถูกปัดเป็นสองตำแหน่งก่อนเก็บ ให้ค่าที่ตอบกลับตรงกับที่ NUMERIC(10,2) เก็บจริง */
    private void apply(ExtraChargeTerms terms) {
        this.label = terms.label();
        this.amount = Money.round(terms.amount());
        this.recurrence = terms.recurrence();
        this.startMonth = terms.startMonth().atDay(1);
        this.endMonth = terms.endMonth() == null ? null : terms.endMonth().atDay(1);
    }

    /** ห้องเปิดใช้รายการนี้อยู่ไหม สัญญาทุกใบที่มีสำเนาของรายการนี้อ่านค่านี้ตอนออกบิล */
    public boolean isActive() {
        return active;
    }

    public Long getId() {
        return id;
    }

    public Room getRoom() {
        return room;
    }

    public String getLabel() {
        return label;
    }

    public BigDecimal getAmount() {
        return amount;
    }

    public ChargeRecurrence getRecurrence() {
        return recurrence;
    }

    public LocalDate getStartMonth() {
        return startMonth;
    }

    public LocalDate getEndMonth() {
        return endMonth;
    }
}
