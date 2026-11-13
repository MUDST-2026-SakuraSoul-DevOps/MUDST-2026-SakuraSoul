package com.sakurasoul.apartment.billing;

import com.sakurasoul.apartment.billing.ReceiptDtos.ReceiptResponse;

/**
 * ใบหนึ่งใบควรบอกผู้เช่าว่าอะไร (SSK-163, SSK-164) ใช้เลือกแม่แบบของอีเมลและบล็อกสถานะของ PDF ให้ตรงกัน
 * <p>
 * ดูจากยอด ไม่ใช่จาก status เพราะ status เป็นมุมของใบเอง ใบล่าสุดที่ค่าใช้จ่ายของตัวเองถูกตัดครบ (PAID)
 * ยังมียอดยกมาให้จ่ายได้ และใบเก่าที่ยังค้างถูกยกไปบิลใหม่แล้ว ส่งใบนั้นด้วยแม่แบบ "ต้องจ่าย" ผู้เช่าจะจ่ายซ้ำ
 */
enum ReceiptStanding {

    /** ใบล่าสุดของสัญญาที่ยังมียอดต้องจ่าย บอกยอดที่ต้องจ่ายกับวันครบกำหนด */
    DUE,

    /** ใบเก่าที่ยังค้าง ยอดถูกยกไปบิลใหม่แล้ว บอกให้จ่ายตามใบนั้น */
    CARRIED,

    /** ไม่มีอะไรต้องจ่ายตามใบนี้แล้ว เป็นสำเนาที่บอกว่าจ่ายครบ */
    SETTLED;

    static ReceiptStanding of(ReceiptResponse receipt) {
        if (receipt.latest()) {
            return receipt.balanceDue().signum() > 0 ? DUE : SETTLED;
        }
        return receipt.outstandingAmount().signum() > 0 ? CARRIED : SETTLED;
    }
}
