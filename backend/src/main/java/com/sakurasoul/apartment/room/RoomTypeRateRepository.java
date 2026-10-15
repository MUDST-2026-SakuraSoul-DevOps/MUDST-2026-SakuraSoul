package com.sakurasoul.apartment.room;

import org.springframework.data.jpa.repository.JpaRepository;

/**
 * อ่านอย่างเดียว ไม่มี endpoint ให้แก้อัตรา ดูเหตุผลที่ {@link RoomTypeRate}
 * <p>
 * เก็บเป็น repository เปล่า ๆ ไม่ใส่ default method ช่วยประกอบแมปไว้ที่นี่ เพราะเทสของ
 * service ต้อง stub ได้ตรงไปตรงมา การ stub default method ทำได้ก็จริงแต่จะกลายเป็นว่า
 * เทสสั่งผลลัพธ์ของ logic ที่ควรถูกเทสเอง การประกอบแมปจึงไปอยู่ที่ RoomService แทน
 */
public interface RoomTypeRateRepository extends JpaRepository<RoomTypeRate, RoomType> {
}
