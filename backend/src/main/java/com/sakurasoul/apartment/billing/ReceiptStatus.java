package com.sakurasoul.apartment.billing;

/**
 * สถานะการชำระเงินของใบเสร็จ ตรงกับ CHECK constraint receipt_status_ck ใน V9
 * และตรงกับป้ายสองแบบที่หน้า Payment Management โชว์อยู่แล้ว คือ Paid กับ Pending
 * (frontend/src/pages/PaymentsPage.tsx)
 * <p>
 * ไม่มีสถานะ "ยกเลิก" เพราะใบเสร็จที่ออกไปแล้วเป็นเอกสารทางบัญชี ถ้าออกผิดต้องออกใบ
 * ลดหนี้แทนการลบทิ้ง ซึ่งยังไม่ได้ตกลงกันว่าจะทำในเฟสนี้ไหม (ดู docs/api-contract-billing.md)
 */
public enum ReceiptStatus {

    PENDING,
    PAID
}
