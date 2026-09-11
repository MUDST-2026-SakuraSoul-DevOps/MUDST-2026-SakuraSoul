package com.sakurasoul.apartment.maintenance;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface SupplyItemRepository extends JpaRepository<SupplyItem, Long> {

    /** หน้าคลังอุปกรณ์เรียงตามชื่อ ส่วนการค้นหาเป็นงานฝั่งหน้าเว็บตาม US-17-S4 */
    List<SupplyItem> findAllByOrderByNameAsc();

    /** ใช้เช็ครหัส SKU ซ้ำก่อนบันทึก ตัวกันจริงคือ constraint supply_item_sku_uk ใน V8 */
    Optional<SupplyItem> findBySku(String sku);

    /**
     * ของหนึ่งชิ้นพร้อมล็อกแถวไว้จนจบ transaction ใช้กับทุกเส้นทางที่ "อ่านยอดแล้วเขียนยอดใหม่"
     * คือการเบิกของไปใช้ในงานซ่อมกับการเติมของเข้าคลัง
     * <p>
     * ที่ต้องล็อกเพราะ Hibernate เขียนยอดใหม่ทั้งก้อน (SET stock = 3) ไม่ได้เขียนเป็นส่วนต่าง
     * แอดมินสองคนที่เบิกคนละ 5 ชิ้นจากยอด 5 พร้อมกันจะอ่านได้ 5 ทั้งคู่ ผ่านการเช็คว่าของพอ
     * ทั้งคู่ แล้วเขียนทับกันเป็น 0 กลายเป็นว่ามีแถวการเบิกรวม 10 ชิ้นแต่ยอดลดไปแค่ 5
     * โดยที่ CHECK supply_item_stock_ck ไม่มีวันฟ้อง เพราะยอดที่เขียนลงไปไม่เคยติดลบ
     * <p>
     * เส้นทางที่อ่านอย่างเดียว (GET /api/supplies, การ์ดสรุป) ยังใช้ findById / findAll
     * ตามเดิม การล็อกมีเฉพาะตอนที่จะเขียนยอดจริง
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select s from SupplyItem s where s.id = :id")
    Optional<SupplyItem> findForUpdateById(@Param("id") Long id);
}
