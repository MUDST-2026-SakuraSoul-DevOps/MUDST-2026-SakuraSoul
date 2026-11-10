package com.sakurasoul.apartment.lease;

import com.sakurasoul.apartment.extracharge.ChargeRecurrence;
import com.sakurasoul.apartment.extracharge.RoomExtraCharge;
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
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.Set;

/**
 * สำเนาค่าใช้จ่ายพิเศษในสัญญา (SSK-165 + SSK-180) คัดลอกจากรายการของห้องตอนเซ็น บิลของสัญญานี้คิดจากสำเนานี้
 * <p>
 * ชื่อ ยอด ความถี่ และช่วงเดือนล็อกตามวันเซ็น แอดมินแก้รายการของห้องทีหลัง สัญญาเดิมไม่เปลี่ยน
 * แบบเดียวกับค่าเช่าและอัตราใน LeaseCharges ส่วนสถานะเปิดปิดอ่านจากรายการต้นทางเสมอ ดู {@link #isActive()}
 * <p>
 * {@link Immutable} เพราะสำเนาไม่มีวันถูกแก้หลังเซ็น Hibernate จะไม่ส่ง UPDATE ของ entity นี้ออกไปเลย
 */
@Entity
@Table(name = "lease_extra_charge")
@Immutable
public class LeaseExtraCharge {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "lease_id", nullable = false)
    private Lease lease;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "charge_id", nullable = false)
    private RoomExtraCharge charge;

    @Column(name = "label", nullable = false, length = 80)
    private String label;

    @Column(name = "amount", nullable = false, precision = 10, scale = 2)
    private BigDecimal amount;

    @Enumerated(EnumType.STRING)
    @Column(name = "recurrence", nullable = false, length = 10)
    private ChargeRecurrence recurrence;

    @Column(name = "start_month", nullable = false)
    private LocalDate startMonth;

    /** null คือไม่มีเดือนสุดท้าย ค่าครั้งเดียวเป็น null เสมอ */
    @Column(name = "end_month")
    private LocalDate endMonth;

    protected LeaseExtraCharge() {
    }

    /** เรียกจาก Lease.agreeExtraCharges เท่านั้น สำเนาเกิดตอนเซ็นสัญญาครั้งเดียว */
    static LeaseExtraCharge copyOf(Lease lease, RoomExtraCharge charge) {
        LeaseExtraCharge copy = new LeaseExtraCharge();
        copy.lease = lease;
        copy.charge = charge;
        copy.label = charge.getLabel();
        copy.amount = charge.getAmount();
        copy.recurrence = charge.getRecurrence();
        copy.startMonth = charge.getStartMonth();
        copy.endMonth = charge.getEndMonth();
        return copy;
    }

    /**
     * ห้องยังเปิดใช้รายการนี้อยู่ไหม อ่านจากรายการต้นทาง ไม่ได้เก็บไว้ในสำเนา
     * <p>
     * การปิดรายการต้องหยุดเก็บเงินในบิลใหม่ของทุกสัญญาที่มีสำเนา (เอกสารและ backend จำลองของหน้าเว็บ)
     * ถ้าเก็บสถานะไว้ในสำเนาด้วย ต้องมีโค้ดคอยไล่แก้ทุกสำเนาทุกครั้งที่ปิดเปิด ซึ่งพลาดเมื่อไหร่สองที่จะไม่ตรงกัน
     */
    public boolean isActive() {
        return charge.isActive();
    }

    /**
     * ต้องเก็บรายการนี้ในบิลของเดือนนั้นไหม กฎเดียวกับ dueExtraCharges ใน frontend/src/domain/extraCharge.ts
     * <ul>
     *   <li>ปิดอยู่ หรือยังไม่ถึงเดือนแรก: ไม่เก็บ</li>
     *   <li>รายเดือน: เก็บถึงเดือนสุดท้าย (รวมเดือนนั้น) ไม่มีเดือนสุดท้ายคือเก็บไปเรื่อย ๆ</li>
     *   <li>ครั้งเดียว: เก็บถ้าบิลก่อน ๆ ของสัญญานี้ยังไม่เคยเก็บ billedOneTimeChargeIds คือ id ของรายการครั้งเดียว
     *       ที่สัญญานี้เก็บไปแล้ว ซึ่งรู้ได้จากใบเสร็จเก่าเท่านั้น ผู้เรียกจึงต้องส่งมา</li>
     * </ul>
     */
    public boolean isDueIn(YearMonth month, Set<Long> billedOneTimeChargeIds) {
        if (!isActive() || month.isBefore(YearMonth.from(startMonth))) {
            return false;
        }
        return switch (recurrence) {
            case ONE_TIME -> !billedOneTimeChargeIds.contains(getChargeId());
            case MONTHLY -> endMonth == null || !month.isAfter(YearMonth.from(endMonth));
        };
    }

    public Long getId() {
        return id;
    }

    /** id ของรายการต้นทาง อ่านจาก proxy ได้โดยไม่ต้องโหลดแถวนั้น */
    public Long getChargeId() {
        return charge.getId();
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
