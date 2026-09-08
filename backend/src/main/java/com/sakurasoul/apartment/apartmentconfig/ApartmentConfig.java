package com.sakurasoul.apartment.apartmentconfig;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * อัตราค่าสาธารณูปโภคของทั้งตึก (US-16) มีแถวเดียวเสมอ
 * <p>
 * ไม่มี constructor แบบสร้างของใหม่ เพราะแถวเดียวนั้นถูกใส่ไว้ตั้งแต่ migration V4
 * แล้ว การใช้งานมีแค่โหลดมาแล้วแก้ค่า ไม่มีเคสสร้างเพิ่มหรือลบทิ้ง
 * <p>
 * ชื่อ package เป็น apartmentconfig ไม่ใช่ config เพราะ config เป็นที่อยู่ของ
 * SecurityConfig อยู่แล้ว
 */
@Entity
@Table(name = "apartment_config")
public class ApartmentConfig {

    /** ล็อกเป็น 1 เสมอด้วย CHECK constraint ใน migration */
    @Id
    @Column(name = "id", nullable = false)
    private Short id;

    @Column(name = "electric_rate_per_unit", nullable = false, precision = 10, scale = 2)
    private BigDecimal electricRatePerUnit;

    @Column(name = "water_rate_per_unit", nullable = false, precision = 10, scale = 2)
    private BigDecimal waterRatePerUnit;

    @Column(name = "common_area_fee", nullable = false, precision = 10, scale = 2)
    private BigDecimal commonAreaFee;

    @Column(name = "internet_fee", nullable = false, precision = 10, scale = 2)
    private BigDecimal internetFee;

    /** วันที่แก้อัตราล่าสุด เอาไว้โชว์ว่าอัตราชุดนี้ตั้งไว้เมื่อไหร่ */
    @Column(name = "updated_at", nullable = false)
    private LocalDate updatedAt;

    protected ApartmentConfig() {
    }

    /**
     * ทับอัตราทั้งชุดด้วยค่าใหม่ ผู้เรียกต้องตรวจค่าให้ผ่าน ApartmentConfigRules มาก่อน
     * <p>
     * เขียนทับของเดิมโดยไม่เก็บประวัติ ซึ่งตั้งใจให้เป็นแบบนั้น เพราะสัญญาที่เซ็นไปแล้ว
     * เก็บอัตราของตัวเองไว้ในตาราง lease อยู่แล้ว การเปลี่ยนที่นี่จึงกระทบแค่สัญญาที่จะ
     * สร้างหลังจากนี้
     */
    void apply(BigDecimal electricRatePerUnit, BigDecimal waterRatePerUnit,
            BigDecimal commonAreaFee, BigDecimal internetFee, LocalDate updatedAt) {
        this.electricRatePerUnit = electricRatePerUnit;
        this.waterRatePerUnit = waterRatePerUnit;
        this.commonAreaFee = commonAreaFee;
        this.internetFee = internetFee;
        this.updatedAt = updatedAt;
    }

    public Short getId() {
        return id;
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

    public LocalDate getUpdatedAt() {
        return updatedAt;
    }
}
