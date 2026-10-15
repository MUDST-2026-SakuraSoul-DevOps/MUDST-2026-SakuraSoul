package com.sakurasoul.apartment.lease;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;

import java.math.BigDecimal;

/**
 * เงินมัดจำกับอัตราค่าสาธารณูปโภคที่ล็อกไว้กับสัญญาใบนี้ตอนกดบันทึก
 * <p>
 * ค่าตั้งต้นมาจาก Apartment Config แต่พอบันทึกแล้วถือเป็นค่าของสัญญาใบนี้เอง
 * ไม่ได้อ้างอิงกลับไปที่ตารางนั้นอีก เพราะ apartment_config มีแถวเดียวทั้งตึกและ
 * ถูกเขียนทับทุกครั้งที่แอดมินแก้อัตรา ไม่มีประวัติให้ย้อนดูว่าตอนเซ็นสัญญาอัตราเท่าไหร่
 * ถ้าไม่คัดลอกมาเก็บ วันที่แอดมินขึ้นค่าไฟ สัญญาเก่าทุกใบจะเปลี่ยนเงื่อนไขย้อนหลัง
 * <p>
 * ที่รวมห้าค่านี้เป็นก้อนเดียวแทนที่จะยัดเข้า constructor ของ Lease ตรง ๆ เพราะเป็น
 * BigDecimal เรียงกันห้าตัว สลับค่าน้ำกับค่าไฟกันแล้วไม่มีอะไรจับได้เลยสักชั้น
 * <p>
 * ดีไซน์จอ Create Contract เขียนกำกับไว้ว่า "Rates default from Apartment Config
 * and are locked into this contract once saved"
 */
@Embeddable
public class LeaseCharges {

    @Column(name = "security_deposit", nullable = false, precision = 10, scale = 2)
    private BigDecimal securityDeposit;

    @Column(name = "electric_rate_per_unit", nullable = false, precision = 10, scale = 2)
    private BigDecimal electricRatePerUnit;

    @Column(name = "water_rate_per_unit", nullable = false, precision = 10, scale = 2)
    private BigDecimal waterRatePerUnit;

    @Column(name = "common_area_fee", nullable = false, precision = 10, scale = 2)
    private BigDecimal commonAreaFee;

    @Column(name = "internet_fee", nullable = false, precision = 10, scale = 2)
    private BigDecimal internetFee;

    protected LeaseCharges() {
    }

    public LeaseCharges(BigDecimal securityDeposit, BigDecimal electricRatePerUnit,
            BigDecimal waterRatePerUnit, BigDecimal commonAreaFee, BigDecimal internetFee) {
        this.securityDeposit = securityDeposit;
        this.electricRatePerUnit = electricRatePerUnit;
        this.waterRatePerUnit = waterRatePerUnit;
        this.commonAreaFee = commonAreaFee;
        this.internetFee = internetFee;
    }

    public BigDecimal getSecurityDeposit() {
        return securityDeposit;
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
}
