package com.sakurasoul.apartment.lease;

import com.sakurasoul.apartment.common.Months;
import com.sakurasoul.apartment.extracharge.ChargeRecurrence;
import com.sakurasoul.apartment.room.RoomType;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

/**
 * รูปร่างของ request กับ response ของสัญญาเช่า ตกลงกับหน้าเว็บไว้แล้วใน
 * docs/api-contract-lease.md ลำดับและชื่อฟิลด์ต้องตรงกับที่เขียนไว้ที่นั่น
 * เทสที่บังคับสัญญานี้ฝั่งหน้าเว็บอยู่ที่ frontend/src/api/client.test.ts
 */
public final class LeaseDtos {

    private LeaseDtos() {
    }

    public record LeaseRequest(
            @NotNull(message = "Please choose the unit")
            Long roomId,

            @NotNull(message = "Please choose the tenant")
            Long tenantId,

            @NotNull(message = "Please choose the start date")
            LocalDate startDate,

            /** ว่างได้ แปลว่ายังไม่กำหนดวันจบสัญญา */
            LocalDate endDate,

            /*
             * ตั้งแต่ V12 (SSK-127) ค่าเช่ามาจากชนิดห้อง ช่องนี้ไม่บังคับและถูกมองข้าม
             * เก็บไว้ในสัญญา API เพื่อไม่ให้ body ที่หน้าเว็บส่งอยู่เดิมพังทันที
             * จะถอดออกตอนรื้อฟอร์มสัญญาฝั่งหน้าเว็บ (ดู docs/api-contract-lease.md)
             */
            BigDecimal monthlyRent,

            @NotNull(message = "Please choose the billing cycle")
            BillingCycle billingCycle,

            // ห้าค่าข้างล่างไม่บังคับ เพราะฟอร์ม Create Contract ฝั่งหน้าเว็บส่งมาแค่หกช่องแรก
            // (ดู LeaseRequest ใน frontend/src/api/types.ts กับ dialogs/LeaseFormDialog.tsx)
            //
            // ไม่ส่งมา = ให้ server คัดลอกอัตราสี่ตัวจาก apartment_config ตอนสร้าง และตั้ง
            // เงินมัดจำเป็น 0 ส่วนที่ส่งมาถือว่าแอดมินตั้งใจแก้รายสัญญา ใช้ค่าที่ส่งมาทับ
            // ตรงกับที่ดีไซน์จอ Create Contract เขียนกำกับไว้ว่า "Rates default from
            // Apartment Config and are locked into this contract once saved"
            //
            // ยังคง @PositiveOrZero ไว้ เพราะส่งมาแล้วติดลบยังต้องเป็น 400 เหมือนเดิม
            // ข้อความเตือนตั้งให้ตรงกับ validateApartmentConfig ฝั่งหน้าเว็บ

            @PositiveOrZero(message = "Security deposit cannot be negative")
            BigDecimal securityDeposit,

            @PositiveOrZero(message = "Electricity rate per unit cannot be negative")
            BigDecimal electricRatePerUnit,

            @PositiveOrZero(message = "Water rate per unit cannot be negative")
            BigDecimal waterRatePerUnit,

            @PositiveOrZero(message = "Common area fee cannot be negative")
            BigDecimal commonAreaFee,

            @PositiveOrZero(message = "Internet fee cannot be negative")
            BigDecimal internetFee) {
    }

    /**
     * body ของ POST /api/leases/{id}/terminate มีช่องเดียวคือวันที่ปิดสัญญา
     * <p>
     * บังคับส่งมา ต่างจาก backend จำลองฝั่งหน้าเว็บที่ถ้าไม่ส่งจะตกไปใช้วันนี้ให้เอง
     * เพราะหน้าเว็บส่งวันที่มาเสมอ (ป็อปอัป Check Out ใน frontend/src/dialogs/RoomDialog.tsx ส่งวันนี้ตามเวลาไทย)
     * คำขอที่ไม่มีช่องนี้จึงแปลว่ามีอะไรผิดพลาด ควรฟ้องกลับไปมากกว่าเดาวันให้เงียบ ๆ
     */
    public record TerminateLeaseRequest(
            @NotNull(message = "Please choose the end date")
            LocalDate endDate) {
    }

    /**
     * เลขห้อง ชั้น และชนิดห้อง มาจากสำเนาในสัญญา (SSK-180) ไม่ใช่ห้องปัจจุบัน ปรับผังตึกหรือเปลี่ยนเลขห้องทีหลัง
     * สัญญาใบนี้ยังโชว์ห้องตามวันที่เซ็น ส่วน roomId ยังชี้ห้องจริงไว้ให้หน้าเว็บกดไปดูห้องได้
     * <p>
     * tenantName ยังเป็นชื่อปัจจุบันของผู้เช่า สำเนาผู้เช่ามีไว้ให้เอกสารสัญญาอย่างเดียว (ดู LeaseTenantSnapshot)
     */
    public record LeaseResponse(
            Long id,
            Long roomId,
            String roomNumber,
            int floor,
            RoomType roomType,
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
            LeaseStatus status,
            /* ค่าใช้จ่ายพิเศษที่คัดลอกจากห้องตอนเซ็น (SSK-165) ไม่มีเป็นรายการว่าง */
            List<LeaseExtraChargeResponse> extraCharges,
            /* ดอกเบี้ยค้างชำระต่อเดือนกับวันผ่อนผันที่คัดลอกจาก Apartment Config ตอนเซ็น (SSK-164) สัญญาก่อน Phase 2 เป็น 0 */
            BigDecimal lateInterestPercentPerMonth,
            int graceDays) {

        public static LeaseResponse of(Lease lease) {
            LeaseCharges charges = lease.getCharges();
            LeaseRoomSnapshot room = lease.getRoomSnapshot();
            LeaseLateTerms lateTerms = lease.getLateTerms();
            return new LeaseResponse(lease.getId(),
                    lease.getRoom().getId(), room.getRoomNumber(), room.getFloor(), room.getRoomType(),
                    lease.getTenant().getId(), lease.getTenant().getFullName(),
                    lease.getStartDate(), lease.getEndDate(), lease.getMonthlyRent(),
                    lease.getBillingCycle(),
                    charges.getSecurityDeposit(), charges.getElectricRatePerUnit(),
                    charges.getWaterRatePerUnit(), charges.getCommonAreaFee(),
                    charges.getInternetFee(),
                    lease.getStatus(),
                    lease.getExtraCharges().stream().map(LeaseExtraChargeResponse::of).toList(),
                    lateTerms.getPercentPerMonth(), lateTerms.getGraceDays());
        }
    }

    /**
     * สำเนาค่าใช้จ่ายพิเศษหนึ่งรายการในสัญญา ตรงกับ LeaseExtraCharge ใน frontend/src/api/types.ts
     * ชื่อ ยอด และช่วงเดือนเป็นค่าตามวันเซ็น ส่วน active เป็นสถานะปัจจุบันของรายการต้นทางในห้อง
     */
    public record LeaseExtraChargeResponse(
            Long chargeId,
            String label,
            BigDecimal amount,
            ChargeRecurrence recurrence,
            /* "YYYY-MM" */
            String startMonth,
            /* "YYYY-MM" หรือ null เมื่อไม่มีเดือนสุดท้าย */
            String endMonth,
            boolean active) {

        static LeaseExtraChargeResponse of(LeaseExtraCharge charge) {
            return new LeaseExtraChargeResponse(charge.getChargeId(), charge.getLabel(), charge.getAmount(),
                    charge.getRecurrence(), Months.format(charge.getStartMonth()),
                    charge.getEndMonth() == null ? null : Months.format(charge.getEndMonth()), charge.isActive());
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
