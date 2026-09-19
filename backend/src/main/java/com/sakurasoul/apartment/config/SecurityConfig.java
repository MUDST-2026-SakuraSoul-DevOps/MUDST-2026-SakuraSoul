package com.sakurasoul.apartment.config;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.config.annotation.authentication.configuration.AuthenticationConfiguration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.logout.HttpStatusReturningLogoutSuccessHandler;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.security.web.servlet.util.matcher.PathPatternRequestMatcher;

import tools.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * ระบบเข้าสู่ระบบของ US-01 และ US-02 (SSK-28)
 * <p>
 * ทีมตกลงกันวันที่ 11 ก.ย. 2569 ว่าใช้ session cookie ไม่ใช่ JWT เหตุผลคือหน้าเว็บกับ
 * API อยู่ origin เดียวกันทั้งตอน dev (vite proxy /api ไป :8080) และตอน deploy จริง
 * (nginx proxy) cookie JSESSIONID จึงเดินทางเองอยู่แล้ว หน้าเว็บไม่ต้องเก็บ token
 * ไว้ที่ไหน ไม่ต้องแนบ header เอง และไม่ต้องเขียนเรื่อง refresh token ซึ่งเป็นส่วนที่
 * พังง่ายที่สุดของฝั่ง JWT ข้อแลกเปลี่ยนคือ backend มี state และสเกลข้ามหลาย pod
 * ต้องมี session store ร่วม ซึ่งยังไม่ใช่ปัญหาของโปรเจกต์ขนาดนี้ ตอนที่เป็นปัญหา
 * ให้ใส่ Spring Session + Redis ไม่ใช่เปลี่ยนไป JWT
 *
 * <h2>ทำไม logout อยู่ที่นี่ ไม่ได้อยู่ใน AuthController</h2>
 * เลือกใช้ logout filter ของ Spring Security เพราะมันทำครบสามอย่างในที่เดียว คือ
 * invalidate session, ล้าง SecurityContext และลบ cookie JSESSIONID ทิ้ง ถ้าเขียนเอง
 * ใน controller ต้องทำสามอย่างนี้ให้ครบมือและมักลืมข้อใดข้อหนึ่ง โดยเฉพาะการลบ
 * cookie ที่ค้างอยู่ในเบราว์เซอร์ อีกข้อคือ filter ทำงานก่อนชั้น authorization
 * คนที่ session หมดอายุไปแล้วกดปุ่มออกจากระบบจึงยังได้ 204 ไม่ใช่ 401 ซึ่งตรงกับ
 * ที่ผู้ใช้คาดหวัง แลกกับการที่ /api/auth/logout จะไม่โผล่ใน AuthController
 * (มีคอมเมนต์บอกไว้ที่นั่นแล้ว)
 */
@Configuration
public class SecurityConfig {

    @Bean
    SecurityFilterChain filterChain(HttpSecurity http, SecurityContextRepository securityContextRepository,
            ObjectMapper objectMapper) throws Exception {
        return http
                // ปิด csrf เพราะเป็น API ที่รับแต่ JSON ไม่มีฟอร์ม HTML ที่ submit ข้ามเว็บได้
                // และ cookie ของ session ตั้ง SameSite=Lax ไว้ เบราว์เซอร์จึงไม่แนบ cookie
                // ไปกับ POST ที่มาจากเว็บอื่นตั้งแต่แรก ถ้าวันหลังมีฟอร์ม HTML จริง ๆ หรือ
                // ต้องเปลี่ยน SameSite เป็น None (เช่นแยก domain ของหน้าเว็บกับ API)
                // ให้กลับมาเปิด csrf พร้อมกับ CookieCsrfTokenRepository ทันที
                .csrf(csrf -> csrf.disable())

                // ใช้ repository ตัวเดียวกับที่ AuthService เรียก saveContext ตอนล็อกอิน
                // ถ้าสองที่ใช้คนละตัว ล็อกอินจะผ่านแต่คำขอถัดไปจะหา context ไม่เจอ
                .securityContext(context -> context.securityContextRepository(securityContextRepository))

                // IF_REQUIRED ไม่ใช่ STATELESS เพราะตัวยืนยันตัวตนคือ session
                // และไม่ใช่ ALWAYS เพราะคำขอที่ยังไม่ล็อกอินไม่ควรกิน session เปล่า ๆ
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.IF_REQUIRED))

                .authorizeHttpRequests(auth -> auth
                        // preflight ของ CORS ไม่มี cookie ติดมาด้วยตามสเปก ถ้าไม่เปิดไว้
                        // เบราว์เซอร์จะได้ 401 ตั้งแต่ preflight แล้วไม่ยิงคำขอจริงเลย
                        .requestMatchers(HttpMethod.OPTIONS, "/**").permitAll()

                        // ประตูทางเข้าต้องเปิด ไม่งั้นไม่มีใครล็อกอินได้
                        .requestMatchers(HttpMethod.POST, "/api/auth/login").permitAll()

                        // probe ของ k8s (k8s/20-backend.yaml) และ healthcheck ของ
                        // docker-compose ยิงมาโดยไม่มี session ถ้าปิดไว้ pod จะไม่มีวัน
                        // ผ่าน readiness แล้ว k8s จะ restart วนไปเรื่อย ๆ
                        .requestMatchers("/actuator/health/**", "/actuator/info").permitAll()

                        .anyRequest().authenticated())

                .exceptionHandling(exception -> exception
                        // ห้าม redirect ไปหน้า login ของ Spring เด็ดขาด ผู้เรียกเป็น fetch
                        // ของหน้าเว็บ ถ้าตอบ 302 ไปหน้า HTML ฝั่งนั้นจะได้ 200 พร้อม HTML
                        // แล้วพยายาม parse เป็น JSON จนพังโดยไม่รู้ว่าที่จริงคือยังไม่ล็อกอิน
                        .authenticationEntryPoint((request, response, authException) ->
                                writeProblem(objectMapper, request, response,
                                        HttpStatus.UNAUTHORIZED, "Please sign in"))
                        // ตอนนี้แอดมินทุกคน role เดียวกัน เคสนี้จึงยังไม่เกิดจริง
                        // แต่ต้องมีไว้ ไม่งั้นวันที่เริ่มแยกสิทธิ์จะได้ HTML หน้า 403 ของ Spring
                        .accessDeniedHandler((request, response, deniedException) ->
                                writeProblem(objectMapper, request, response,
                                        HttpStatus.FORBIDDEN, "You do not have permission to use this area")))

                .logout(logout -> logout
                        // ระบุ matcher เองแทน logoutUrl เพราะเมื่อ csrf ถูกปิด logoutUrl
                        // จะ match ทุก method ไม่ใช่แค่ POST ซึ่งหลวมเกินจำเป็น
                        .logoutRequestMatcher(PathPatternRequestMatcher.withDefaults()
                                .matcher(HttpMethod.POST, "/api/auth/logout"))
                        .invalidateHttpSession(true)
                        .clearAuthentication(true)
                        .deleteCookies("JSESSIONID")
                        // 204 ไม่ใช่ 200 เพราะไม่มีอะไรจะตอบกลับ และไม่ใช่ 302 ซึ่งเป็น
                        // ค่าตั้งต้นของ Spring ที่พา fetch ไปหน้า HTML
                        .logoutSuccessHandler(new HttpStatusReturningLogoutSuccessHandler(HttpStatus.NO_CONTENT)))

                // ปิดทั้งคู่ ทางเข้าเดียวคือ POST /api/auth/login ที่ตอบเป็น JSON
                // ถ้าเปิด formLogin ไว้ คำขอที่ยังไม่ล็อกอินจะถูก redirect ไปหน้า /login
                // ของ Spring แทนที่จะได้ 401 ตามที่สัญญา API เขียนไว้
                .formLogin(form -> form.disable())
                .httpBasic(basic -> basic.disable())
                .build();
    }

    /**
     * เขียน ProblemDetail ตาม RFC 9457 ลง response ตรง ๆ
     * <p>
     * error ที่เกิดในชั้น filter ไม่เคยเดินผ่าน ApiExceptionHandler เพราะยังไปไม่ถึง
     * DispatcherServlet จึงต้องประกอบ JSON เองที่นี่ให้หน้าตาเหมือนกับที่ handler ตัวนั้น
     * ตอบ ไม่งั้นหน้าเว็บจะเจอ error สองรูปแบบแล้วต้องเขียนโค้ดอ่านสองทาง
     * <p>
     * ประกอบเป็น Map เองแทนที่จะโยน ProblemDetail ให้ Jackson เพราะ ObjectMapper
     * ตัวกลางไม่ได้ลง mixin ของ ProblemDetail ไว้เสมอไป ผลที่ได้อาจมีฟิลด์ properties
     * ซ้อนขึ้นมาแทนที่จะแบนอยู่ระดับบนสุด การเขียน Map เองทำให้รูปร่างแน่นอนกว่า
     */
    private static void writeProblem(ObjectMapper objectMapper, HttpServletRequest request,
            HttpServletResponse response, HttpStatus status, String detail) throws IOException {
        response.setStatus(status.value());
        response.setContentType(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());

        Map<String, Object> problem = new LinkedHashMap<>();
        problem.put("type", "about:blank");
        problem.put("title", status.getReasonPhrase());
        problem.put("status", status.value());
        problem.put("detail", detail);
        problem.put("instance", request.getRequestURI());

        objectMapper.writeValue(response.getWriter(), problem);
    }

    /**
     * BCrypt ด้วยค่าตั้งต้น (strength 10) ตั้งใจให้ช้าเพื่อให้การไล่เดารหัสผ่านแพง
     * ถ้าวันหลังอยากขึ้น strength หรือย้ายไป argon2 ให้ใช้
     * DelegatingPasswordEncoder จะได้ตรวจ hash ของเดิมต่อได้ระหว่างเปลี่ยนผ่าน
     */
    @Bean
    PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    /**
     * AuthService ต้องใช้ตัวนี้เรียก authenticate เอง ไม่ได้ผ่านฟอร์มล็อกอินของ Spring
     * ดึงมาจาก AuthenticationConfiguration เพื่อให้ได้ตัวเดียวกับที่ Spring Security
     * ประกอบไว้แล้วจาก AdminUserDetailsService กับ PasswordEncoder ข้างบน
     */
    @Bean
    AuthenticationManager authenticationManager(AuthenticationConfiguration configuration) throws Exception {
        return configuration.getAuthenticationManager();
    }

    /**
     * เก็บ SecurityContext ไว้ใน HttpSession เป็น bean เพื่อให้ทั้ง filter chain และ
     * AuthService ใช้ตัวเดียวกัน (ดูคอมเมนต์ที่ securityContext ข้างบน)
     */
    @Bean
    SecurityContextRepository securityContextRepository() {
        return new HttpSessionSecurityContextRepository();
    }
}
