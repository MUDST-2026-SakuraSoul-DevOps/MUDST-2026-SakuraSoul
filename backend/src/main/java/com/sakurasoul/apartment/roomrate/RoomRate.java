package com.sakurasoul.apartment.roomrate;

import com.sakurasoul.apartment.common.Money;
import com.sakurasoul.apartment.room.Room;
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
import java.time.Instant;
import java.time.LocalDate;
import java.time.YearMonth;

/**
 * อัตราของห้องหนึ่งห้องที่เริ่มมีผลตั้งแต่เดือนหนึ่ง (SSK-162) หนึ่งแถวต่อการตั้งอัตราหนึ่งครั้ง
 * <p>
 * ห้องที่ไม่มีแถวในตารางนี้ใช้ค่าตั้งต้นเดิม คือค่าเช่าตามชนิดห้อง (V12) กับอัตราของ apartment_config
 * แถวนี้มีผลกับ <b>สัญญาที่เริ่มตั้งแต่เดือน effectiveFrom</b> เท่านั้น สัญญาเดิมล็อกอัตราของตัวเองไว้ตั้งแต่วันเซ็น
 * ดู LeaseService.create
 * <p>
 * {@link Immutable} เพราะตารางนี้เพิ่มอย่างเดียว (append-only) ตั้งผิดให้ตั้งแถวใหม่ที่เดือนถัดไป ไม่มีการแก้แถวเดิม
 * Hibernate จะไม่ส่ง UPDATE ของ entity นี้ออกไปเลยแม้มีโค้ดไปเผลอแก้ค่าในหน่วยความจำ
 */
@Entity
@Table(name = "room_rate")
@Immutable
public class RoomRate {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "room_id", nullable = false)
    private Room room;

    /** วันที่ 1 ของเดือนที่เริ่มมีผลเสมอ บังคับด้วย room_rate_month_first_day_ck ใน V17 */
    @Column(name = "effective_from", nullable = false)
    private LocalDate effectiveFrom;

    @Column(name = "monthly_rent", nullable = false, precision = 10, scale = 2)
    private BigDecimal monthlyRent;

    @Column(name = "electric_rate_per_unit", nullable = false, precision = 10, scale = 2)
    private BigDecimal electricRatePerUnit;

    @Column(name = "water_rate_per_unit", nullable = false, precision = 10, scale = 2)
    private BigDecimal waterRatePerUnit;

    @Column(name = "common_area_fee", nullable = false, precision = 10, scale = 2)
    private BigDecimal commonAreaFee;

    @Column(name = "internet_fee", nullable = false, precision = 10, scale = 2)
    private BigDecimal internetFee;

    @Column(name = "note", length = 200)
    private String note;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected RoomRate() {
    }

    /** เงินทุกช่องถูกปัดเป็นสองตำแหน่งก่อนเก็บ ให้ค่าที่ตอบกลับตรงกับที่ NUMERIC(10,2) เก็บจริง */
    public RoomRate(Room room, YearMonth effectiveFrom, BigDecimal monthlyRent, BigDecimal electricRatePerUnit,
            BigDecimal waterRatePerUnit, BigDecimal commonAreaFee, BigDecimal internetFee, String note,
            Instant createdAt) {
        this.room = room;
        this.effectiveFrom = effectiveFrom.atDay(1);
        this.monthlyRent = Money.round(monthlyRent);
        this.electricRatePerUnit = Money.round(electricRatePerUnit);
        this.waterRatePerUnit = Money.round(waterRatePerUnit);
        this.commonAreaFee = Money.round(commonAreaFee);
        this.internetFee = Money.round(internetFee);
        this.note = note;
        this.createdAt = createdAt;
    }

    public Long getId() {
        return id;
    }

    public Room getRoom() {
        return room;
    }

    public LocalDate getEffectiveFrom() {
        return effectiveFrom;
    }

    public BigDecimal getMonthlyRent() {
        return monthlyRent;
    }

    public BigDecimal getElectricRatePerUnit() {
        return electricRatePerUnit;
    }

    public BigDecimal getWaterRatePerUnit() {
        return waterRatePerUnit;
    }

    public BigDecimal getCommonAreaFee() {
        return commonAreaFee;
    }

    public BigDecimal getInternetFee() {
        return internetFee;
    }

    public String getNote() {
        return note;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
