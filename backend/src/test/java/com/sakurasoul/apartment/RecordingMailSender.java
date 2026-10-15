package com.sakurasoul.apartment;

import jakarta.mail.MessagingException;
import jakarta.mail.internet.MimeMessage;
import org.springframework.mail.MailPreparationException;
import org.springframework.mail.MailSendException;
import org.springframework.mail.javamail.JavaMailSenderImpl;

import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;

/**
 * ตัวส่งอีเมลปลอมของเทส (SSK-143) เก็บอีเมลที่ถูกส่งไว้ให้เทสเปิดดู แทนที่จะต่อ SMTP จริง
 * <p>
 * สืบทอด JavaMailSenderImpl ตัวจริงแล้วแทนที่แค่ขั้นส่งสุดท้าย (doSend) การประกอบอีเมลทั้งหมด
 * (MimeMessageHelper, charset, ไฟล์แนบ) จึงเดินผ่านโค้ดจริงของ Spring ครบ ต่างจาก mock ที่จับได้แค่ว่า
 * "มีการเรียก send" แต่ไม่รู้ว่าอีเมลที่ประกอบออกมาหน้าตาเป็นอย่างไร
 * <p>
 * สั่งให้เมลเซิร์ฟเวอร์ "ล่ม" ได้ด้วย {@link #failAfter(int)} เพื่อเทสเส้นทาง 503 กับ SEND_FAILED
 * ทุกเทสที่ใช้ตัวนี้ต้องเรียก {@link #reset()} ก่อนเริ่ม เพราะ bean ตัวเดียวถูกใช้ร่วมกันทั้ง context
 */
public class RecordingMailSender extends JavaMailSenderImpl {

    /** ค่าของ failAfter ที่แปลว่าไม่ต้องพังเลย */
    private static final int NEVER = -1;

    // thread-safe เพราะเทสที่ยิงคำขอพร้อมกันหลายเส้นจะส่งอีเมลจากหลาย thread
    private final List<MimeMessage> sent = new CopyOnWriteArrayList<>();
    private volatile int failAfter = NEVER;

    @Override
    protected void doSend(MimeMessage[] mimeMessages, Object[] originalMessages) {
        for (MimeMessage message : mimeMessages) {
            if (failAfter != NEVER && sent.size() >= failAfter) {
                throw new MailSendException("Mail server connection failed (RecordingMailSender)");
            }
            try {
                // ของจริงเรียก saveChanges ก่อนส่งทุกครั้ง header อย่าง Content-Type ของแต่ละส่วนถึงจะถูกเขียนลงไป
                // ถ้าข้าม เทสที่เปิดดูไฟล์แนบจะอ่านชนิดของไฟล์ไม่ได้ ทั้งที่ของจริงอ่านได้
                message.saveChanges();
            } catch (MessagingException ex) {
                throw new MailPreparationException(ex);
            }
            sent.add(message);
        }
    }

    /** อีเมลที่ "ส่ง" สำเร็จตั้งแต่ reset ครั้งล่าสุด เรียงตามลำดับที่ส่ง */
    public List<MimeMessage> sent() {
        return List.copyOf(sent);
    }

    /**
     * ให้ส่งสำเร็จได้อีก {@code messages} ฉบับนับจาก reset แล้วพังทุกฉบับหลังจากนั้น
     * ส่ง 0 คือพังตั้งแต่ฉบับแรก เหมือน Mailpit ไม่อยู่
     */
    public void failAfter(int messages) {
        failAfter = messages;
    }

    /** ล้างอีเมลที่เก็บไว้และกลับมาส่งได้ตามปกติ */
    public void reset() {
        sent.clear();
        failAfter = NEVER;
    }
}
