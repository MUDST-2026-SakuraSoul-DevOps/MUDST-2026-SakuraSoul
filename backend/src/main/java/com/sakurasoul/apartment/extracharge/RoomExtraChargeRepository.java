package com.sakurasoul.apartment.extracharge;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;
import java.util.Optional;

public interface RoomExtraChargeRepository extends JpaRepository<RoomExtraCharge, Long> {

    /** รายการของห้องเดียวตามลำดับที่เพิ่ม ใช้ทั้งแท็บของห้องและตอนคัดลอกลงสัญญาใหม่ (LeaseService.create) */
    List<RoomExtraCharge> findByRoomIdOrderByIdAsc(Long roomId);

    /** หาเฉพาะในห้องที่ระบุ id ของรายการห้องอื่นที่ส่งมาผิดห้องจึงได้ 404 ไม่ใช่ไปแก้ของห้องอื่น */
    Optional<RoomExtraCharge> findByIdAndRoomId(Long id, Long roomId);

    /** ทุกห้องเรียงตามผังตึกแบบเดียวกับ RoomRepository.findAllInLayoutOrder แล้วตามลำดับที่เพิ่ม */
    @Query("select c from RoomExtraCharge c join fetch c.room r"
            + " order by r.floor asc, length(r.roomNumber) asc, r.roomNumber asc, c.id asc")
    List<RoomExtraCharge> findAllInLayoutOrder();
}
