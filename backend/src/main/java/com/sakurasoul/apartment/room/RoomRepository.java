package com.sakurasoul.apartment.room;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface RoomRepository extends JpaRepository<Room, Long> {

    List<Room> findAllByOrderByRoomNumberAsc();

    Optional<Room> findByRoomNumber(String roomNumber);

    /**
     * อ่านห้องพร้อมล็อกแถว (SELECT ... FOR UPDATE) ใช้ตอนสร้างหรือแก้สัญญา เพื่อให้คำขอที่แตะห้องเดียวกันเข้าทำงานทีละคำขอ
     * <p>
     * ที่ต้องมีเพราะ constraint lease_no_overlap (V4) เป็น exclusion constraint แบบ gist ถ้าสองคำขอแทรกสัญญา
     * ที่ช่วงวันที่ทับกันพร้อมกัน PostgreSQL อาจตัดสินว่าสองฝั่งรอกันและยกเลิกฝั่งหนึ่งด้วย "deadlock detected"
     * ซึ่งออกมาเป็น 500 ทั้งที่ควรเป็น 409 พอล็อกห้องก่อน คำขอที่สองจะรอจนคำขอแรก commit
     * แล้วตรวจทับซ้อนเจอสัญญาที่เพิ่งเกิด และตอบ 409 ตามปกติ constraint ยังอยู่เป็นด่านสุดท้ายเหมือนเดิม
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select r from Room r where r.id = :id")
    Optional<Room> findByIdForUpdate(@Param("id") Long id);
}
