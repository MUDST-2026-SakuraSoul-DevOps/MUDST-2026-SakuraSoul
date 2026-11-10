package com.sakurasoul.apartment.buildingconfig;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;

/**
 * ผังตึก จำนวนชั้นกับจำนวนห้องต่อชั้น (SSK-160) มีแถวเดียวเสมอ แบบเดียวกับ ApartmentConfig
 * <p>
 * ห้องจริงอยู่ที่ตาราง room ตัวนี้เก็บแค่ผังที่แอดมินตั้งไว้ล่าสุด การเพิ่มและลบห้องให้ตรงกับผังทำใน
 * BuildingConfigService ใน transaction เดียวกับที่บันทึกผัง
 * <p>
 * ไม่มี constructor แบบสร้างของใหม่ เพราะแถวเดียวนั้นถูกใส่ไว้ตั้งแต่ migration V16
 */
@Entity
@Table(name = "building_config")
public class BuildingConfig {

    /** ล็อกเป็น 1 เสมอด้วย CHECK constraint ใน V16 */
    @Id
    @Column(name = "id", nullable = false)
    private Short id;

    @Column(name = "floors", nullable = false)
    private short floors;

    @Column(name = "rooms_per_floor", nullable = false)
    private short roomsPerFloor;

    /** รูปแบบเดียวกับ updatedAt ของ apartment_config ดูเหตุผลที่ ApartmentConfig */
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected BuildingConfig() {
    }

    /** ทับผังด้วยค่าใหม่ ผู้เรียกต้องตรวจค่าให้ผ่าน BuildingConfigRules และปรับห้องให้ตรงผังมาก่อน */
    void apply(short floors, short roomsPerFloor, Instant updatedAt) {
        this.floors = floors;
        this.roomsPerFloor = roomsPerFloor;
        this.updatedAt = updatedAt;
    }

    public Short getId() {
        return id;
    }

    public short getFloors() {
        return floors;
    }

    public short getRoomsPerFloor() {
        return roomsPerFloor;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }
}
