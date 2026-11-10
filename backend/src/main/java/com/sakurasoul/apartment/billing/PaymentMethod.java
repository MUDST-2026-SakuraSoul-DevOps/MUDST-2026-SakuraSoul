package com.sakurasoul.apartment.billing;

/**
 * ช่องทางการรับชำระ (SSK-163) ชื่อค่าคือสิ่งที่ API รับและตอบ ตรงกับ payment_method_ck ใน V21
 * <p>
 * label คือข้อความอ่านได้ที่ไปอยู่ใน paymentMethod ของใบเสร็จที่ถูกตัดครบ อีเมล "Paid on … (Cash)" กับ PDF อ่านช่องนั้น
 * หน้าเว็บเดิมใช้ 'Cash', 'Bank transfer', 'PromptPay' ต้องแปลงเป็น CASH, TRANSFER, QR ตอนส่ง
 */
public enum PaymentMethod {

    CASH("Cash"),
    TRANSFER("Bank transfer"),
    QR("PromptPay QR"),
    /** รวมการชำระผ่าน POST /api/receipts/{id}/pay แบบเดิมที่ส่งช่องทางมาเป็นข้อความอิสระ */
    OTHER("Other");

    private final String label;

    PaymentMethod(String label) {
        this.label = label;
    }

    public String label() {
        return label;
    }
}
