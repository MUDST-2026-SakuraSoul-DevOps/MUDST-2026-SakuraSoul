package com.sakurasoul.apartment.tenant;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface TenantRepository extends JpaRepository<Tenant, Long> {

    List<Tenant> findAllByOrderByFullNameAsc();

    /**
     * ใช้ทำข้อความ 409 ที่อ่านรู้เรื่องตอนเลขบัตรซ้ำ ไม่ใช่ตัวกันซ้ำจริง
     * ตัวกันจริงคือ constraint tenant_national_id_uk ใน V6 เพราะสองคำขอที่เข้ามา
     * พร้อมกันจะเช็คผ่านทั้งคู่แล้วเขียนลงไปทั้งคู่ เหตุผลเดียวกับ lease_no_overlap
     */
    boolean existsByNationalId(String nationalId);
}
