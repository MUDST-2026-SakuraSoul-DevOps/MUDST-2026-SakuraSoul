package com.sakurasoul.apartment.room;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface RoomRepository extends JpaRepository<Room, Long> {

    /**
     * ห้องทั้งหมดเรียงตามผังตึก คือชั้นก่อน แล้วตามเลขห้องแบบตัวเลข (SSK-160)
     * <p>
     * เดิมเรียงด้วย room_number ตรง ๆ ซึ่งเป็นการเรียงแบบข้อความ พอผังเกิน 9 ชั้น ห้อง 1001 ของชั้น 10
     * จะขึ้นก่อน 101 ตรงนี้จึงเรียงตามความยาวก่อนแล้วค่อยตามข้อความ เลขห้องที่เป็นตัวเลขล้วนจะได้ลำดับเดียวกับ
     * การเรียงแบบตัวเลข และไม่พังถ้าวันหนึ่งมีเลขที่ไม่ใช่ตัวเลข (เช่น A101) ซึ่ง CAST เป็นตัวเลขจะพังทั้งคิวรี
     * ลำดับเดียวกับ byFloorThenNumber ใน backend จำลองฝั่งหน้าเว็บ
     */
    @Query("select r from Room r order by r.floor asc, length(r.roomNumber) asc, r.roomNumber asc")
    List<Room> findAllInLayoutOrder();

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

    /**
     * ห้องหลายห้องพร้อมล็อกแถว ใช้ตอนปรับผังตึกก่อนตรวจว่าห้องที่จะลบมีประวัติไหม (SSK-160)
     * <p>
     * ล็อกตัวเดียวกับที่ findByIdForUpdate ใช้ตอนสร้างสัญญา สองงานนี้จึงไม่ซ้อนกัน ถ้าสร้างสัญญา commit ก่อน
     * การปรับผังจะเห็นสัญญาใบนั้นแล้วตอบ 409 ถ้าปรับผังได้ล็อกก่อน คำขอสร้างสัญญาจะรอแล้วเจอว่าห้องหายไปแล้ว (404)
     * เรียงตาม id เพื่อให้ทุกคำขอล็อกตามลำดับเดียวกัน ไม่รอกันเป็นวง
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select r from Room r where r.id in :ids order by r.id asc")
    List<Room> findAllByIdInForUpdate(@Param("ids") Collection<Long> ids);
}
