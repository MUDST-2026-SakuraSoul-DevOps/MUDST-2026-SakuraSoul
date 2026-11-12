package com.sakurasoul.apartment.apartmentconfig;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;

public interface ApartmentConfigRepository extends JpaRepository<ApartmentConfig, Short> {

    /**
     * อ่านแถวเดียวของตารางพร้อมล็อก (SELECT ... FOR UPDATE) ใช้กับทั้งสอง PUT ของค่าตั้ง
     * <p>
     * Hibernate เขียนทุกคอลัมน์ของแถวตอน UPDATE ถ้าแอดมินบันทึกอัตราน้ำไฟพร้อมกับอีกคนตั้งดอกเบี้ย (SSK-164)
     * สองคำขอจะอ่านแถวเดิมแล้วต่างคนต่างเขียนทั้งแถวกลับ ค่าที่อีกฝั่งเพิ่งตั้งหายเงียบ ๆ
     * พอล็อกก่อน คำขอที่สองจะรอจนคำขอแรก commit แล้วเริ่มจากค่าล่าสุด แบบเดียวกับ BuildingConfigRepository
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select c from ApartmentConfig c where c.id = :id")
    Optional<ApartmentConfig> findByIdForUpdate(@Param("id") Short id);
}
