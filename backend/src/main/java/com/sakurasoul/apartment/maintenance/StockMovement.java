package com.sakurasoul.apartment.maintenance;

import java.time.Instant;

/**
 * หนึ่งบรรทัดในป็อปอัป Stock history ของหน้าคลังอุปกรณ์ (SSK-171) เป็นทั้งผลของ StockLedger และ JSON ที่ตอบหน้าเว็บ
 * รูปร่างตรงกับ StockMovement ใน frontend/src/api/types.ts
 *
 * @param quantity     บวกคือของเข้า ลบคือของออก ยกเว้น OPENING ที่เป็นยอดตั้งต้น
 * @param balanceAfter ยอดคงเหลือหลังบรรทัดนี้
 * @param note         การเบิกบอกใบแจ้งซ่อม เช่น "Maintenance ticket #12" แบบอื่นเป็น null
 */
public record StockMovement(Instant at, Kind kind, int quantity, int balanceAfter, String note) {

    /** ลำดับของค่าในนี้คือลำดับที่ใช้เรียงรายการที่เกิดเวลาเดียวกัน (StockLedger) */
    public enum Kind {

        /** ยอดก่อนรายการแรกที่มีบันทึก ย้อนคำนวณจากยอดปัจจุบัน ไม่ได้อ่านจากตารางไหน */
        OPENING,

        /** เติมของ (supply_restock) */
        RESTOCK,

        /** เบิกไปใช้ในใบแจ้งซ่อม (maintenance_supply_usage) */
        USAGE,

        /** ตั้งยอดใหม่จากฟอร์มแก้ไข (supply_adjustment) */
        ADJUSTMENT
    }
}
