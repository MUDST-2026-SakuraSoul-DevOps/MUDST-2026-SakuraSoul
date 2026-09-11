package com.sakurasoul.apartment.auth;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

/**
 * ค้นด้วย username เท่านั้น ไม่มีเมธอดที่ค้นด้วย password_hash โดยตั้งใจ
 * การเทียบรหัสผ่านเป็นหน้าที่ของ PasswordEncoder ไม่ใช่ของ query
 */
public interface AdminUserRepository extends JpaRepository<AdminUser, Long> {

    Optional<AdminUser> findByUsername(String username);
}
