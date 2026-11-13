package com.sakurasoul.apartment.extracharge;

/**
 * ความถี่ของค่าใช้จ่ายพิเศษ (SSK-165) ชื่อค่าคือสิ่งที่หน้าเว็บส่งและเห็นใน JSON
 * <p>
 * กฎว่าเดือนไหนต้องเก็บอยู่ที่ LeaseExtraCharge.isDueIn เพราะคิดจากสำเนาในสัญญา ไม่ใช่รายการของห้อง
 */
public enum ChargeRecurrence {

    /** เก็บครั้งเดียวในบิลแรกของสัญญาที่ออกตั้งแต่เดือนแรก เช่น ค่าทำกุญแจ */
    ONE_TIME("One-time"),

    /** เก็บทุกเดือนตั้งแต่เดือนแรกถึงเดือนสุดท้าย ไม่มีเดือนสุดท้ายคือเก็บไปเรื่อย ๆ เช่น ค่าที่จอดรถ */
    MONTHLY("Monthly");

    private final String label;

    ChargeRecurrence(String label) {
        this.label = label;
    }

    /** คำในช่อง detail ของบรรทัดใบเสร็จ ตรงกับ RECURRENCE_LABEL ใน frontend/src/domain/extraCharge.ts */
    public String label() {
        return label;
    }
}
