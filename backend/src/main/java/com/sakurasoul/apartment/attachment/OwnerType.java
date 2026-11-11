package com.sakurasoul.apartment.attachment;

/**
 * เจ้าของไฟล์แนบได้สี่ชนิดตามสัญญา API (SSK-161) แต่ละชนิดมีคอลัมน์ของตัวเองในตาราง attachment (V23)
 */
public enum OwnerType {

    LEASE("lease", "lease"),
    MAINTENANCE_TICKET("maintenance ticket", "maintenance_ticket"),
    RECEIPT("receipt", "receipt"),
    PAYMENT("payment", "payment");

    static final String CHOOSE_OWNER = "Choose what this file belongs to";

    private final String label;
    private final String table;

    OwnerType(String label, String table) {
        this.label = label;
        this.table = table;
    }

    /** คำที่ใช้ในข้อความ 404 เช่น "No maintenance ticket with id 41" แบบเดียวกับ MaintenanceService */
    public String label() {
        return label;
    }

    /** ตารางของเจ้าของ ใช้ตรวจว่ามีอยู่จริง ค่าคงที่ในโค้ด ไม่ได้มาจากผู้ใช้ */
    String table() {
        return table;
    }

    /** ตรงตัวพิมพ์ ค่าที่ไม่รู้จักหรือไม่ส่งได้ 400 ตามสัญญา */
    static OwnerType parse(String text) {
        if (text != null) {
            for (OwnerType type : values()) {
                if (type.name().equals(text.strip())) {
                    return type;
                }
            }
        }
        throw new IllegalArgumentException(CHOOSE_OWNER);
    }
}
