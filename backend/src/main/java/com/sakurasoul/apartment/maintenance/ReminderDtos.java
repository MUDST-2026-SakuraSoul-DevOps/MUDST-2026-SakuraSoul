package com.sakurasoul.apartment.maintenance;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;

/**
 * รูปร่างของ request กับ response ของการแจ้งเตือนตามรอบ (US-14)
 * <p>
 * ข้อความเตือนตรงกับ validateReminder ใน frontend/src/domain/maintenanceBoard.ts
 * <p>
 * เวลาแจ้งเตือนรับส่งเป็นสตริง HH:MM ไม่ใช่ LocalTime ตรง ๆ เพราะ Jackson จะ
 * serialize LocalTime ออกมาเป็น "08:30:00" ซึ่งไม่ตรงกับช่อง time ของดีไซน์ที่เป็น
 * HH:MM และเอาไปใส่ input type="time" ตรง ๆ ไม่ได้ทุกเบราว์เซอร์
 */
public final class ReminderDtos {

    private ReminderDtos() {
    }

    /** รูปแบบเดียวที่ตอบกลับไป ส่วนขามาใจกว้างกว่านี้ ดู parseRemindTime */
    private static final DateTimeFormatter HH_MM = DateTimeFormatter.ofPattern("HH:mm");

    public record ReminderRequest(
            @NotBlank(message = "ต้องกรอกชื่อการแจ้งเตือน")
            String name,

            /** ไม่ส่งมาหรือสะกดผิดได้ 400 จาก ReminderFrequency.parse */
            String frequency,

            @NotNull(message = "ต้องเลือกวันเริ่ม")
            LocalDate startDate,

            /** ช่อง unit ในดีไซน์ ว่างได้ แปลว่าเป็นงานของทั้งตึก */
            Long roomId,

            /** รูปแบบ HH:MM ว่างได้ */
            String remindTime,

            String priority,
            String notes) {
    }

    /** body ของ PATCH /api/reminders/{id}/active มีช่องเดียว */
    public record ReminderActiveRequest(Boolean active) {
    }

    public record ReminderResponse(
            Long id,
            String name,
            ReminderFrequency frequency,
            LocalDate startDate,
            LocalDate nextDueDate,

            /**
             * เลยกำหนดแล้วหรือยัง คำนวณจาก nextDueDate เทียบกับวันนี้ตามเวลาไทย
             * ส่งมาเป็นค่าสำเร็จรูปเพราะ "วันนี้" ของเครื่องผู้ใช้กับของ server
             * อาจคนละวันได้ถ้าตั้งโซนเวลาไว้ต่างกัน แล้วป้ายเลยกำหนดจะไม่ตรงกัน
             */
            boolean overdue,

            Long roomId,
            String roomNumber,
            String remindTime,
            Priority priority,
            String notes,
            boolean active,
            Instant lastTriggeredAt) {

        public static ReminderResponse of(MaintenanceReminder reminder, LocalDate today) {
            return new ReminderResponse(reminder.getId(), reminder.getName(), reminder.getFrequency(),
                    reminder.getStartDate(), reminder.getNextDueDate(), reminder.isOverdue(today),
                    reminder.getRoom() == null ? null : reminder.getRoom().getId(),
                    reminder.getRoom() == null ? null : reminder.getRoom().getRoomNumber(),
                    formatRemindTime(reminder.getRemindTime()),
                    reminder.getPriority(), reminder.getNotes(), reminder.isActive(),
                    reminder.getLastTriggeredAt());
        }
    }

    /** ผลของการสั่งให้ระบบไล่ใบที่ถึงกำหนดเดี๋ยวนี้ ตอบจำนวนใบแจ้งซ่อมที่สร้างไป */
    public record RunDueResponse(int createdTickets) {
    }

    static String formatRemindTime(LocalTime remindTime) {
        return remindTime == null ? null : remindTime.format(HH_MM);
    }

    /**
     * รับได้ทั้ง "08:30" และ "08:30:00" เพราะ input type="time" ของบางเบราว์เซอร์
     * ใส่วินาทีมาด้วยเมื่อผู้ใช้พิมพ์เอง ค่าที่อ่านไม่ออกเป็น 400 พร้อมบอกรูปแบบที่ถูก
     * ไม่ปล่อยให้ตกไปเป็น 500
     */
    static LocalTime parseRemindTime(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        try {
            return LocalTime.parse(value.trim());
        } catch (java.time.format.DateTimeParseException ex) {
            throw new IllegalArgumentException("เวลาแจ้งเตือนต้องอยู่ในรูปแบบ HH:MM");
        }
    }
}
