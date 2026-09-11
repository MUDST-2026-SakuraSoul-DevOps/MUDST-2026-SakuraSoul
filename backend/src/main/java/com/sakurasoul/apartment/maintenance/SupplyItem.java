package com.sakurasoul.apartment.maintenance;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;

import java.time.Instant;

/**
 * ของหนึ่งรายการในคลังอุปกรณ์ (US-17)
 * <p>
 * สถานะ In Stock / Low Stock ไม่ได้เก็บเป็นคอลัมน์ แต่คำนวณจาก stock กับ minStock
 * ทุกครั้งที่ตอบ เหตุผลเดียวกับที่สถานะห้องไม่ได้เก็บเป็นคอลัมน์ คือถ้าเก็บไว้แล้วมีคน
 * แก้จำนวนโดยลืมแก้สถานะ ตารางจะโชว์ว่าของพอทั้งที่จริงต่ำกว่าขั้นต่ำแล้ว
 * (กฎเดียวกับ supplyStatus ใน frontend/src/domain/maintenanceBoard.ts)
 */
@Entity
@Table(name = "supply_item")
public class SupplyItem {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "name", nullable = false, length = 200)
    private String name;

    /** ว่างได้ ของที่ซื้อจากร้านแถวหอไม่มีรหัสติดมา แต่ถ้ากรอกมาต้องไม่ซ้ำ */
    @Column(name = "sku", length = 50)
    private String sku;

    @Column(name = "category", nullable = false, length = 100)
    private String category;

    @Column(name = "stock", nullable = false)
    private int stock;

    @Column(name = "min_stock", nullable = false)
    private int minStock;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected SupplyItem() {
    }

    public SupplyItem(String name, String sku, String category, int stock, int minStock) {
        this.name = name;
        this.sku = sku;
        this.category = category;
        this.stock = stock;
        this.minStock = minStock;
    }

    @PrePersist
    void onCreate() {
        if (createdAt == null) {
            createdAt = Instant.now();
        }
    }

    /** แก้รายละเอียดของทั้งก้อนจากฟอร์มแก้ไข จำนวนคงเหลือตั้งใหม่ได้ตรง ๆ ที่นี่ */
    public void update(String name, String sku, String category, int stock, int minStock) {
        this.name = name;
        this.sku = sku;
        this.category = category;
        this.stock = stock;
        this.minStock = minStock;
    }

    /**
     * เติมของเข้าคลัง (US-17-S2) เป็นการ "บวกเพิ่ม" ไม่ใช่ตั้งจำนวนใหม่ทั้งก้อน
     * ผู้เรียกต้องตรวจมาก่อนแล้วว่าจำนวนมากกว่าศูนย์ (ดู SupplyService.restock)
     */
    public void restock(int quantity) {
        this.stock += quantity;
    }

    /**
     * หยิบของไปใช้กับงานซ่อม ของไม่พอถือเป็นคำขอที่ผิด ไม่ใช่ข้อผิดพลาดของระบบ
     * จึงเป็น IllegalArgumentException ที่ ApiExceptionHandler แปลงเป็น 400
     * <p>
     * ข้อความบอกจำนวนที่เหลือจริงไปด้วย เพราะสิ่งที่แอดมินต้องตัดสินใจต่อคือจะเบิกเท่าที่
     * มีหรือไปเติมของก่อน ถ้าบอกแค่ว่า "ของไม่พอ" ต้องกดออกไปดูหน้าคลังอีกรอบ
     * <p>
     * การเช็คตรงนี้เป็นตัวกันจริงของกรณี "ของไม่พอ" ได้ก็ต่อเมื่อผู้เรียกล็อกแถวไว้ก่อนแล้ว
     * (MaintenanceService.consume อ่านผ่าน SupplyItemRepository.findForUpdateById)
     * CHECK constraint supply_item_stock_ck ใน V8 เป็นด่านสุดท้ายที่กันยอดติดลบไม่ให้ถูก
     * เขียนลงแถวเท่านั้น กันการเบิกซ้อนกันของสองคำขอไม่ได้ เพราะ Hibernate เขียนยอดใหม่
     * ทั้งก้อนไม่ได้เขียนเป็นส่วนต่าง สองคนที่เบิกจากยอดเดียวกันจึงเขียนทับกันโดยที่ยอด
     * ไม่เคยติดลบ
     */
    public void withdraw(int quantity) {
        if (stock < quantity) {
            throw new IllegalArgumentException(
                    "Not enough " + name + " in stock (only " + stock + " left)");
        }
        this.stock -= quantity;
    }

    /** ต่ำกว่าขั้นต่ำที่ตั้งไว้หรือยัง หน้าเว็บเอาไปติดป้าย Low Stock */
    public boolean isLowStock() {
        return stock < minStock;
    }

    public Long getId() {
        return id;
    }

    public String getName() {
        return name;
    }

    public String getSku() {
        return sku;
    }

    public String getCategory() {
        return category;
    }

    public int getStock() {
        return stock;
    }

    public int getMinStock() {
        return minStock;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
