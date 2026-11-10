package com.sakurasoul.apartment.roomrate;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.time.YearMonth;
import java.util.List;
import java.util.Optional;

public interface RoomRateRepository extends JpaRepository<RoomRate, Long> {

    /** ประวัติอัตราของห้องหนึ่ง ใหม่ก่อนเก่า แบบที่ตาราง Rate history แสดง */
    List<RoomRate> findByRoomIdOrderByEffectiveFromDesc(Long roomId);

    /** อัตราของทุกห้อง เก่าก่อนใหม่ เดือนเดียวกันเรียงตามห้อง ใช้ทำการ์ด Next rate change */
    List<RoomRate> findAllByOrderByEffectiveFromAscRoomIdAsc();

    List<RoomRate> findByEffectiveFromGreaterThanEqualOrderByEffectiveFromAscRoomIdAsc(LocalDate from);

    boolean existsByRoomIdAndEffectiveFrom(Long roomId, LocalDate effectiveFrom);

    Optional<RoomRate> findFirstByRoomIdAndEffectiveFromLessThanEqualOrderByEffectiveFromDesc(Long roomId,
            LocalDate month);

    /**
     * อัตราที่มีผลกับห้องนี้ในเดือนนั้น คือแถวล่าสุดที่เริ่มไม่เกินเดือนนั้น ว่างถ้าห้องยังใช้ค่าตั้งต้น
     * <p>
     * กฎ "อัตรา ณ เดือนหนึ่ง" มีสองคิวรีในไฟล์นี้ คือเมธอดนี้สำหรับห้องเดียว กับ {@link #findAllInEffect} สำหรับทั้งตึก
     * ถ้าแก้กฎต้องแก้ทั้งคู่ RoomRateApiTest คุมทั้งสองทาง (rateInEffect ใน frontend/src/domain/roomRate.ts ใช้กฎเดียวกัน)
     */
    default Optional<RoomRate> inEffect(Long roomId, YearMonth month) {
        return findFirstByRoomIdAndEffectiveFromLessThanEqualOrderByEffectiveFromDesc(roomId, month.atDay(1));
    }

    /**
     * อัตราที่มีผลในเดือนนั้นของทุกห้องที่มีอัตราเฉพาะ คิวรีเดียวทั้งตึก ใช้ทำ baseRent ของรายการห้อง
     * ไม่งั้นต้องถาม inEffect ทีละห้อง
     */
    @Query("""
            select rate from RoomRate rate
            where rate.effectiveFrom = (select max(newer.effectiveFrom) from RoomRate newer
                                        where newer.room = rate.room and newer.effectiveFrom <= :month)
            """)
    List<RoomRate> findAllInEffect(@Param("month") LocalDate month);
}
