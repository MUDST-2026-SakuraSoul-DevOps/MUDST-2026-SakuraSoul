package com.sakurasoul.apartment.apartmentconfig;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.math.BigDecimal;
import java.time.Instant;

/**
 * อัตราค่าสาธารณูปโภคของทั้งตึก (US-16) กับดอกเบี้ยค้างชำระที่สัญญาใหม่คัดลอกไปตอนเซ็น (SSK-164) มีแถวเดียวเสมอ
 * <p>
 * ไม่มี constructor แบบสร้างของใหม่ เพราะแถวเดียวนั้นถูกใส่ไว้ตั้งแต่ migration V3
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

    /** ดอกเบี้ยค้างชำระต่อเดือน (%) 0 คือไม่คิด 0.00 ถึง 100.00 บังคับด้วย apartment_config_late_interest_ck ใน V21 */
    @Column(name = "late_interest_percent_per_month", nullable = false, precision = 5, scale = 2)
    private BigDecimal lateInterestPercentPerMonth;

    /** จำนวนวันหลังวันครบกำหนดที่ยังไม่คิดดอกเบี้ย 0 ถึง 31 บังคับด้วย apartment_config_grace_days_ck ใน V21 */
    @Column(name = "grace_days", nullable = false)
    private short graceDays;

    /**
     * เวลาที่แก้อัตราสี่ตัวล่าสุด เอาไว้โชว์ว่าอัตราชุดนี้ตั้งไว้เมื่อไหร่
     * <p>
     * ตั้งดอกเบี้ยค้างชำระ ({@link #applyLateInterest}) ไม่เปลี่ยนค่านี้ เพราะหน้าต่าง Apartment Config
     * โชว์ค่านี้ใต้ฟอร์มอัตราสี่ตัวว่า "Last updated" (frontend/src/dialogs/ApartmentConfigDialog.tsx)
     * ถ้าขยับตามการตั้งดอกเบี้ยที่อยู่อีกหน้าต่าง แอดมินจะเข้าใจว่าอัตราน้ำไฟเพิ่งถูกแก้
     * <p>
     * เป็น Instant ไม่ใช่ LocalDate เพราะหน้าเว็บเทียบว่า updatedAt ครั้งหลังต้อง
     * มากกว่าครั้งก่อน (frontend/src/api/client.test.ts) ถ้าเป็นแค่วันที่ การแก้
     * สองครั้งในวันเดียวจะเทียบไม่ได้
     */
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

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
            BigDecimal commonAreaFee, BigDecimal internetFee, Instant updatedAt) {
        this.electricRatePerUnit = electricRatePerUnit;
        this.waterRatePerUnit = waterRatePerUnit;
        this.commonAreaFee = commonAreaFee;
        this.internetFee = internetFee;
        this.updatedAt = updatedAt;
    }

    /**
     * ตั้งดอกเบี้ยค้างชำระกับวันผ่อนผันใหม่ ผู้เรียกต้องตรวจค่าให้ผ่าน LateInterestRules และปัดสองตำแหน่งมาก่อน
     * <p>
     * มีผลกับสัญญาที่ทำหลังจากนี้เท่านั้น สัญญาที่เซ็นแล้วคัดลอกสองค่านี้ไปเก็บใน LeaseLateTerms ตอนเซ็น
     * ไม่แตะอัตราสี่ตัวและ updatedAt PUT ของอัตรากับของดอกเบี้ยจึงไม่ลบค่าของกันและกัน
     */
    void applyLateInterest(BigDecimal lateInterestPercentPerMonth, short graceDays) {
        this.lateInterestPercentPerMonth = lateInterestPercentPerMonth;
        this.graceDays = graceDays;
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

    public BigDecimal getLateInterestPercentPerMonth() {
        return lateInterestPercentPerMonth;
    }

    public int getGraceDays() {
        return graceDays;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }
}
