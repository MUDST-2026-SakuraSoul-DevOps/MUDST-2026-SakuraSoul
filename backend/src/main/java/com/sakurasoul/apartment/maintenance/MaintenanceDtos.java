package com.sakurasoul.apartment.maintenance;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

/**
 * รูปร่างของ request กับ response ของใบแจ้งซ่อม ตกลงกับหน้าเว็บไว้ใน
 * docs/api-contract-maintenance.md ลำดับและชื่อฟิลด์ต้องตรงกับที่เขียนไว้ที่นั่น
 * <p>
 * เจ็ดฟิลด์แรกของ {@link TicketResponse} คือ MaintenanceTicket ใน
 * frontend/src/api/types.ts ทั้งชุดและเรียงลำดับเดียวกัน ที่เหลือเป็นของเพิ่มของ CR-05
 * หน้าเว็บที่อ่านแค่เจ็ดฟิลด์แรกอยู่แล้วจึงไม่ต้องแก้อะไรเลย
 * <p>
 * ช่องที่เป็น enum (priority, status) ประกาศเป็น String ในฝั่ง request โดยตั้งใจ
 * ถ้าประกาศเป็น enum ค่าที่สะกดผิดจะไปตกที่ handler ของ Jackson แล้วได้ข้อความว่า
 * "The priority field has an invalid format" ซึ่งไม่บอกว่าค่าที่ใช้ได้มีอะไรบ้าง การแปลงเองใน
 * service ทำให้ตอบข้อความที่ระบุตัวเลือกครบได้ (ดู Priority.parse กับ TicketStatus.parse)
 */
public final class MaintenanceDtos {

    private MaintenanceDtos() {
    }

    public record CreateTicketRequest(
            @NotNull(message = "Please choose the unit")
            Long roomId,

            @NotBlank(message = "Please enter the task title")
            String title,

            String detail,
            String maintenanceType,

            /** ไม่ส่งมาถือว่า MEDIUM ตรงกับค่า DEFAULT ของคอลัมน์ใน V8 */
            String priority,

            String assignedTo,
            String reportedBy,

            /** วันนัดซ่อม ว่างได้ ดีไซน์ไม่ได้บังคับ */
            LocalDate scheduledDate,

            @PositiveOrZero(message = "The cost cannot be negative")
            BigDecimal cost,

            /**
             * ของที่ใช้ไปกับงานนี้ ส่งมาแล้วสต็อกจะถูกตัดใน transaction เดียวกับการสร้างใบ
             * ตาม US-12-S1 ไม่ส่งมาหรือส่งลิสต์ว่างก็ได้ แปลว่ายังไม่ได้เบิกของ
             */
            @Valid
            List<SupplyUsageRequest> suppliesUsed) {
    }

    /** ของหนึ่งรายการที่เบิกไปใช้ ใช้ทั้งตอนสร้างใบและตอนเบิกเพิ่มทีหลัง */
    public record SupplyUsageRequest(
            @NotNull(message = "Please choose the item")
            Long supplyId,

            @NotNull(message = "The quantity used must be greater than 0")
            Integer quantity) {
    }

    /**
     * body ของ PATCH ทุกช่องไม่บังคับ ช่องที่ไม่ส่งมาแปลว่าไม่แก้ ไม่ได้แปลว่าให้ล้างค่า
     * <p>
     * ที่เป็น PATCH ไม่ใช่ PUT เพราะหน้าจอจริงแก้ทีละอย่าง เช่น ลากการ์ดเปลี่ยนสถานะ
     * หรือกดมอบหมายงานให้ช่าง การบังคับให้ส่งใบทั้งก้อนกลับมาทุกครั้งจะทำให้หน้าเว็บ
     * ต้องถือสำเนาใบไว้ให้ครบ แล้วเขียนทับช่องที่คนอื่นเพิ่งแก้ไปโดยไม่ได้ตั้งใจ
     */
    public record UpdateTicketRequest(
            String status,
            String assignedTo,
            String priority,
            LocalDate scheduledDate,

            @PositiveOrZero(message = "The cost cannot be negative")
            BigDecimal cost,

            String detail) {
    }

    public record TicketResponse(
            // เจ็ดช่องนี้คือ MaintenanceTicket ฝั่งหน้าเว็บทั้งชุด ห้ามตัดหรือสลับลำดับ
            Long id,
            Long roomId,
            String roomNumber,
            String title,
            String detail,
            TicketStatus status,
            Instant reportedAt,

            // ของเพิ่มของ CR-05 หน้าเว็บจะค่อย ๆ เอาไปใช้ตามที่แท็บไหนต้องการ
            String maintenanceType,
            Priority priority,
            String assignedTo,
            String reportedBy,
            LocalDate scheduledDate,
            BigDecimal cost,
            TicketSource source,
            Instant closedAt,
            List<SupplyUsageResponse> suppliesUsed) {

        public static TicketResponse of(MaintenanceTicket ticket, List<SupplyUsageResponse> suppliesUsed) {
            return new TicketResponse(ticket.getId(),
                    ticket.getRoom().getId(), ticket.getRoom().getRoomNumber(),
                    ticket.getTitle(), ticket.getDetail(), ticket.getStatus(), ticket.getReportedAt(),
                    ticket.getMaintenanceType(), ticket.getPriority(), ticket.getAssignedTo(),
                    ticket.getReportedBy(), ticket.getScheduledDate(), ticket.getCost(),
                    ticket.getSource(), ticket.getClosedAt(), suppliesUsed);
        }
    }

    /** ชื่ออุปกรณ์ติดมาด้วยเพื่อให้หน้าเว็บโชว์ได้โดยไม่ต้องยิงถามคลังซ้ำ */
    public record SupplyUsageResponse(
            Long supplyId,
            String name,
            int quantity) {

        public static SupplyUsageResponse of(MaintenanceSupplyUsage usage) {
            return new SupplyUsageResponse(usage.getSupply().getId(), usage.getSupply().getName(),
                    usage.getQuantity());
        }
    }
}
