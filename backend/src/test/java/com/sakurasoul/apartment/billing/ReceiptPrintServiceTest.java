package com.sakurasoul.apartment.billing;

import com.sakurasoul.apartment.billing.ReceiptDtos.PrintReceiptsRequest;
import com.sakurasoul.apartment.billing.ReceiptDtos.ReceiptResponse;
import com.sakurasoul.apartment.common.NotFoundException;
import com.sakurasoul.apartment.lease.BillingCycle;
import com.sakurasoul.apartment.lease.Lease;
import com.sakurasoul.apartment.lease.LeaseCharges;
import com.sakurasoul.apartment.pdf.PdfDocument;
import com.sakurasoul.apartment.room.Room;
import com.sakurasoul.apartment.room.RoomType;
import com.sakurasoul.apartment.tenant.Tenant;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.SimpleTransactionStatus;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * พิมพ์ใบเสร็จรวม (SSK-169) ระดับ service ปลอม repository กับการ render
 * พิสูจน์ว่าปฏิเสธก่อนโหลดหรือ render และส่งใบให้ render ตามลำดับผังตึก ไม่ใช่ลำดับที่ฐานข้อมูลคืนมา
 */
@ExtendWith(MockitoExtension.class)
class ReceiptPrintServiceTest {

    private static final LocalDate SEPTEMBER = LocalDate.of(2026, 9, 1);

    @Mock
    private ReceiptRepository receiptRepository;

    @Mock
    private ReceiptViews receiptViews;

    @Mock
    private ReceiptPdfService receiptPdfService;

    @Mock
    private PlatformTransactionManager transactionManager;

    private ReceiptPrintService service;
    private long nextId = 100;

    @BeforeEach
    void setUp() {
        when(transactionManager.getTransaction(any())).thenReturn(new SimpleTransactionStatus());
        service = new ReceiptPrintService(receiptRepository, receiptViews, receiptPdfService, transactionManager);
    }

    @Test
    @DisplayName("SSK-169 เดือนที่มีใบเกิน 100 ใบถูกปฏิเสธจากการนับ ไม่โหลดทั้งเดือนขึ้นมาและไม่ render")
    void aMonthOverTheLimitIsRejectedFromTheCount() {
        when(receiptRepository.countByBillingMonth(SEPTEMBER)).thenReturn(101L);

        assertThatThrownBy(() -> service.print(new PrintReceiptsRequest(null, "2026-09", null)))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("Choose at most 100 receipts");
        verify(receiptRepository, never()).findWithLeaseByBillingMonth(any());
        verify(receiptPdfService, never()).renderAll(anyList(), anyString());
    }

    @Test
    @DisplayName("SSK-169 เดือนที่มีพอดี 100 ใบพิมพ์ได้ เพดานนับรวมใบที่ 100")
    void aMonthOfExactlyTheLimitIsPrinted() {
        Receipt one = receipt("101", 1);
        when(receiptRepository.countByBillingMonth(SEPTEMBER)).thenReturn(100L);
        when(receiptRepository.findWithLeaseByBillingMonth(SEPTEMBER)).thenReturn(List.of(one));
        when(receiptViews.render(List.of(one))).thenReturn(List.of(mock(ReceiptResponse.class)));
        when(receiptPdfService.renderAll(anyList(), anyString())).thenReturn(new PdfDocument("x.pdf", new byte[] {1}));

        service.print(new PrintReceiptsRequest(null, "2026-09", null));

        verify(receiptPdfService).renderAll(anyList(), eq("receipts-2026-09.pdf"));
    }

    @Test
    @DisplayName("SSK-169 เดือนที่กรอง status แล้วยังเกิน 100 ใบก็ถูกปฏิเสธจากการนับ ไม่โหลดขึ้นมา")
    void aFilteredMonthOverTheLimitIsRejectedFromTheCount() {
        when(receiptRepository.countByBillingMonthAndStatus(SEPTEMBER, ReceiptStatus.PENDING)).thenReturn(101L);

        assertThatThrownBy(() -> service.print(new PrintReceiptsRequest(null, "2026-09", "PENDING")))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("Choose at most 100 receipts");
        verify(receiptRepository, never()).findWithLeaseByBillingMonthAndStatus(any(), any());
    }

    @Test
    @DisplayName("SSK-169 เดือนที่ไม่มีใบได้ 400 ไม่ทำ PDF เปล่า")
    void aMonthWithoutReceiptsIsRejected() {
        when(receiptRepository.countByBillingMonth(SEPTEMBER)).thenReturn(0L);

        assertThatThrownBy(() -> service.print(new PrintReceiptsRequest(null, "2026-09", null)))
                .hasMessage("No receipts to print for 2026-09");
        verify(receiptPdfService, never()).renderAll(anyList(), anyString());
    }

    @Test
    @DisplayName("SSK-169 ตัวกรอง status ใช้ทั้งตอนนับและตอนโหลด สองอย่างจึงตรงกับที่พิมพ์")
    void theStatusFilterIsUsedForTheCountAndTheLoad() {
        Receipt paid = receipt("101", 1);
        when(receiptRepository.countByBillingMonthAndStatus(SEPTEMBER, ReceiptStatus.PAID)).thenReturn(1L);
        when(receiptRepository.findWithLeaseByBillingMonthAndStatus(SEPTEMBER, ReceiptStatus.PAID))
                .thenReturn(List.of(paid));
        when(receiptViews.render(List.of(paid))).thenReturn(List.of(mock(ReceiptResponse.class)));
        when(receiptPdfService.renderAll(anyList(), anyString())).thenReturn(new PdfDocument("x.pdf", new byte[] {1}));

        service.print(new PrintReceiptsRequest(null, "2026-09", "PAID"));

        verify(receiptRepository, never()).countByBillingMonth(any());
        verify(receiptRepository, never()).findWithLeaseByBillingMonth(any());
        verify(receiptPdfService).renderAll(anyList(), eq("receipts-2026-09.pdf"));
    }

    @Test
    @DisplayName("SSK-169 บาง id ไม่มีได้ 404 บอกทุก id ที่ขาด ไม่พิมพ์ไฟล์ที่ไม่ครบ")
    void missingIdsAreAllReportedAndNothingIsRendered() {
        Receipt two = receipt("101", 1);
        ReflectionTestUtils.setField(two, "id", 2L);
        when(receiptRepository.findWithLeaseByIdIn(List.of(1L, 2L, 3L))).thenReturn(List.of(two));

        assertThatThrownBy(() -> service.print(new PrintReceiptsRequest(List.of(1L, 2L, 3L), null, null)))
                .isInstanceOf(NotFoundException.class)
                .hasMessage("Receipts not found: 1, 3");
        verify(receiptPdfService, never()).renderAll(anyList(), anyString());
    }

    @Test
    @DisplayName("SSK-169 ใบถูกส่งให้ render ตามลำดับผังตึก ไม่ใช่ลำดับที่ส่งมาหรือที่ฐานข้อมูลคืนมา")
    @SuppressWarnings("unchecked")
    void receiptsAreRenderedInBuildingOrder() {
        Receipt room201 = receipt("201", 2);
        Receipt room101 = receipt("101", 1);
        Receipt room102 = receipt("102", 1);
        List<Long> ids = List.of(room201.getId(), room101.getId(), room102.getId());
        when(receiptRepository.findWithLeaseByIdIn(ids)).thenReturn(List.of(room201, room101, room102));
        List<ReceiptResponse> responses = List.of(mock(ReceiptResponse.class), mock(ReceiptResponse.class),
                mock(ReceiptResponse.class));
        when(receiptViews.render(anyList())).thenReturn(responses);
        PdfDocument pdf = new PdfDocument("receipts.pdf", new byte[] {1, 2});
        when(receiptPdfService.renderAll(responses, "receipts.pdf")).thenReturn(pdf);

        assertThat(service.print(new PrintReceiptsRequest(ids, null, null))).isSameAs(pdf);

        ArgumentCaptor<List<Receipt>> rendered = ArgumentCaptor.forClass(List.class);
        verify(receiptViews).render(rendered.capture());
        assertThat(rendered.getValue()).containsExactly(room101, room102, room201);
    }

    private Receipt receipt(String roomNumber, int floor) {
        Room room = new Room(roomNumber, (short) floor, RoomType.SINGLE);
        Tenant tenant = new Tenant("มานี รักเรียน", "1500000000004", null, "081-000-0004", null);
        Lease lease = new Lease(room, tenant, LocalDate.of(2026, 1, 1), null, new BigDecimal("3500.00"),
                BillingCycle.MONTHLY, new LeaseCharges(new BigDecimal("7000.00"), new BigDecimal("9.50"),
                new BigDecimal("20.00"), new BigDecimal("350.00"), new BigDecimal("0.00")));
        Receipt receipt = Receipt.issue(lease, SEPTEMBER, BigDecimal.TEN, BigDecimal.ONE, LocalDate.of(2026, 10, 5),
                Instant.parse("2026-10-01T02:00:00Z"), Set.of(), Receipt.CarryForward.NONE);
        ReflectionTestUtils.setField(receipt, "id", nextId++);
        return receipt;
    }
}
