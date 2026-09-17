package com.sakurasoul.apartment.room;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.math.BigDecimal;

@Entity
@Table(name = "room")
public class Room {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "room_number", nullable = false, length = 10)
    private String roomNumber;

    @Column(name = "floor", nullable = false)
    private short floor;

    @Column(name = "base_rent", nullable = false, precision = 10, scale = 2)
    private BigDecimal baseRent;

    @Column(name = "note", length = 500)
    private String note;

    /**
     * ห้องถูกล็อกไว้ว่าซ่อมบำรุงอยู่หรือเปล่า (US-15)
     * <p>
     * เก็บเป็นธงแยกจากสถานะห้อง ไม่ได้เก็บ status ตรง ๆ เพราะห้องที่มีผู้เช่าอยู่ก็ล็อกได้
     * พอปลดล็อกต้องกลับไปเป็น OCCUPIED เอง เหตุผลเต็มอยู่ใน V5__room_under_maintenance.sql
     */
    @Column(name = "under_maintenance", nullable = false)
    private boolean underMaintenance;

    protected Room() {
    }

    /**
     * ห้องจริงถูกใส่เข้ามาจาก migration V2 ไม่ได้สร้างผ่านโค้ด
     * constructor นี้มีไว้ให้เทสสร้างห้องขึ้นมาทดสอบได้โดยไม่ต้องยก database
     */
    public Room(String roomNumber, short floor, BigDecimal baseRent) {
        this.roomNumber = roomNumber;
        this.floor = floor;
        this.baseRent = baseRent;
    }

    public Long getId() {
        return id;
    }

    public String getRoomNumber() {
        return roomNumber;
    }

    public short getFloor() {
        return floor;
    }

    public BigDecimal getBaseRent() {
        return baseRent;
    }

    public String getNote() {
        return note;
    }

    public void setNote(String note) {
        this.note = note;
    }

    public boolean isUnderMaintenance() {
        return underMaintenance;
    }

    /**
     * ปิดห้องเพื่อซ่อมบำรุง ไม่ยุ่งกับสัญญาเช่าของห้องนี้เลย
     * ตั้งชื่อตามสิ่งที่แอดมินกดจริงแทนที่จะเปิด setter ธรรมดา คนอ่านโค้ดจะได้เห็นว่า
     * ธงนี้มีไว้ทำอะไร และไม่มีทางถูกเซ็ตด้วยเหตุผลอื่นที่ไม่ใช่ US-15
     */
    public void lockForMaintenance() {
        this.underMaintenance = true;
    }

    /** ซ่อมเสร็จแล้ว ปลดธงอย่างเดียว สถานะที่เห็นจะกลับไปเป็นค่าที่คำนวณจากสัญญาเอง */
    public void releaseFromMaintenance() {
        this.underMaintenance = false;
    }
}
