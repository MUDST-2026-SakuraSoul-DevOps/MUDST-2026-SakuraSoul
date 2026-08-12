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
}
