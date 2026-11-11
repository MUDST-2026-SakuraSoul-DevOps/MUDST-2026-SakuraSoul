package com.sakurasoul.apartment.attachment;

/**
 * เจ้าของไฟล์หนึ่งราย ชนิดกับ id
 * <p>
 * ownerId รับเป็นข้อความแล้วแปลงเอง ไม่ให้ Spring แปลงเป็นตัวเลข เพราะค่าที่แปลงไม่ได้จะได้ข้อความของ framework
 * แทนข้อความในสัญญา ค่าที่ไม่ใช่จำนวนเต็มบวกได้ข้อความเดียวกับไม่ส่ง
 */
public record OwnerRef(OwnerType type, long id) {

    static OwnerRef parse(String ownerType, String ownerId) {
        OwnerType type = OwnerType.parse(ownerType);
        return new OwnerRef(type, positiveId(ownerId, OwnerType.CHOOSE_OWNER));
    }

    /** จำนวนเต็มบวก ไม่งั้นโยน IllegalArgumentException พร้อมข้อความที่ให้มา */
    public static long positiveId(String text, String message) {
        if (text == null || !text.strip().matches("[0-9]{1,18}")) {
            throw new IllegalArgumentException(message);
        }
        long id = Long.parseLong(text.strip());
        if (id <= 0) {
            throw new IllegalArgumentException(message);
        }
        return id;
    }
}
