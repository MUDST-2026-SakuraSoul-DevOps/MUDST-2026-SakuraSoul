package com.sakurasoul.apartment.auth;

import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * บอก Spring Security ว่าจะไปหาผู้ใช้จากที่ไหน
 * <p>
 * พอมี bean ตัวนี้กับ PasswordEncoder อยู่ใน context แล้ว Spring Boot จะเลิกสร้าง
 * ผู้ใช้ชั่วคราวที่สุ่มรหัสผ่านมาพิมพ์ใน log ให้เอง (UserDetailsServiceAutoConfiguration
 * ถอยให้) ซึ่งเป็นสิ่งที่เราต้องการ ผู้ใช้ทั้งหมดต้องมาจากตาราง admin_user ที่เดียว
 * <p>
 * ทุกคนได้ role ADMIN เหมือนกันหมด ระบบนี้เป็นเครื่องมือฝั่งแอดมินล้วน ไม่มีผู้เช่า
 * มาล็อกอิน จึงยังไม่ต้องมีชั้น role จริง ๆ แต่ใส่ไว้ตั้งแต่ตอนนี้เพื่อให้วันที่ต้องแยก
 * สิทธิ์ (เช่น เจ้าของหอ กับ แม่บ้าน) เพิ่มค่าในคอลัมน์แล้วแก้ที่นี่ที่เดียว
 */
@Service
public class AdminUserDetailsService implements UserDetailsService {

    private final AdminUserRepository adminUserRepository;

    public AdminUserDetailsService(AdminUserRepository adminUserRepository) {
        this.adminUserRepository = adminUserRepository;
    }

    @Override
    @Transactional(readOnly = true)
    public UserDetails loadUserByUsername(String username) throws UsernameNotFoundException {
        AdminUser adminUser = adminUserRepository.findByUsername(username)
                // ข้อความนี้ไปไม่ถึงผู้ใช้ AuthService แปลงเป็นข้อความกลาง ๆ ก่อนตอบกลับ
                // เพื่อไม่ให้คนเดา username ทีละตัวแล้วรู้ว่ามีบัญชีไหนอยู่จริงบ้าง
                .orElseThrow(() -> new UsernameNotFoundException("ไม่พบผู้ใช้ " + username));

        return User.withUsername(adminUser.getUsername())
                .password(adminUser.getPasswordHash())
                .roles("ADMIN")
                .build();
    }
}
