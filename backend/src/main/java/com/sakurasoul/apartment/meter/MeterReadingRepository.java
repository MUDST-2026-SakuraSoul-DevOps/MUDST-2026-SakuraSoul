package com.sakurasoul.apartment.meter;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.Collection;
import java.util.List;

/**
 * ลำดับห้องในทุกคิวรีคือลำดับผังตึก (ชั้น แล้วเลขห้องแบบตัวเลข) เหมือน RoomRepository.findAllInLayoutOrder
 * ทุกคิวรีที่เอาไปทำ response ดึงห้องมาด้วยในคิวรีเดียว เพราะ response มีเลขห้อง
 */
public interface MeterReadingRepository extends JpaRepository<MeterReading, Long> {

    /** ทุกเดือน ใหม่ก่อนเก่า เดือนเดียวกันเรียงตามผังตึก */
    @Query("select m from MeterReading m join fetch m.room r"
            + " order by m.readingMonth desc, r.floor asc, length(r.roomNumber) asc, r.roomNumber asc")
    List<MeterReading> findAllNewestFirst();

    /** เดือนเดียว เรียงตามผังตึก month คือวันที่ 1 ของเดือน */
    @Query("select m from MeterReading m join fetch m.room r where m.readingMonth = :month"
            + " order by r.floor asc, length(r.roomNumber) asc, r.roomNumber asc")
    List<MeterReading> findInMonth(@Param("month") LocalDate month);

    /** ค่าที่มีอยู่แล้วของเดือนเหล่านี้ ใช้บอกว่าแถวไหนในไฟล์จะทับหรือถูกข้าม */
    List<MeterReading> findByReadingMonthIn(Collection<LocalDate> months);

    /** ห้องไหนบ้างในชุดนี้ที่มีค่ามิเตอร์ ใช้ผ่าน MeterReadingRoomHistory */
    @Query("select distinct m.room.id from MeterReading m where m.room.id in :roomIds")
    List<Long> findRoomIdsAmong(@Param("roomIds") Collection<Long> roomIds);
}
