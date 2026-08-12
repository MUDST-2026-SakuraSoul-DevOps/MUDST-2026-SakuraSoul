package com.sakurasoul.apartment.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;

/**
 * ยังไม่มีระบบ login ตามที่ทีมตกลงกันไว้ ทุก endpoint จึงเปิดหมด
 * <p>
 * ที่ใส่ Spring Security ไว้ตั้งแต่ต้นเพราะตอนเปิดใช้จริงจะได้แก้ที่ไฟล์นี้ไฟล์เดียว
 * ไม่ต้องไปรื้อ dependency กับ config ทั้งโปรเจกต์ทีหลัง
 * <p>
 * ห้ามเอาขึ้น environment ที่คนนอกเข้าถึงได้ในสภาพนี้
 */
@Configuration
public class SecurityConfig {

    @Bean
    SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        return http
                // ปิด csrf เพราะยังเป็น API ล้วนที่ไม่มี session ตอนทำ login ให้เปิดกลับ
                .csrf(csrf -> csrf.disable())
                .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth.anyRequest().permitAll())
                .build();
    }
}
