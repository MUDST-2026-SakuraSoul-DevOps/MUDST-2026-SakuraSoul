package com.sakurasoul.apartment.auth;

import jakarta.validation.constraints.NotBlank;

public final class AuthDtos {

    private AuthDtos() {
    }

    /**
     * ข้อความของสองช่องนี้ถูกส่งไปที่ฟิลด์ detail ของ ProblemDetail ตรง ๆ
     * (ApiExceptionHandler เอาข้อความของช่องแรกที่ผิดมาใส่) หน้า Login เอาไปโชว์
     * ใต้ฟอร์มได้เลยโดยไม่ต้องแปลอะไรเพิ่ม
     */
    public record LoginRequest(
            @NotBlank(message = "กรุณากรอกชื่อผู้ใช้")
            String username,

            @NotBlank(message = "กรุณากรอกรหัสผ่าน")
            String password) {
    }

    /**
     * ข้อมูลของคนที่ล็อกอินอยู่ ใช้ทั้งเป็นคำตอบของ POST /api/auth/login และ
     * GET /api/auth/me หน้าเว็บจะได้เขียนโค้ดอ่านคำตอบชุดเดียวใช้ได้ทั้งสองที่
     * <p>
     * ไม่มี token ไม่มี id ของผู้ใช้ในคำตอบโดยตั้งใจ ตัวยืนยันตัวตนคือ cookie ของ
     * session ที่ server ตั้งให้ หน้าเว็บไม่ต้องเก็บอะไรไว้เองและไม่ต้องแนบอะไรกลับมา
     */
    public record MeResponse(String username, String displayName, String email, String phone) {

        public static MeResponse of(AdminUser adminUser) {
            return new MeResponse(adminUser.getUsername(), adminUser.getDisplayName(),
                    adminUser.getEmail(), adminUser.getPhone());
        }
    }
}
