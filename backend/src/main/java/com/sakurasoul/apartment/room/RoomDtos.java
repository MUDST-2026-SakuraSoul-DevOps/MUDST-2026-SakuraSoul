package com.sakurasoul.apartment.room;

/**
 * รูปร่างของ request ฝั่งห้อง ตกลงกับหน้าเว็บไว้แล้วใน docs/api-contract-lease.md
 * ส่วน response ยังอยู่ที่ {@link RoomSummaryResponse} กับ {@link RoomDetailResponse}
 * ตามเดิม เพราะสองตัวนั้นมี javadoc อธิบายสัญญาของแต่ละฟิลด์อยู่แล้ว
 */
public final class RoomDtos {

    private RoomDtos() {
    }

    /**
     * body ของ PATCH /api/rooms/{id}/status ตาม US-15
     * <p>
     * รับเป็น String ไม่ใช่ {@link RoomStatus} ทั้งที่หน้าตาเหมือนกัน เพราะถ้าผูกเป็น enum
     * ค่าที่ผิดจะถูก Jackson ปัดตกตั้งแต่ตอน bind แล้วได้ข้อความว่า "ช่อง status มีรูปแบบ
     * ไม่ถูกต้อง" ซึ่งไม่ได้บอกว่าตั้งเองได้แค่สองค่าไหน และ OCCUPIED ที่เป็นค่าใน enum จริง
     * จะหลุดผ่านเข้ามาด้วย การรับเป็นสตริงแล้วให้ RoomService ตัดสินทำให้ทั้งค่าที่สะกดผิด
     * ค่าตัวพิมพ์เล็ก null และ OCCUPIED ได้ข้อความไทยประโยคเดียวกันหมด
     */
    public record RoomStatusRequest(String status) {
    }
}
