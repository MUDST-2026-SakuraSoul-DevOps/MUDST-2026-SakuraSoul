package com.sakurasoul.apartment.room;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.math.BigDecimal;

/**
 * ค่าเช่าต่อเดือนของชนิดห้องหนึ่งชนิด หนึ่งแถวต่อหนึ่งค่าใน {@link RoomType} (V12 / SSK-127)
 * <p>
 * ตารางนี้เป็นตัวนิยามว่าชนิดห้องมีอะไรบ้าง ไม่ใช่แค่ที่เก็บราคา FK จาก room.room_type
 * ชี้มาที่ code ตรงนี้ การเพิ่มชนิดใหม่จึงเริ่มจากเพิ่มแถวที่นี่ แล้วเพิ่มค่าใน enum ให้ตรงกัน
 * <p>
 * <b>ไม่มี endpoint ให้แก้ค่าเช่า</b> เพราะ SSK-127 สั่งแค่ให้หน้าเว็บ "แสดงค่าเช่าอ่านอย่างเดียว
 * ตามชนิดห้อง" ไม่ได้ขอให้แอดมินแก้อัตราได้ การทำ CRUD ให้ข้อมูลสองแถวโดยไม่มีใครขอ
 * คือ over-engineer ถ้าวันหนึ่งมี story ที่ขอจริง ค่อยเพิ่มตอนนั้น
 * <p>
 * แก้ค่าในตารางนี้ <b>ไม่กระทบสัญญาที่ทำไปแล้ว</b> เพราะ lease.monthly_rent เก็บค่าที่ตกลงกัน
 * ณ ตอนเซ็นไว้เป็น snapshot (หลักการเดียวกับอัตราค่าน้ำค่าไฟใน US-16-S3)
 */
@Entity
@Table(name = "room_type")
public class RoomTypeRate {

    @Id
    @Enumerated(EnumType.STRING)
    @Column(name = "code", nullable = false, length = 10)
    private RoomType code;

    @Column(name = "monthly_rent", nullable = false, precision = 10, scale = 2)
    private BigDecimal monthlyRent;

    protected RoomTypeRate() {
    }

    /** แถวจริงมาจาก migration V12 constructor นี้มีไว้ให้เทสสร้างอัตราขึ้นมาทดสอบ */
    public RoomTypeRate(RoomType code, BigDecimal monthlyRent) {
        this.code = code;
        this.monthlyRent = monthlyRent;
    }

    public RoomType getCode() {
        return code;
    }

    public BigDecimal getMonthlyRent() {
        return monthlyRent;
    }
}
