package com.sakurasoul.apartment.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.annotation.Order;
import org.springframework.security.authentication.dao.DaoAuthenticationProvider;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.provisioning.InMemoryUserDetailsManager;
import org.springframework.security.web.SecurityFilterChain;

/**
 * ประตูของ /actuator/prometheus (SSK-182)
 * <p>
 * Prometheus ดึง metric จาก endpoint นี้ทุก 15 วินาที ในเครือข่ายภายใน โดยไม่มี session ของแอดมิน
 * ส่วน SecurityConfig ตัวหลักให้ทุกอย่างนอกจาก login กับ health ต้องมี session ซึ่ง Prometheus ไม่มี
 * จึงแยก filter chain ของ path นี้ออกมาต่างหาก ใช้ HTTP Basic ของผู้ใช้ {@code metrics} คนเดียว
 * <p>
 * ทำไมไม่เปิด endpoint นี้ให้ทุกคน: metric บอกโครงสร้างภายในของระบบ (ชื่อ endpoint, ปริมาณงาน, รุ่น JVM)
 * ซึ่งไม่ควรหลุดออกสู่ผู้ใช้ ปลอดภัยสามชั้นด้วยกัน
 * <ol>
 *   <li>nginx ของ frontend ไม่ส่ง /actuator/prometheus ต่อไป backend (คืน 404) ดู frontend/nginx.conf</li>
 *   <li>ต้องใช้ HTTP Basic ของผู้ใช้ metrics ผู้ใช้ปกติที่ล็อกอินด้วย session เข้าไม่ได้ (ต่างบทบาท)</li>
 *   <li>ไม่ตั้ง APP_METRICS_PASSWORD = ไม่มีผู้ใช้เลย ไม่มีใครเข้าได้ ไม่มีรหัสเดา ๆ ติดมากับโค้ด</li>
 * </ol>
 * <p>
 * @Order(1) ให้ chain นี้ถูกตรวจก่อน chain หลักที่ครอบทุก path
 */
@Configuration
public class MetricsSecurityConfig {

    private static final Logger log = LoggerFactory.getLogger(MetricsSecurityConfig.class);

    static final String METRICS_ROLE = "METRICS";
    static final String METRICS_USERNAME = "metrics";

    @Bean
    @Order(1)
    SecurityFilterChain metricsFilterChain(HttpSecurity http, PasswordEncoder passwordEncoder,
            @Value("${app.metrics.password:}") String metricsPassword) throws Exception {
        InMemoryUserDetailsManager users = new InMemoryUserDetailsManager();
        if (metricsPassword.isBlank()) {
            // ไม่ใส่ผู้ใช้เลย ทุกคำขอจะได้ 401 ไม่ใช่ปล่อยผ่าน เตือนไว้ให้คนดูแลรู้ว่าทำไม Prometheus ถึงดึงไม่ได้
            log.warn("APP_METRICS_PASSWORD ไม่ได้ตั้ง /actuator/prometheus จะเข้าไม่ได้ ตั้งค่านี้ถ้าต้องการให้ Prometheus ดึง metric");
        } else {
            UserDetails metricsUser = User.withUsername(METRICS_USERNAME)
                    .password(passwordEncoder.encode(metricsPassword))
                    .roles(METRICS_ROLE)
                    .build();
            users.createUser(metricsUser);
        }

        DaoAuthenticationProvider provider = new DaoAuthenticationProvider(users);
        provider.setPasswordEncoder(passwordEncoder);

        return http
                .securityMatcher("/actuator/prometheus")
                // เป็น GET อย่างเดียวและไม่มี cookie เกี่ยวข้อง ไม่ต้องมี csrf และไม่ต้องสร้าง session ให้ Prometheus
                .csrf(csrf -> csrf.disable())
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                // ระบุ provider ของ chain นี้เอง จะได้ไม่ไปใช้ AdminUserDetailsService ของแอดมิน
                // และกำหนด encoder ชัด ๆ ไม่ปล่อยให้เดาว่า hash ของผู้ใช้นี้ใช้รูปแบบไหน
                .authenticationProvider(provider)
                .authorizeHttpRequests(auth -> auth.anyRequest().hasRole(METRICS_ROLE))
                .httpBasic(Customizer.withDefaults())
                .build();
    }
}
