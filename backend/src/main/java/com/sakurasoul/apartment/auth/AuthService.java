package com.sakurasoul.apartment.auth;

import com.sakurasoul.apartment.auth.AuthDtos.LoginRequest;
import com.sakurasoul.apartment.auth.AuthDtos.MeResponse;
import com.sakurasoul.apartment.common.UnauthorizedException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * เข้าสู่ระบบ (US-01) และอ่านว่าตอนนี้ใครล็อกอินอยู่
 * <p>
 * การออกจากระบบ (US-02) ไม่ได้อยู่ที่นี่ ตัว logout filter ของ Spring Security จัดการ
 * ให้ทั้งหมด ดูเหตุผลที่ SecurityConfig
 */
@Service
public class AuthService {

    /** ใช้ข้อความเดียวกันทั้งกรณีไม่มีชื่อผู้ใช้นี้และกรณีรหัสผ่านผิด ห้ามแยก */
    private static final String BAD_CREDENTIALS = "The username or password is incorrect";

    private final AuthenticationManager authenticationManager;
    private final SecurityContextRepository securityContextRepository;
    private final AdminUserRepository adminUserRepository;

    public AuthService(AuthenticationManager authenticationManager,
            SecurityContextRepository securityContextRepository,
            AdminUserRepository adminUserRepository) {
        this.authenticationManager = authenticationManager;
        this.securityContextRepository = securityContextRepository;
        this.adminUserRepository = adminUserRepository;
    }

    /**
     * ตรวจรหัสผ่านแล้วผูก session ให้คำขอถัดไปรู้จักผู้ใช้คนนี้
     * <p>
     * สองบรรทัดที่พลาดกันบ่อยคือ {@code SecurityContextHolder.setContext} อย่างเดียว
     * ไม่พอ ตั้งแต่ Spring Security 6 เป็นต้นมา context ที่อยู่ใน holder จะไม่ถูกเขียน
     * ลง session ให้อัตโนมัติอีกแล้ว (requireExplicitSave เป็นค่าตั้งต้น) ผลคือล็อกอิน
     * แล้วได้ 200 กลับไป แต่คำขอถัดไปยังเป็น 401 เพราะไม่มีอะไรถูกเก็บไว้เลย จึงต้อง
     * เรียก saveContext เองด้วยเสมอ
     * <p>
     * ที่ยังตั้ง holder ด้วยเพราะโค้ดที่ทำงานต่อในคำขอเดียวกันนี้ (เช่น me ข้างล่าง)
     * อ่านจาก holder ไม่ได้อ่านจาก session
     */
    @Transactional(readOnly = true)
    public MeResponse login(LoginRequest request, HttpServletRequest httpRequest,
            HttpServletResponse httpResponse) {
        Authentication authentication;
        try {
            authentication = authenticationManager.authenticate(
                    UsernamePasswordAuthenticationToken.unauthenticated(request.username(), request.password()));
        } catch (BadCredentialsException | UsernameNotFoundException ex) {
            // ปกติ DaoAuthenticationProvider แปลง UsernameNotFoundException เป็น
            // BadCredentialsException ให้อยู่แล้ว แต่ดักไว้ทั้งคู่กันไว้ก่อนเผื่อวันที่
            // มีคนไปปิด hideUserNotFoundExceptions แล้วข้อความหลุดไปบอกว่าชื่อไหนมีจริง
            throw new UnauthorizedException(BAD_CREDENTIALS);
        }

        // เปลี่ยนรหัส session ทิ้งใบเก่าก่อนจะเขียน context ลงไป กัน session fixation
        // เส้นทางนี้เรียก AuthenticationManager เอง ไม่ได้วิ่งผ่าน form login filter ของ
        // Spring Security ตัวที่ทำ session fixation protection ให้อัตโนมัตินั้นอยู่ในฟิลเตอร์
        // นั้น ไม่ใช่ที่นี่ จึงไม่มีใครเปลี่ยนรหัสให้เลยถ้าไม่ทำเอง ถ้าปล่อยไว้ คนที่ยัด
        // JSESSIONID ของตัวเองใส่เบราว์เซอร์เหยื่อไว้ก่อนล็อกอิน (เช่นหลอกให้กดลิงก์ที่แนบ
        // รหัส session มาด้วย) จะถือ session ใบเดิมที่กลายเป็นของแอดมินไปใช้ต่อได้ทันที
        // ต้อง getSession(true) ก่อน เพราะ SessionCreationPolicy.IF_REQUIRED ทำให้คำขอ
        // login ยังไม่มี session และ changeSessionId ต้องมีของจริงให้เปลี่ยน ตัว
        // changeSessionId (Servlet 3.1+) ย้าย attribute เดิมตามไปให้เองโดยไม่ทิ้ง session
        httpRequest.getSession(true);
        httpRequest.changeSessionId();

        SecurityContext context = SecurityContextHolder.createEmptyContext();
        context.setAuthentication(authentication);
        SecurityContextHolder.setContext(context);
        securityContextRepository.saveContext(context, httpRequest, httpResponse);

        return MeResponse.of(loadByUsername(authentication.getName()));
    }

    /**
     * ใครล็อกอินอยู่ตอนนี้ หน้าเว็บเรียกตอนเปิดแอปเพื่อตัดสินว่าจะพาไปหน้า /login
     * หรือเข้าหน้าแดชบอร์ดเลย
     * <p>
     * ไม่ต้องเช็คว่า authentication เป็น null ไหมที่นี่ เพราะ endpoint นี้อยู่หลัง
     * authorizeHttpRequests ที่บังคับ authenticated ไว้แล้ว คนที่ยังไม่ล็อกอินจะโดน
     * entry point ตอบ 401 ไปตั้งแต่ชั้น filter ไม่มีทางเดินมาถึงบรรทัดนี้
     */
    @Transactional(readOnly = true)
    public MeResponse me() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        return MeResponse.of(loadByUsername(authentication.getName()));
    }

    /**
     * session อายุ 8 ชั่วโมง ระหว่างนั้นแอดมินอาจถูกลบออกจากตารางไปแล้ว กรณีนั้น
     * ถือว่า session ใช้ไม่ได้ ตอบ 401 ให้หน้าเว็บพากลับไปหน้า login ไม่ใช่ 404
     * หรือ 500 ซึ่งหน้าเว็บไม่รู้จะทำอะไรต่อ
     */
    private AdminUser loadByUsername(String username) {
        return adminUserRepository.findByUsername(username)
                .orElseThrow(() -> new UnauthorizedException(BAD_CREDENTIALS));
    }
}
