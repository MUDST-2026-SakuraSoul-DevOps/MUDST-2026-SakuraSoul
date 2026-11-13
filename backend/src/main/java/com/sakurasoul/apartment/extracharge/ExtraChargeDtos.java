package com.sakurasoul.apartment.extracharge;

import com.sakurasoul.apartment.common.Months;

import java.math.BigDecimal;

/** รูปร่าง JSON ของค่าใช้จ่ายพิเศษ ตรงกับ RoomExtraCharge / RoomExtraChargeRequest ใน frontend/src/api/types.ts */
public final class ExtraChargeDtos {

    private ExtraChargeDtos() {
    }

    /**
     * body ของ POST และ PUT /api/rooms/{id}/extra-charges
     * <p>
     * ทุกช่องเป็นชนิดที่ว่างได้และไม่ติด bean validation เพราะ ExtraChargeRules เป็นคนตอบข้อความ 400 ทั้งหมด
     * recurrence เป็นสตริงด้วยเหตุผลเดียวกัน ถ้าเป็น enum ค่าที่ไม่รู้จักจะได้ข้อความของ Jackson แทนข้อความที่ตกลงไว้
     * <p>
     * active ไม่ส่งมา: ตอนเพิ่มถือเป็น true ตอนแก้คงสถานะเดิม ไม่งั้นการแก้ชื่อรายการที่ปิดไว้จะเปิดให้กลับมาเก็บเงินเอง
     */
    public record ExtraChargeRequest(
            String label,
            BigDecimal amount,
            String recurrence,
            String startMonth,
            String endMonth,
            Boolean active) {
    }

    public record ExtraChargeResponse(
            Long id,
            Long roomId,
            String label,
            BigDecimal amount,
            ChargeRecurrence recurrence,
            /** "YYYY-MM" */
            String startMonth,
            /** "YYYY-MM" หรือ null เมื่อไม่มีเดือนสุดท้าย */
            String endMonth,
            boolean active) {

        static ExtraChargeResponse of(RoomExtraCharge charge) {
            return new ExtraChargeResponse(charge.getId(), charge.getRoom().getId(), charge.getLabel(),
                    charge.getAmount(), charge.getRecurrence(), Months.format(charge.getStartMonth()),
                    charge.getEndMonth() == null ? null : Months.format(charge.getEndMonth()), charge.isActive());
        }
    }
}
