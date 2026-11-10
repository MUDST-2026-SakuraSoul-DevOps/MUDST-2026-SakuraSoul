package com.sakurasoul.apartment.lease;

/**
 * เวอร์ชันแม่แบบเอกสารสัญญา (SSK-180)
 * <p>
 * สัญญาแต่ละใบจำไว้ว่าเซ็นด้วยแม่แบบเวอร์ชันไหน (lease.contract_template_version) แล้วพิมพ์ด้วยแม่แบบนั้นเสมอ
 * ถ้าวันหลังต้องแก้ถ้อยคำสัญญา อย่าแก้ไฟล์เดิม ให้คัดลอก templates/pdf/lease-contract-v1.html เป็น
 * lease-contract-v2.html แก้ที่ไฟล์ใหม่ แล้วขยับ CURRENT_VERSION เป็น 2 สัญญาที่ทำหลังจากนั้นจะได้แม่แบบใหม่
 * ส่วนสัญญาเก่ายังพิมพ์ด้วย v1 เหมือนวันที่เซ็น
 */
final class ContractTemplate {

    /** เวอร์ชันที่สัญญาใหม่ได้ ตอนนี้มีฉบับเดียว */
    static final short CURRENT_VERSION = 1;

    private ContractTemplate() {
    }

    /** ชื่อแม่แบบที่ PdfRenderer ใช้ของเวอร์ชันนั้น */
    static String name(short version) {
        return "pdf/lease-contract-v" + version;
    }
}
