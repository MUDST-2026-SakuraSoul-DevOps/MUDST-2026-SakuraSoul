package com.sakurasoul.apartment.maintenance;

import com.sakurasoul.apartment.common.ConflictException;
import com.sakurasoul.apartment.common.NotFoundException;
import com.sakurasoul.apartment.maintenance.SupplyDtos.SupplyItemRequest;
import com.sakurasoul.apartment.maintenance.SupplyDtos.SupplyItemResponse;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InOrder;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * เทสระดับ service ของกฎที่ SSK-23 เพิ่มให้คลังอุปกรณ์ ไม่แตะ database ไม่ยก Spring context
 * <p>
 * สามเรื่องคือเพดาน maxStock การออกรหัส SKU ให้ของที่ไม่ได้กรอกรหัส และการลบของที่ยังไม่เคยถูกเบิก
 * ชุดนี้รันได้บนเครื่องที่ไม่มี Docker ส่วนรูปร่าง HTTP ของเรื่องเดียวกันอยู่ใน SupplyApiTest (รันใน CI)
 * <p>
 * ข้อความทุกประโยคตรงกับ validateSupplyItem และ validateRestockQuantity ใน
 * frontend/src/domain/maintenanceBoard.ts ตัวอักษรต่อตัวอักษร
 */
@ExtendWith(MockitoExtension.class)
class SupplyServiceTest {

    private static final ZoneId BANGKOK = ZoneId.of("Asia/Bangkok");

    /** 8 ต.ค. 2569 เวลา 10:00 ตามเวลาไทย ตัวเลขไม่มีความหมายพิเศษ ขอแค่นิ่ง */
    private static final Instant NOW = LocalDate.of(2026, 10, 8).atTime(10, 0).atZone(BANGKOK).toInstant();

    @Mock
    private SupplyItemRepository supplyRepository;

    @Mock
    private SupplyRestockRepository restockRepository;

    @Mock
    private MaintenanceSupplyUsageRepository usageRepository;

    private SupplyService supplyService;

    @BeforeEach
    void setUp() {
        supplyService = new SupplyService(supplyRepository, restockRepository, usageRepository,
                Clock.fixed(NOW, BANGKOK));
    }

    @Test
    @DisplayName("SSK-23 ไม่กรอก SKU ระบบออกรหัสจากหมวดกับ id ให้ สูตรเดียวกับที่หน้าเว็บเคยออกเอง")
    void blankSkuIsGeneratedFromTheCategoryAndId() {
        savedItemsGetId(4L);

        SupplyItemResponse created = supplyService.create(request("Copper Pipe Fittings", "  ", "Plumbing", 85, 30, 120));

        assertThat(created.sku()).isEqualTo("PL-004");
    }

    @Test
    @DisplayName("SSK-23 รหัสที่ระบบออกชนกับรหัสที่มีคนพิมพ์ไว้ ต้องต่อท้าย -2 ไม่ใช่ตอบ 409 ให้คนที่ไม่ได้กรอกรหัส")
    void generatedSkuSkipsACodeSomeoneTypedByHand() {
        savedItemsGetId(4L);
        when(supplyRepository.findBySku("PL-004")).thenReturn(Optional.of(item(2L, 1, 0, 10)));

        SupplyItemResponse created = supplyService.create(request("Copper Pipe Fittings", null, "Plumbing", 85, 30, 120));

        assertThat(created.sku()).isEqualTo("PL-004-2");
    }

    @Test
    @DisplayName("SSK-23 รหัสที่กรอกมาเองใช้ตามนั้น ไม่ถูกแทนด้วยรหัสที่ระบบออก")
    void typedSkuIsKept() {
        savedItemsGetId(1L);

        SupplyItemResponse created = supplyService.create(request("LED Bulbs 60W", " EL-001 ", "Electrical", 145, 50, 200));

        assertThat(created.sku()).isEqualTo("EL-001");
        // บันทึกรอบเดียว ไม่มีรอบที่สองสำหรับใส่รหัส
        verify(supplyRepository, times(1)).saveAndFlush(any());
    }

    @Test
    @DisplayName("SSK-23 ตัวนำหน้ารหัสคือสองอักษรละตินแรกของหมวด หมวดที่ไม่มีอักษรละตินได้ XX")
    void skuPrefixMatchesTheOldWebFormula() {
        assertThat(SupplyService.skuPrefix("Plumbing")).isEqualTo("PL");
        assertThat(SupplyService.skuPrefix("HVAC")).isEqualTo("HV");
        assertThat(SupplyService.skuPrefix("Other: Gardening tools")).isEqualTo("OT");
        assertThat(SupplyService.skuPrefix("3M tape")).isEqualTo("MT");
        assertThat(SupplyService.skuPrefix("ประปา")).isEqualTo("XX");
    }

    @Test
    @DisplayName("SSK-23 เพดานต่ำกว่าขั้นต่ำต้องถูกปฏิเสธก่อนบันทึก ด้วยประโยคเดียวกับหน้าเว็บ")
    void maximumBelowTheMinimumIsRejected() {
        assertThatThrownBy(() -> supplyService.create(request("Air Filters", null, "HVAC", 10, 50, 20)))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("Maximum stock cannot be lower than minimum stock");

        verify(supplyRepository, never()).saveAndFlush(any());
    }

    /**
     * QA เจอ LED Bulbs 60W มี 284 ชิ้นทั้งที่ตั้งเพดานไว้ 200 (SSK-111) ต้องกันทั้งตอนสร้างและตอนแก้
     * เพราะ PUT ตั้งจำนวนใหม่ได้ตรง ๆ
     */
    @Test
    @DisplayName("SSK-23 จำนวนคงเหลือเกินเพดานต้องถูกปฏิเสธทั้งตอนสร้างและตอนแก้")
    void quantityAboveTheMaximumIsRejectedOnCreateAndUpdate() {
        assertThatThrownBy(() -> supplyService.create(request("LED Bulbs 60W", null, "Electrical", 284, 50, 200)))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("Quantity cannot be higher than maximum stock");

        SupplyItem bulbs = item(1L, 145, 50, 200);
        when(supplyRepository.findById(1L)).thenReturn(Optional.of(bulbs));

        assertThatThrownBy(() -> supplyService.update(1L, request("LED Bulbs 60W", "EL-001", "Electrical", 284, 50, 200)))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("Quantity cannot be higher than maximum stock");
        // ค่าเดิมต้องไม่ถูกแตะ
        assertThat(bulbs.getStock()).isEqualTo(145);
    }

    @Test
    @DisplayName("SSK-23 เติมจนยอดรวมเกินเพดานต้องถูกปฏิเสธ ยอดเดิมไม่เปลี่ยนและไม่มีแถวประวัติการเติม")
    void restockAboveTheMaximumIsRejected() {
        SupplyItem bulbs = item(1L, 145, 50, 200);
        when(supplyRepository.findForUpdateById(1L)).thenReturn(Optional.of(bulbs));

        assertThatThrownBy(() -> supplyService.restock(1L, new BigDecimal("139")))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("Restocking 139 would bring the total to 284, above the maximum stock of 200");

        assertThat(bulbs.getStock()).isEqualTo(145);
        verify(restockRepository, never()).save(any());
    }

    @Test
    @DisplayName("SSK-23 เติมจนเท่าเพดานพอดีได้ เพราะเพดานคือค่าที่ยังรับได้")
    void restockUpToTheMaximumIsAllowed() {
        SupplyItem bulbs = item(1L, 145, 50, 200);
        when(supplyRepository.findForUpdateById(1L)).thenReturn(Optional.of(bulbs));
        when(supplyRepository.saveAndFlush(bulbs)).thenReturn(bulbs);

        SupplyItemResponse restocked = supplyService.restock(1L, new BigDecimal("55"));

        assertThat(restocked.stock()).isEqualTo(200);
        ArgumentCaptor<SupplyRestock> row = ArgumentCaptor.forClass(SupplyRestock.class);
        verify(restockRepository).save(row.capture());
        assertThat(row.getValue().getQuantity()).isEqualTo(55);
    }

    /**
     * ของนับเป็นชิ้น 2.5 ต้องได้ประโยคของตัวเอง ไม่ใช่ถูกปัดเป็น 2 เงียบ ๆ แบบที่ Jackson ทำกับ Integer
     * ส่วน 2.0 คือเลขจำนวนเต็มที่เขียนมีทศนิยม ต้องผ่าน
     */
    @Test
    @DisplayName("SSK-23 เติมเป็นทศนิยมต้องได้ 'must be a whole number' ส่วน 2.0 นับเป็น 2")
    void decimalRestockIsRejected() {
        SupplyItem bulbs = item(1L, 10, 5, 100);
        when(supplyRepository.findForUpdateById(1L)).thenReturn(Optional.of(bulbs));

        assertThatThrownBy(() -> supplyService.restock(1L, new BigDecimal("2.5")))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("The restock amount must be a whole number");
        // ติดลบเป็นทศนิยมเป็นเรื่อง "ไม่เกินศูนย์" ก่อน ประโยคเดียวกับศูนย์และไม่ส่งมา
        assertThatThrownBy(() -> supplyService.restock(1L, new BigDecimal("-2.5")))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("The restock amount must be greater than 0");
        assertThatThrownBy(() -> supplyService.restock(1L, null))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("The restock amount must be greater than 0");

        when(supplyRepository.saveAndFlush(bulbs)).thenReturn(bulbs);
        assertThat(supplyService.restock(1L, new BigDecimal("2.0")).stock()).isEqualTo(12);
    }

    @Test
    @DisplayName("SSK-23 ลบของที่เคยถูกเบิกในใบแจ้งซ่อมต้องได้ 409 ที่บอกให้ตั้งจำนวนเป็นศูนย์แทน")
    void deletingAnItemThatWasUsedIsAConflict() {
        SupplyItem filters = item(2L, 8, 20, 60);
        when(supplyRepository.findForUpdateById(2L)).thenReturn(Optional.of(filters));
        when(usageRepository.existsBySupplyId(2L)).thenReturn(true);

        assertThatThrownBy(() -> supplyService.delete(2L))
                .isInstanceOf(ConflictException.class)
                .hasMessage("This item has been used in maintenance tickets and cannot be deleted. "
                        + "Set its stock to 0 instead.");

        verify(restockRepository, never()).deleteBySupplyId(any());
        verify(supplyRepository, never()).delete(any());
    }

    @Test
    @DisplayName("SSK-23 ลบของที่ยังไม่เคยถูกเบิกได้ และประวัติการเติมของชิ้นนั้นต้องถูกลบก่อนตัวของ")
    void deletingAnUnusedItemAlsoRemovesItsRestocks() {
        SupplyItem fittings = item(3L, 85, 30, 120);
        when(supplyRepository.findForUpdateById(3L)).thenReturn(Optional.of(fittings));
        when(usageRepository.existsBySupplyId(3L)).thenReturn(false);

        supplyService.delete(3L);

        // supply_restock มี foreign key ไปที่ supply_item ต้องลบประวัติก่อน ไม่งั้นลบตัวของไม่ได้
        InOrder order = inOrder(restockRepository, supplyRepository);
        order.verify(restockRepository).deleteBySupplyId(3L);
        order.verify(supplyRepository).delete(fittings);
    }

    @Test
    @DisplayName("SSK-23 ลบของที่ไม่มีอยู่ต้องได้ 404 ที่บอก id")
    void deletingAMissingItemIsNotFound() {
        when(supplyRepository.findForUpdateById(999L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> supplyService.delete(999L))
                .isInstanceOf(NotFoundException.class)
                .hasMessage("No supply with id 999");
    }

    /** save คืนตัวเดิมที่ส่งเข้าไป และแถวที่ยังไม่มี id ได้ id ตามที่กำหนด เหมือนที่ database ใส่ให้ */
    private void savedItemsGetId(long id) {
        when(supplyRepository.saveAndFlush(any())).thenAnswer(call -> {
            SupplyItem saved = call.getArgument(0);
            if (saved.getId() == null) {
                ReflectionTestUtils.setField(saved, "id", id);
            }
            return saved;
        });
    }

    private static SupplyItemRequest request(String name, String sku, String category, int stock, int minStock,
            int maxStock) {
        return new SupplyItemRequest(name, sku, category, stock, minStock, maxStock);
    }

    private static SupplyItem item(Long id, int stock, int minStock, int maxStock) {
        SupplyItem item = new SupplyItem("item " + id, null, "Electrical", stock, minStock, maxStock);
        ReflectionTestUtils.setField(item, "id", id);
        return item;
    }
}
