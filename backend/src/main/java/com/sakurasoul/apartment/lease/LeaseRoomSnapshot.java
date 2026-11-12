package com.sakurasoul.apartment.lease;

import com.sakurasoul.apartment.room.Room;
import com.sakurasoul.apartment.room.RoomType;
import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;

/**
 * เลขห้อง ชั้น และชนิดห้อง ณ วันทำสัญญา (SSK-180 ทำพร้อม SSK-160)
 * <p>
 * ตั้งแต่ผังตึกตั้งค่าได้ ห้องเดิมอาจถูกลบ ถูกเปลี่ยนเลข หรือเปลี่ยนชนิดทีหลังได้ เอกสารสัญญาที่เซ็นไปแล้ว
 * ต้องพิมพ์ออกมาเหมือนเดิมทุกตัวอักษร จึงคัดลอกค่าพวกนี้มาเก็บไว้กับสัญญา ไม่อ่านจากตาราง room
 * หลักเดียวกับ LeaseCharges ที่ล็อกอัตราค่าน้ำค่าไฟไว้ตั้งแต่วันเซ็น
 * <p>
 * สร้างได้ทางเดียวคือ of() ตอนสร้างสัญญา ไม่มี setter เพราะสำเนาไม่ควรถูกถ่ายใหม่ทีหลัง
 * (การแก้สัญญาย้ายห้องไม่ได้อยู่แล้ว ดู LeaseService.update)
 */
@Embeddable
public class LeaseRoomSnapshot {

    @Column(name = "room_number_snapshot", nullable = false, length = 10)
    private String roomNumber;

    @Column(name = "room_floor_snapshot", nullable = false)
    private short floor;

    @Enumerated(EnumType.STRING)
    @Column(name = "room_type_snapshot", nullable = false, length = 10)
    private RoomType roomType;

    protected LeaseRoomSnapshot() {
    }

    private LeaseRoomSnapshot(String roomNumber, short floor, RoomType roomType) {
        this.roomNumber = roomNumber;
        this.floor = floor;
        this.roomType = roomType;
    }

    /** ถ่ายสำเนาห้อง ณ ตอนนี้ */
    public static LeaseRoomSnapshot of(Room room) {
        return new LeaseRoomSnapshot(room.getRoomNumber(), room.getFloor(), room.getRoomType());
    }

    public String getRoomNumber() {
        return roomNumber;
    }

    public short getFloor() {
        return floor;
    }

    public RoomType getRoomType() {
        return roomType;
    }
}
