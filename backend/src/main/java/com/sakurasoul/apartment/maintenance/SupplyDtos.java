package com.sakurasoul.apartment.maintenance;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;

import java.time.Instant;

/**
 * รูปร่างของ request กับ response ของคลังอุปกรณ์ (US-17)
 * <p>
 * ข้อความเตือนทุกประโยคตรงกับ validateSupplyItem กับ validateRestockQuantity ใน
 * frontend/src/domain/maintenanceBoard.ts ตัวอักษรต่อตัวอักษร เพราะฟอร์มเดียวกัน
 * ตรวจสองรอบ (หน้าเว็บตรวจก่อนกดส่ง ฝั่งนี้ตรวจซ้ำ) ถ้าสองฝั่งเขียนคนละประโยค
 * ผู้ใช้จะเห็นข้อความเปลี่ยนไปเฉย ๆ เมื่อกดส่งทั้งที่กรอกผิดเรื่องเดียวกัน
 */
public final class SupplyDtos {

    private SupplyDtos() {
    }

    public record SupplyItemRequest(
            @NotBlank(message = "ต้องกรอกชื่ออุปกรณ์")
            String name,

            /** ว่างได้ แต่ถ้ากรอกมาต้องไม่ซ้ำกับของชิ้นอื่น */
            String sku,

            @NotBlank(message = "ต้องกรอกหมวดหมู่")
            String category,

            @NotNull(message = "จำนวนคงเหลือต้องไม่ติดลบ")
            @PositiveOrZero(message = "จำนวนคงเหลือต้องไม่ติดลบ")
            Integer stock,

            @NotNull(message = "จำนวนขั้นต่ำต้องไม่ติดลบ")
            @PositiveOrZero(message = "จำนวนขั้นต่ำต้องไม่ติดลบ")
            Integer minStock) {
    }

    /**
     * body ของการเติมของ ไม่มี bean validation ติดไว้โดยตั้งใจ
     * <p>
     * กฎของช่องนี้คือ "ต้องมากกว่า 0" ซึ่งครอบทั้งกรณีไม่ส่งมาเลยและกรณีส่ง 0 หรือติดลบ
     * ทั้งสามกรณีต้องได้ประโยคเดียวกัน ถ้าแยกเป็น @NotNull กับ @Positive ข้อความจะเป็น
     * คนละประโยคตามช่องที่ผิด การตรวจจึงอยู่ที่ SupplyService ที่เดียว
     * (เหตุผลเดียวกับที่ RoomStatusRequest ไม่มี @Valid)
     */
    public record RestockRequest(Integer quantity) {
    }

    public record SupplyItemResponse(
            Long id,
            String name,
            String sku,
            String category,
            int stock,
            int minStock,
            SupplyStatus status,
            Instant createdAt) {

        public static SupplyItemResponse of(SupplyItem item) {
            return new SupplyItemResponse(item.getId(), item.getName(), item.getSku(),
                    item.getCategory(), item.getStock(), item.getMinStock(),
                    SupplyStatus.of(item), item.getCreatedAt());
        }
    }

    /**
     * ตัวเลขสามตัวบนหัวหน้าคลังอุปกรณ์
     * <p>
     * restockedThisWeek เป็นผลรวม "จำนวนชิ้นที่เติม" ไม่ใช่จำนวนครั้งที่กดเติม เพราะ
     * สิ่งที่แอดมินอยากรู้คือของเข้ามาเท่าไหร่ ไม่ใช่กดปุ่มไปกี่ครั้ง
     */
    public record SupplySummaryResponse(
            long totalItems,
            long lowStockItems,
            int restockedThisWeek) {
    }

    /**
     * สถานะสต็อกที่คำนวณจากจำนวน ไม่ได้เก็บไว้ในตาราง
     * <p>
     * อยู่ในไฟล์ DTO ไม่ใช่ enum ของตัวเองเพราะไม่มีคอลัมน์ไหนเก็บค่านี้ มันมีชีวิตอยู่
     * เฉพาะตอนตอบ API เท่านั้น เหตุผลเต็มว่าทำไมไม่เก็บอยู่ใน SupplyItem
     */
    public enum SupplyStatus {

        IN_STOCK,
        LOW_STOCK;

        static SupplyStatus of(SupplyItem item) {
            return item.isLowStock() ? LOW_STOCK : IN_STOCK;
        }
    }
}
