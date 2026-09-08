package com.sakurasoul.apartment.lease;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * รูปร่างของ request กับ response ของสัญญาเช่า ตกลงกับหน้าเว็บไว้แล้วใน
 * docs/api-contract-lease.md ลำดับและชื่อฟิลด์ต้องตรงกับที่เขียนไว้ที่นั่น
 * เทสที่บังคับสัญญานี้ฝั่งหน้าเว็บอยู่ที่ frontend/src/api/client.test.ts
 */
public final class LeaseDtos {

    private LeaseDtos() {
    }

    public record LeaseRequest(
            @NotNull(message = "ต้องระบุห้อง")
            Long roomId,

            @NotNull(message = "ต้องระบุผู้เช่า")
            Long tenantId,

            @NotNull(message = "ต้องระบุวันเริ่มสัญญา")
            LocalDate startDate,

            /** ว่างได้ แปลว่ายังไม่กำหนดวันจบสัญญา */
            LocalDate endDate,

            @NotNull(message = "ต้องระบุค่าเช่า")
            @PositiveOrZero(message = "ค่าเช่าต้องไม่ติดลบ")
            BigDecimal monthlyRent,

            @NotNull(message = "ต้องระบุรอบบิล")
            BillingCycle billingCycle,

            @NotNull(message = "ต้องระบุเงินมัดจำ")
            @PositiveOrZero(message = "เงินมัดจำ ต้องไม่ติดลบ")
            BigDecimal securityDeposit,

            // อัตราสี่ตัวข้างล่างหน้าเว็บเป็นคนเติมค่าตั้งต้นมาจาก Apartment Config
            // แล้วแอดมินแก้รายสัญญาได้ตามดีไซน์ ฝั่งนี้จึงรับมาเก็บอย่างเดียว
            // ไม่ได้ไปอ่าน apartment_config เอง ทำให้ตั๋วนี้ไม่ต้องรอ SSK-22
            // ข้อความเตือนตั้งให้ตรงกับ validateApartmentConfig ฝั่งหน้าเว็บ

            @NotNull(message = "ต้องระบุค่าไฟต่อหน่วย")
            @PositiveOrZero(message = "ค่าไฟต่อหน่วย ต้องไม่ติดลบ")
            BigDecimal electricRatePerUnit,

            @NotNull(message = "ต้องระบุค่าน้ำต่อหน่วย")
            @PositiveOrZero(message = "ค่าน้ำต่อหน่วย ต้องไม่ติดลบ")
            BigDecimal waterRatePerUnit,

            @NotNull(message = "ต้องระบุค่าส่วนกลาง")
            @PositiveOrZero(message = "ค่าส่วนกลาง ต้องไม่ติดลบ")
            BigDecimal commonAreaFee,

            @NotNull(message = "ต้องระบุค่าอินเทอร์เน็ต")
            @PositiveOrZero(message = "ค่าอินเทอร์เน็ต ต้องไม่ติดลบ")
            BigDecimal internetFee) {

        /** รวมห้าค่าที่ต้องล็อกไว้กับสัญญาเป็นก้อนเดียวก่อนส่งต่อให้ entity */
        public LeaseCharges toCharges() {
            return new LeaseCharges(securityDeposit, electricRatePerUnit, waterRatePerUnit,
                    commonAreaFee, internetFee);
        }
    }

    public record LeaseResponse(
            Long id,
            Long roomId,
            String roomNumber,
            Long tenantId,
            String tenantName,
            LocalDate startDate,
            LocalDate endDate,
            BigDecimal monthlyRent,
            BillingCycle billingCycle,
            /* อัตราที่ล็อกไว้ตอนเซ็น ส่งกลับไปด้วยเพื่อให้หน้าเว็บโชว์ได้ว่าสัญญาใบนี้ใช้อัตราชุดไหน */
            BigDecimal securityDeposit,
            BigDecimal electricRatePerUnit,
            BigDecimal waterRatePerUnit,
            BigDecimal commonAreaFee,
            BigDecimal internetFee,
            LeaseStatus status) {

        public static LeaseResponse of(Lease lease) {
            LeaseCharges charges = lease.getCharges();
            return new LeaseResponse(lease.getId(),
                    lease.getRoom().getId(), lease.getRoom().getRoomNumber(),
                    lease.getTenant().getId(), lease.getTenant().getFullName(),
                    lease.getStartDate(), lease.getEndDate(), lease.getMonthlyRent(),
                    lease.getBillingCycle(),
                    charges.getSecurityDeposit(), charges.getElectricRatePerUnit(),
                    charges.getWaterRatePerUnit(), charges.getCommonAreaFee(),
                    charges.getInternetFee(),
                    lease.getStatus());
        }
    }

    /**
     * สัญญาที่กำลัง active ของห้องหนึ่ง เอาไปแปะบนการ์ดห้องในผังห้อง
     * ไม่มี roomId กับ status เพราะก้อนนี้ฝังอยู่ใน response ของห้องนั้นอยู่แล้ว
     * และจะส่งเฉพาะตอนที่ห้องมีสัญญา active เท่านั้น
     */
    public record LeaseBrief(
            Long id,
            Long tenantId,
            String tenantName,
            LocalDate startDate,
            LocalDate endDate,
            BigDecimal monthlyRent,
            BillingCycle billingCycle) {

        public static LeaseBrief of(Lease lease) {
            return new LeaseBrief(lease.getId(),
                    lease.getTenant().getId(), lease.getTenant().getFullName(),
                    lease.getStartDate(), lease.getEndDate(), lease.getMonthlyRent(),
                    lease.getBillingCycle());
        }
    }
}
