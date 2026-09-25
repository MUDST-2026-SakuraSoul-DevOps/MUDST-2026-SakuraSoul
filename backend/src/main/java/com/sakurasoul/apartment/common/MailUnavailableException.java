package com.sakurasoul.apartment.common;

/**
 * เมลเซิร์ฟเวอร์ติดต่อไม่ได้ และยังไม่มีอีเมลฉบับไหนในคำขอนี้ออกไป (SSK-143)
 * <p>
 * ข้อความเขียนไว้ให้ผู้ใช้อ่าน ห้ามใส่ชื่อ host หรือ port ของเมลเซิร์ฟเวอร์ลงไป เพราะ detail ของ
 * ProblemDetail ถูกส่งถึงหน้าเว็บตรง ๆ สาเหตุจริงอยู่ใน cause ซึ่งลง log ฝั่ง server เท่านั้น
 */
public class MailUnavailableException extends RuntimeException {

    public MailUnavailableException(Throwable cause) {
        super("The mail server is not reachable. Please try again later", cause);
    }
}
