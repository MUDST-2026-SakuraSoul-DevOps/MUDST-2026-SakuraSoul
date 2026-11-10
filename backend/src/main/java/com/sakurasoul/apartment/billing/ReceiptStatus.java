package com.sakurasoul.apartment.billing;

/**
 * สถานะการชำระของใบเสร็จ ตรงกับ CHECK constraint receipt_status_ck (V21)
 * <p>
 * มองจากมุมของใบเอง คือค่าใช้จ่ายกับดอกเบี้ยของใบนี้ถูกตัดไปแล้วเท่าไหร่ ไม่สนว่าเงินถูกบันทึกบนบิลใบไหน (SSK-163)
 * สถานะไม่เปลี่ยนเพราะการยกยอดไปบิลใหม่เฉย ๆ เปลี่ยนเมื่อมีเงินถูกตัดหรือถูกยกเลิกเท่านั้น ที่เดียวที่เปลี่ยนคือ
 * Receipt.applySettlement
 * <p>
 * ไม่มีสถานะ "ยกเลิก" เพราะใบเสร็จที่ออกไปแล้วเป็นเอกสารทางบัญชี ถ้าออกผิดต้องออกใบลดหนี้แทนการลบทิ้ง
 * ซึ่งยังไม่อยู่ในเฟสนี้ (ดู docs/api-contract-billing.md)
 */
public enum ReceiptStatus {

    /** ยังไม่ถูกตัดเลย */
    PENDING,

    /** ถูกตัดไปบางส่วน (SSK-163) */
    PARTIAL,

    /** ค่าใช้จ่ายกับดอกเบี้ยของใบนี้ถูกตัดครบแล้ว */
    PAID;

    /** ข้อความ 400 ตามสัญญา API ใช้ร่วมกับทุก endpoint ที่กรองด้วย status */
    static final String FILTER_MESSAGE = "status must be PENDING, PARTIAL or PAID";

    /**
     * ตัวกรอง status ที่ส่งมาทาง query string ว่างคือไม่กรอง
     * <p>
     * รับเป็นข้อความแล้วแปลงเอง ไม่ให้ Spring แปลงเป็น enum ให้ เพราะค่าที่ไม่รู้จักจะได้ข้อความของ framework
     * แทนข้อความในสัญญา ตัวพิมพ์ต้องตรงแบบที่ Spring แปลง enum (ตัดช่องว่างหัวท้าย)
     */
    public static ReceiptStatus parseFilter(String text) {
        if (text == null || text.isBlank()) {
            return null;
        }
        try {
            return valueOf(text.strip());
        } catch (IllegalArgumentException unknown) {
            throw new IllegalArgumentException(FILTER_MESSAGE, unknown);
        }
    }
}
