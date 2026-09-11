package com.sakurasoul.apartment.common;

/**
 * ยืนยันตัวตนไม่ผ่าน ออกมาเป็น 401 ที่ ApiExceptionHandler
 * <p>
 * ต่างจาก {@link NotFoundException} ตรงที่ห้ามบอกว่า "ไม่พบผู้ใช้ชื่อนี้" เด็ดขาด
 * กรอกชื่อผู้ใช้ผิดกับกรอกรหัสผ่านผิดต้องได้ข้อความเดียวกันเป๊ะ ไม่งั้นคนที่ไล่เดา
 * จะรู้ได้ว่าชื่อไหนมีอยู่จริงในระบบ แล้วเหลือแค่เดารหัสผ่านอย่างเดียว
 */
public class UnauthorizedException extends RuntimeException {

    public UnauthorizedException(String message) {
        super(message);
    }
}
