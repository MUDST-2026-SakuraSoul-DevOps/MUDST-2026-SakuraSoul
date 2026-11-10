package com.sakurasoul.apartment.buildingconfig;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;

public interface BuildingConfigRepository extends JpaRepository<BuildingConfig, Short> {

    /**
     * แถวผังตึกพร้อมล็อก (SELECT ... FOR UPDATE)
     * <p>
     * k8s รัน backend สอง pod (k8s/20-backend.yaml) แอดมินสองคนกดบันทึกผังพร้อมกันได้ ถ้าไม่ล็อก ทั้งสองคำขอ
     * จะเห็นห้องชุดเดียวกันแล้วต่างคนต่างเพิ่มห้อง ชนกันที่ room_number_uk พอล็อกแถวนี้ก่อน คำขอที่สองจะรอจน
     * คำขอแรก commit แล้วเริ่มคำนวณจากห้องชุดใหม่
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select c from BuildingConfig c where c.id = :id")
    Optional<BuildingConfig> findByIdForUpdate(@Param("id") Short id);
}
