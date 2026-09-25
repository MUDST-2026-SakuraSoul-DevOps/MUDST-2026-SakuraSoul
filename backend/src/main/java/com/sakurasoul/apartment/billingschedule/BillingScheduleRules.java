package com.sakurasoul.apartment.billingschedule;

import com.sakurasoul.apartment.billingschedule.BillingScheduleDtos.BillingScheduleRequest;

import java.time.LocalTime;
import java.time.YearMonth;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.time.temporal.ChronoUnit;
import java.util.Optional;

/**
 * กฎของค่าตั้งเวลาเตือนใบค้างรายเดือน (SSK-143) ทั้งการตรวจค่าก่อนบันทึก และการคิดว่ารอบถัดไปคือเมื่อไหร่
 * <p>
 * เป็นฝาแฝดของ frontend/src/domain/scheduledBilling.ts ทั้งข้อความเตือนและกฎรอบต้องตรงกันเป๊ะ
 * หน้าเว็บใช้ฝั่งโน้นเตือนก่อนกดบันทึกและโชว์ตัวอย่างรอบถัดไป ส่วนฝั่งนี้คือตัวตัดสินจริง
 * แก้ที่นี่แล้วต้องไปแก้อีกฝั่งด้วยเสมอ
 * <p>
 * แยกออกมาเป็นฟังก์ชันล้วนที่รับ "ตอนนี้" เข้ามา เพื่อให้เทสยืนยันเรื่องอย่างการหนีบวันสิ้นเดือนกุมภาพันธ์
 * ได้โดยไม่ต้องรอถึงวันนั้น
 */
final class BillingScheduleRules {

    private static final DateTimeFormatter HH_MM = DateTimeFormatter.ofPattern("HH:mm");
    private static final DateTimeFormatter PERIOD = DateTimeFormatter.ofPattern("yyyy-MM");

    private BillingScheduleRules() {
    }

    /** คืนข้อความเตือนช่องแรกที่ผิด หรือ null เมื่อถูกทุกช่อง ลำดับเดียวกับฟอร์มในหน้าเว็บ */
    static String validate(BillingScheduleRequest request) {
        if (request.enabled() == null) {
            return "Please choose whether the schedule is enabled";
        }
        if (request.dayOfMonth() == null) {
            return "Please choose the billing day";
        }
        if (request.dayOfMonth() < 1 || request.dayOfMonth() > 31) {
            return "Billing day must be between 1 and 31";
        }
        if (request.sendTime() == null || request.sendTime().isBlank()) {
            return "Please choose the send time";
        }
        if (parseSendTime(request.sendTime()) == null) {
            return "The send time must be in HH:MM format";
        }
        return null;
    }

    /**
     * รับได้ทั้ง "09:00" และ "09:00:30" เหมือนเวลาแจ้งเตือนซ่อม เพราะ input type="time" ของบางเบราว์เซอร์
     * ใส่วินาทีมาด้วย แต่เก็บแค่ระดับนาที เพราะงานตั้งเวลาตื่นทุกต้นนาทีและหน้าเว็บโชว์แค่ HH:MM
     * คืน null เมื่ออ่านไม่ออก
     */
    static LocalTime parseSendTime(String value) {
        try {
            return LocalTime.parse(value.trim()).truncatedTo(ChronoUnit.MINUTES);
        } catch (DateTimeParseException ex) {
            return null;
        }
    }

    static String formatSendTime(LocalTime sendTime) {
        return sendTime.format(HH_MM);
    }

    /** เดือน "YYYY-MM" ที่รอบนี้เป็นของ now ต้องเป็นเวลาไทยอยู่แล้ว (มาจาก Clock ของแอป) */
    static String periodOf(ZonedDateTime now) {
        return now.format(PERIOD);
    }

    /**
     * รอบของเดือนหนึ่ง คือวันที่ตั้งไว้ของเดือนนั้น เวลาที่ตั้งไว้ ตามโซนที่ส่งมา
     * <p>
     * เดือนที่สั้นกว่าวันที่ตั้งไว้ใช้วันสุดท้ายของเดือนแทน ตั้ง 31 แล้วเดือนกุมภาพันธ์ส่งวันที่ 28 (29 ในปีอธิกสุรทิน)
     * ไม่ใช่ข้ามเดือนนั้นไปเฉย ๆ หรือเลื่อนไปต้นเดือนถัดไป
     */
    static ZonedDateTime slotOf(YearMonth month, int dayOfMonth, LocalTime sendTime, ZoneId zone) {
        int day = Math.min(dayOfMonth, month.lengthOfMonth());
        return month.atDay(day).atTime(sendTime).atZone(zone);
    }

    /**
     * รอบถัดไปที่งานตั้งเวลาจะส่ง ว่างเมื่อปิดอยู่
     * <p>
     * ถ้าเดือนนี้ยังไม่เคยรัน และรอบของเดือนนี้อยู่หลังเวลาที่กดบันทึกล่าสุด รอบถัดไปคือรอบของเดือนนี้
     * ถึงจะเลยเวลาไปแล้วก็ตาม (กรณี backend ดับตอนถึงเวลาแล้วเพิ่งกลับมา งานจะส่งตามในนาทีถัดไป)
     * นอกนั้นคือรอบของเดือนหน้า
     * <p>
     * การเทียบกับเวลาที่กดบันทึกทำให้ค่าใหม่มีผลตั้งแต่รอบแรกหลังบันทึก ถ้าวันนี้วันที่ 26 แล้วเพิ่งเปิดใช้โดยตั้ง
     * วันที่ 25 จะไม่ส่งทันที แต่รอวันที่ 25 ของเดือนหน้า เปิดใช้ปุ๊บแล้วอีเมลออกทั้งตึกโดยไม่ตั้งใจแย่กว่ารอหนึ่งเดือน
     */
    static Optional<ZonedDateTime> nextRunAt(BillingSchedule schedule, boolean ranThisMonth, ZonedDateTime now) {
        if (!schedule.isEnabled()) {
            return Optional.empty();
        }
        YearMonth thisMonth = YearMonth.from(now);
        ZonedDateTime thisMonthSlot = slotOf(thisMonth, schedule.getDayOfMonth(), schedule.getSendTime(),
                now.getZone());
        if (!ranThisMonth && thisMonthSlot.toInstant().isAfter(schedule.getUpdatedAt())) {
            return Optional.of(thisMonthSlot);
        }
        return Optional.of(slotOf(thisMonth.plusMonths(1), schedule.getDayOfMonth(), schedule.getSendTime(),
                now.getZone()));
    }

    /** ถึงเวลาส่งแล้วหรือยัง คือมีรอบถัดไป และรอบนั้นไม่ได้อยู่หลัง now */
    static boolean isDue(BillingSchedule schedule, boolean ranThisMonth, ZonedDateTime now) {
        return nextRunAt(schedule, ranThisMonth, now).map(slot -> !slot.isAfter(now)).orElse(false);
    }
}
