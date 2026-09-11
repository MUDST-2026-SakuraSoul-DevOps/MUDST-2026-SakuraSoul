package com.sakurasoul.apartment.maintenance;

import com.sakurasoul.apartment.maintenance.SupplyDtos.RestockRequest;
import com.sakurasoul.apartment.maintenance.SupplyDtos.SupplyItemRequest;
import com.sakurasoul.apartment.maintenance.SupplyDtos.SupplyItemResponse;
import com.sakurasoul.apartment.maintenance.SupplyDtos.SupplySummaryResponse;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * endpoint ของคลังอุปกรณ์ (US-17) ตาม docs/api-contract-maintenance.md
 * <p>
 * ไม่มี endpoint ค้นหา เพราะ US-17-S4 ระบุว่าการค้นหาเป็นการกรองรายการที่โหลดมาแล้ว
 * ฝั่งหน้าเว็บ และไม่มี endpoint ลบของออกจากคลัง เพราะของที่เลิกใช้แล้วยังต้องอ้างอิงได้
 * จากประวัติการเบิกในงานซ่อมเก่า ตั้งจำนวนเป็นศูนย์แทนได้ถ้าของหมดไปแล้วจริง ๆ
 */
@RestController
@RequestMapping("/api/supplies")
public class SupplyController {

    private final SupplyService supplyService;

    public SupplyController(SupplyService supplyService) {
        this.supplyService = supplyService;
    }

    @GetMapping
    public List<SupplyItemResponse> list() {
        return supplyService.list();
    }

    /** ตัวเลขสามตัวบนหัวหน้าจอ แยก endpoint เพื่อให้หน้าที่ไม่ต้องใช้ไม่ต้องคิดให้เปลือง */
    @GetMapping("/summary")
    public SupplySummaryResponse summary() {
        return supplyService.summary();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public SupplyItemResponse create(@Valid @RequestBody SupplyItemRequest request) {
        return supplyService.create(request);
    }

    @PutMapping("/{id}")
    public SupplyItemResponse update(@PathVariable Long id,
            @Valid @RequestBody SupplyItemRequest request) {
        return supplyService.update(id, request);
    }

    /**
     * เติมของเข้าคลัง (US-17-S2) เป็นการบวกเพิ่ม ไม่ใช่ตั้งจำนวนใหม่ ตอบ 200 พร้อม
     * ของชิ้นนั้นที่จำนวนอัปเดตแล้ว หน้าเว็บจึงเอาไปวางทับแถวเดิมได้โดยไม่ต้องโหลดซ้ำ
     * <p>
     * ไม่มี @Valid เพราะกฎของช่องนี้เป็นประโยคเดียวสำหรับทั้ง "ไม่ส่งมา" และ "ไม่เกินศูนย์"
     * ซึ่งอยู่ที่ SupplyService (เหตุผลเต็มใน SupplyDtos.RestockRequest)
     */
    @PostMapping("/{id}/restock")
    public SupplyItemResponse restock(@PathVariable Long id, @RequestBody RestockRequest request) {
        return supplyService.restock(id, request.quantity());
    }
}
