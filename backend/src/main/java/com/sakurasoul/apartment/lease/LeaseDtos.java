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
            BillingCycle billingCycle) {
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
            LeaseStatus status) {

        public static LeaseResponse of(Lease lease) {
            return new LeaseResponse(lease.getId(),
                    lease.getRoom().getId(), lease.getRoom().getRoomNumber(),
                    lease.getTenant().getId(), lease.getTenant().getFullName(),
                    lease.getStartDate(), lease.getEndDate(), lease.getMonthlyRent(),
                    lease.getBillingCycle(), lease.getStatus());
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
