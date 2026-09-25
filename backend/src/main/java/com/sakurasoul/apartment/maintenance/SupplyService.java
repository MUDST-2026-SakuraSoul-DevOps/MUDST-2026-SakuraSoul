package com.sakurasoul.apartment.maintenance;

import com.sakurasoul.apartment.common.ConflictException;
import com.sakurasoul.apartment.common.NotFoundException;
import com.sakurasoul.apartment.maintenance.SupplyDtos.SupplyItemRequest;
import com.sakurasoul.apartment.maintenance.SupplyDtos.SupplyItemResponse;
import com.sakurasoul.apartment.maintenance.SupplyDtos.SupplySummaryResponse;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Locale;

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
    private final MaintenanceSupplyUsageRepository usageRepository;
    private final Clock clock;

    public SupplyService(SupplyItemRepository supplyRepository,
            SupplyRestockRepository restockRepository,
            MaintenanceSupplyUsageRepository usageRepository, Clock clock) {
        this.supplyRepository = supplyRepository;
        this.restockRepository = restockRepository;
        this.usageRepository = usageRepository;
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

    /**
     * เพิ่มของเข้าคลัง ไม่ได้กรอกรหัสมาระบบออกให้ (SSK-23) เพราะตารางหน้าเว็บโชว์ SKU ทุกแถว
     * และฟอร์มไม่มีช่องให้พิมพ์รหัส รหัสมี id อยู่ในนั้น จึงต้องบันทึกหนึ่งรอบก่อนให้ได้ id แล้วค่อยใส่
     */
    @Transactional
    public SupplyItemResponse create(SupplyItemRequest request) {
        String sku = trimToNull(request.sku());
        guardAgainstDuplicateSku(sku, null);

        String category = request.category().trim();
        SupplyItem item = supplyRepository.saveAndFlush(new SupplyItem(request.name().trim(), sku,
                category, request.stock(), request.minStock(), request.maxStock()));
        if (sku == null) {
            item.assignSku(generateSku(category, item.getId()));
            item = supplyRepository.saveAndFlush(item);
        }
        return SupplyItemResponse.of(item);
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
                request.stock(), request.minStock(), request.maxStock());
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
    public SupplyItemResponse restock(Long id, BigDecimal quantity) {
        SupplyItem item = findItemForUpdate(id);

        if (quantity == null || quantity.signum() <= 0) {
            throw new IllegalArgumentException("The restock amount must be greater than 0");
        }
        // ของนับเป็นชิ้น 2.5 ต้องถูกปฏิเสธ ไม่ใช่ถูกปัดเป็น 2 เงียบ ๆ ส่วน 2.0 คือ 2 (SSK-23)
        if (quantity.stripTrailingZeros().scale() > 0) {
            throw new IllegalArgumentException("The restock amount must be a whole number");
        }

        int amount = quantity.intValueExact();
        item.restock(amount);
        restockRepository.save(new SupplyRestock(item, amount, Instant.now(clock)));
        return SupplyItemResponse.of(supplyRepository.saveAndFlush(item));
    }

    /**
     * ลบของที่เพิ่มผิด (SSK-23) ได้เฉพาะของที่ยังไม่เคยถูกเบิกในใบแจ้งซ่อมเลย
     * <p>
     * ของที่เคยถูกเบิกแล้วลบไม่ได้ เพราะใบแจ้งซ่อมเก่ายังต้องบอกได้ว่าใช้อะไรไป ให้ตั้งจำนวนเป็นศูนย์แทน
     * (หลักเดียวกับการลบใบแจ้งซ่อมใน SSK-131) ส่วนประวัติการเติมของชิ้นนั้นลบไปด้วย เพราะเป็นประวัติ
     * ของของที่ไม่ควรมีอยู่ตั้งแต่แรก ผลคือการ์ด restocked this week ลดลงตาม
     * <p>
     * ล็อกแถวก่อนเช็ค (ตัวเดียวกับที่การเบิกของใช้) การเบิกที่เข้ามาพร้อมกันจึงต้องรอจนการลบจบ
     * แทรกระหว่าง "เช็คว่ายังไม่เคยเบิก" กับ "ลบ" ไม่ได้ ไม่งั้นแถวการเบิกจะชี้ไปหาของที่ถูกลบไปแล้ว
     */
    @Transactional
    public void delete(Long id) {
        SupplyItem item = findItemForUpdate(id);

        if (usageRepository.existsBySupplyId(id)) {
            throw new ConflictException("This item has been used in maintenance tickets and cannot be deleted. "
                    + "Set its stock to 0 instead.");
        }

        restockRepository.deleteBySupplyId(id);
        supplyRepository.delete(item);
        supplyRepository.flush();
    }

    /**
     * รหัสที่ระบบออกให้ สูตรเดียวกับที่หน้าเว็บเคยออกเองก่อนต่อ API (makeSku เดิม) คือสองอักษรละติน
     * แรกของหมวด ตัวพิมพ์ใหญ่ ตามด้วย id เติมศูนย์ให้ครบสามหลัก เช่น Plumbing ชิ้นที่ 4 ได้ PL-004
     * <p>
     * id ไม่ซ้ำกันอยู่แล้ว รหัสที่ระบบออกเองจึงไม่มีทางชนกันเอง ที่ชนได้คือรหัสที่มีคนพิมพ์ไว้ตรงกันพอดี
     * ตอนนั้นต่อท้าย -2, -3 ไปจนไม่ชน ดีกว่าตอบ 409 ให้คนที่ไม่ได้กรอกรหัสอะไรเลย
     */
    private String generateSku(String category, Long id) {
        String base = skuPrefix(category) + "-" + String.format(Locale.ROOT, "%03d", id);
        String candidate = base;
        for (int suffix = 2; supplyRepository.findBySku(candidate).isPresent(); suffix++) {
            candidate = base + "-" + suffix;
        }
        return candidate;
    }

    /** หมวดที่ไม่มีอักษรละตินเลย (เช่นพิมพ์เป็นภาษาไทย) ได้ XX เหมือนสูตรเดิมของหน้าเว็บ */
    static String skuPrefix(String category) {
        String letters = category.replaceAll("[^A-Za-z]", "");
        if (letters.isEmpty()) {
            return "XX";
        }
        return letters.substring(0, Math.min(2, letters.length())).toUpperCase(Locale.ROOT);
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
