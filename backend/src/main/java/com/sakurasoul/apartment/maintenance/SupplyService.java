package com.sakurasoul.apartment.maintenance;

import com.sakurasoul.apartment.common.ConflictException;
import com.sakurasoul.apartment.common.NotFoundException;
import com.sakurasoul.apartment.maintenance.SupplyDtos.SupplyItemRequest;
import com.sakurasoul.apartment.maintenance.SupplyDtos.SupplyItemResponse;
import com.sakurasoul.apartment.maintenance.SupplyDtos.SupplySummaryResponse;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

/**
 * คลังอุปกรณ์ (US-17)
 * <p>
 * ไม่มีการค้นหาฝั่ง server เพราะ US-17-S4 ระบุว่าการค้นหาเป็นการกรองรายการที่โหลดมาแล้ว
 * ฝั่งหน้าเว็บ ของในคลังของหอขนาดนี้มีหลักสิบถึงร้อยรายการ การส่งทั้งชุดไปให้กรองเอง
 * เร็วกว่าการยิงถามทุกครั้งที่พิมพ์ตัวอักษร
 */
@Service
public class SupplyService {

    /** "สัปดาห์นี้" ของการ์ด restocked this week คือเจ็ดวันปฏิทินรวมวันนี้ */
    private static final int WEEK_DAYS = 7;

    private final SupplyItemRepository supplyRepository;
    private final SupplyRestockRepository restockRepository;
    private final Clock clock;

    public SupplyService(SupplyItemRepository supplyRepository,
            SupplyRestockRepository restockRepository, Clock clock) {
        this.supplyRepository = supplyRepository;
        this.restockRepository = restockRepository;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public List<SupplyItemResponse> list() {
        return supplyRepository.findAllByOrderByNameAsc().stream()
                .map(SupplyItemResponse::of)
                .toList();
    }

    /**
     * ตัวเลขสามตัวบนหัวหน้าคลัง
     * <p>
     * ช่วงของ "สัปดาห์นี้" นับเป็นวันปฏิทินตามเวลาไทย คือตั้งแต่เที่ยงคืนของหกวันก่อน
     * จนถึงตอนนี้ ไม่ได้นับถอยหลัง 168 ชั่วโมงจากเวลาปัจจุบัน เพราะแอดมินที่เปิดดูตอนเย็น
     * คาดหวังว่าของที่เติมเมื่อเช้าของเจ็ดวันก่อนยังนับอยู่ ไม่ใช่หลุดออกไปเพราะเลยมา
     * ไม่กี่ชั่วโมง
     */
    @Transactional(readOnly = true)
    public SupplySummaryResponse summary() {
        List<SupplyItem> items = supplyRepository.findAll();
        Instant since = LocalDate.now(clock)
                .minusDays(WEEK_DAYS - 1L)
                .atStartOfDay(clock.getZone())
                .toInstant();

        int restocked = restockRepository.findByRestockedAtGreaterThanEqual(since).stream()
                .mapToInt(SupplyRestock::getQuantity)
                .sum();

        return new SupplySummaryResponse(items.size(),
                items.stream().filter(SupplyItem::isLowStock).count(),
                restocked);
    }

    @Transactional
    public SupplyItemResponse create(SupplyItemRequest request) {
        String sku = trimToNull(request.sku());
        guardAgainstDuplicateSku(sku, null);

        SupplyItem item = new SupplyItem(request.name().trim(), sku, request.category().trim(),
                request.stock(), request.minStock());
        return SupplyItemResponse.of(supplyRepository.saveAndFlush(item));
    }

    /**
     * แก้ของทั้งก้อนจากฟอร์มแก้ไข รวมถึงตั้งจำนวนคงเหลือใหม่ได้ตรง ๆ
     * <p>
     * ตั้งจำนวนใหม่ได้ที่นี่แต่ห้ามใช้แทนการเติมของ เพราะการเติมต้องทิ้งรอยไว้ในตาราง
     * supply_restock ให้การ์ด restocked this week นับได้ (US-17-S2) ทางที่ถูกคือ
     * POST /api/supplies/{id}/restock ส่วนที่นี่ไว้แก้ตอนนับสต็อกจริงแล้วไม่ตรง
     */
    @Transactional
    public SupplyItemResponse update(Long id, SupplyItemRequest request) {
        SupplyItem item = findItem(id);
        String sku = trimToNull(request.sku());
        guardAgainstDuplicateSku(sku, id);

        item.update(request.name().trim(), sku, request.category().trim(),
                request.stock(), request.minStock());
        return SupplyItemResponse.of(supplyRepository.saveAndFlush(item));
    }

    /**
     * เติมของเข้าคลัง (US-17-S2) เป็นการบวกเพิ่ม ไม่ใช่ตั้งจำนวนใหม่
     * <p>
     * ไม่ส่งจำนวนมา ส่งศูนย์ หรือส่งติดลบ ได้ข้อความเดียวกันหมด เพราะทั้งสามกรณีคือ
     * "ยังไม่ได้บอกว่าจะเติมเท่าไหร่" ในสายตาผู้ใช้ ข้อความตรงกับ validateRestockQuantity
     * ฝั่งหน้าเว็บตัวอักษรต่อตัวอักษร
     * <p>
     * อ่านของด้วย findForUpdateById เพราะเป็นการบวกทับยอดเดิม สองคนที่กดเติมพร้อมกัน
     * จะอ่านยอดเดียวกันแล้วเขียนทับกันจนของที่เติมหายไปหนึ่งครั้งถ้าไม่ล็อกแถวไว้ก่อน
     * (เหตุผลเต็มอยู่ที่ SupplyItemRepository.findForUpdateById)
     */
    @Transactional
    public SupplyItemResponse restock(Long id, Integer quantity) {
        SupplyItem item = findItemForUpdate(id);

        if (quantity == null || quantity <= 0) {
            throw new IllegalArgumentException("The restock amount must be greater than 0");
        }

        item.restock(quantity);
        restockRepository.save(new SupplyRestock(item, quantity, Instant.now(clock)));
        return SupplyItemResponse.of(supplyRepository.saveAndFlush(item));
    }

    /**
     * เช็ครหัสซ้ำก่อนบันทึกเพื่อให้ได้ข้อความที่อ่านรู้เรื่อง ตัวกันจริงคือ constraint
     * supply_item_sku_uk ใน V8 ซึ่ง ApiExceptionHandler แปลงเป็นข้อความเดียวกันนี้
     * ผู้ใช้จึงเห็นประโยคเดียวกันไม่ว่าจะแพ้เส้นทางไหน (หลักการเดียวกับเลขบัตรผู้เช่าซ้ำ)
     * <p>
     * ignoreId คือชิ้นที่กำลังแก้อยู่ ต้องตัดตัวเองออกก่อนเทียบ ไม่งั้นกดบันทึกโดยไม่เปลี่ยน
     * รหัสจะฟ้องว่าซ้ำกับตัวเอง
     */
    private void guardAgainstDuplicateSku(String sku, Long ignoreId) {
        if (sku == null) {
            return;
        }
        supplyRepository.findBySku(sku)
                .filter(existing -> ignoreId == null || !ignoreId.equals(existing.getId()))
                .ifPresent(existing -> {
                    throw new ConflictException("An item with this SKU already exists");
                });
    }

    private SupplyItem findItem(Long id) {
        return supplyRepository.findById(id)
                .orElseThrow(() -> new NotFoundException("supply", id));
    }

    /** เหมือน findItem แต่ล็อกแถวไว้ ใช้เฉพาะเส้นทางที่อ่านยอดคงเหลือแล้วเขียนยอดใหม่ */
    private SupplyItem findItemForUpdate(Long id) {
        return supplyRepository.findForUpdateById(id)
                .orElseThrow(() -> new NotFoundException("supply", id));
    }

    /** รหัสที่กรอกมาเป็นช่องว่างล้วนถือว่าไม่ได้กรอก จะได้ไม่ไปชนกฎห้ามซ้ำกันเอง */
    private static String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
