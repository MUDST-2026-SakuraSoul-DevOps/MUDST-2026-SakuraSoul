package com.sakurasoul.apartment.auth;

import com.sakurasoul.apartment.auth.AuthDtos.LoginRequest;
import com.sakurasoul.apartment.auth.AuthDtos.MeResponse;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * US-01 เข้าสู่ระบบ และ US-02 ออกจากระบบ
 * <p>
 * ที่นี่มีแค่สอง endpoint ไม่ใช่สาม เพราะ POST /api/auth/logout ไม่ได้อยู่ในคลาสนี้
 * แต่เป็น logout filter ของ Spring Security ที่ตั้งไว้ใน SecurityConfig ดูเหตุผลที่นั่น
 * ผู้เรียกเห็นเหมือนกันทุกอย่าง คือ POST ไปที่ /api/auth/logout แล้วได้ 204
 */
@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final AuthService authService;

    public AuthController(AuthService authService) {
        this.authService = authService;
    }

    /**
     * รับ request กับ response ของ servlet เข้ามาด้วยเพราะการล็อกอินต้องเขียน
     * SecurityContext ลง session ผ่าน SecurityContextRepository ซึ่งต้องใช้ทั้งคู่
     */
    @PostMapping("/login")
    public MeResponse login(@Valid @RequestBody LoginRequest request,
            HttpServletRequest httpRequest, HttpServletResponse httpResponse) {
        return authService.login(request, httpRequest, httpResponse);
    }

    @GetMapping("/me")
    public MeResponse me() {
        return authService.me();
    }
}
