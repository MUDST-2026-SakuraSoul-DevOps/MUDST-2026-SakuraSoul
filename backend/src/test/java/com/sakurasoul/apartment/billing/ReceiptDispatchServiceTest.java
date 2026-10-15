package com.sakurasoul.apartment.billing;

import com.sakurasoul.apartment.billing.ReceiptDtos.ReceiptResponse;
import com.sakurasoul.apartment.billing.ReceiptDtos.SendReceiptsRequest;
import com.sakurasoul.apartment.billing.ReceiptDtos.SendReceiptsResponse;
import com.sakurasoul.apartment.billing.ReceiptDtos.SentReceipt;
import com.sakurasoul.apartment.billing.ReceiptDtos.SkipReason;
import com.sakurasoul.apartment.billing.ReceiptDtos.SkippedReceipt;
import com.sakurasoul.apartment.common.MailUnavailableException;
import com.sakurasoul.apartment.common.NotFoundException;
import com.sakurasoul.apartment.lease.BillingCycle;
import com.sakurasoul.apartment.lease.Lease;
import com.sakurasoul.apartment.lease.LeaseCharges;
import com.sakurasoul.apartment.pdf.PdfDocument;
import com.sakurasoul.apartment.room.Room;
import com.sakurasoul.apartment.room.RoomType;
import com.sakurasoul.apartment.tenant.Tenant;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mail.MailPreparationException;
import org.springframework.mail.MailSendException;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.SimpleTransactionStatus;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Optional;
import java.util.stream.LongStream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.tuple;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * กฎของการส่งใบเสร็จทางอีเมล (SSK-143) ระดับ logic ล้วน ปลอม repository ตัวทำ PDF และตัวส่งอีเมล
 * <p>
 * ชั้นนี้พิสูจน์กฎที่ต้องไล่ทีละกรณี เช่นเพดาน 100 ใบนับหลังตัดซ้ำ และการแยก 503 ออกจาก SEND_FAILED
 * ส่วนอีเมลที่ประกอบออกมาจริงกับการบันทึกลง PostgreSQL พิสูจน์ที่ ReceiptSendApiTest
 */
@ExtendWith(MockitoExtension.class)
class ReceiptDispatchServiceTest {

    private static final PdfDocument PDF = new PdfDocument("RC-2026-0001.pdf", new byte[] {'%', 'P', 'D', 'F'});

    @Mock
    private ReceiptRepository receiptRepository;

    @Mock
    private ReceiptPdfService receiptPdfService;

    @Mock
    private ReceiptMailer receiptMailer;

    @Mock
    private PlatformTransactionManager transactionManager;

    @Test
    @DisplayName("SSK-143 ไม่ส่ง receiptIds รายการว่าง หรือมีแต่ค่าว่าง ได้ข้อความให้เลือกอย่างน้อยหนึ่งใบ")
    void emptyRequestsAreRejected() {
        List<SendReceiptsRequest> emptyRequests = List.of(
                new SendReceiptsRequest(null),
                new SendReceiptsRequest(List.of()),
                new SendReceiptsRequest(Arrays.asList((Long) null)));

        assertThatThrownBy(() -> ReceiptDispatchService.requestedIds(null))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("Please choose at least one receipt");
        for (SendReceiptsRequest request : emptyRequests) {
            assertThatThrownBy(() -> ReceiptDispatchService.requestedIds(request))
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessage("Please choose at least one receipt");
        }
    }

    @Test
    @DisplayName("SSK-143 ส่งได้พอดี 100 ใบ ใบที่ 101 ได้ 400")
    void atMostOneHundredReceiptsPerRequest() {
        assertThat(ReceiptDispatchService.requestedIds(request(LongStream.rangeClosed(1, 100)))).hasSize(100);

        assertThatThrownBy(() -> ReceiptDispatchService.requestedIds(request(LongStream.rangeClosed(1, 101))))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("You can send at most 100 receipts at a time");
    }

    @Test
    @DisplayName("SSK-143 id ซ้ำนับเป็นใบเดียวก่อนเทียบเพดาน และลำดับตามตัวแรกที่ขอ")
    void duplicatesAreDroppedBeforeCountingAndOrderIsKept() {
        List<Long> hundredAndOneWithADuplicate = new ArrayList<>(LongStream.rangeClosed(1, 100).boxed().toList());
        hundredAndOneWithADuplicate.add(1L);

        assertThat(ReceiptDispatchService.requestedIds(new SendReceiptsRequest(hundredAndOneWithADuplicate)))
                .hasSize(100);
        assertThat(ReceiptDispatchService.requestedIds(new SendReceiptsRequest(List.of(3L, 1L, 3L, 2L))))
                .containsExactly(3L, 1L, 2L);
    }

    @Test
    @DisplayName("SSK-143 มี id ที่ไม่พบได้ 404 ก่อนส่งใบไหนทั้งนั้น")
    void unknownIdIsNotFoundBeforeAnythingIsSent() {
        openTransaction();
        Receipt known = receipt(1L, "somchai.j@example.com");
        when(receiptRepository.findWithLeaseByIdIn(List.of(1L, 9L))).thenReturn(List.of(known));

        assertThatThrownBy(() -> service().send(new SendReceiptsRequest(List.of(1L, 9L))))
                .isInstanceOf(NotFoundException.class)
                .hasMessage("No receipt with id 9");
        verify(receiptMailer, never()).send(any(), any());
    }

    @Test
    @DisplayName("SSK-143 ผู้เช่าไม่มีอีเมลถูกข้ามด้วย NO_EMAIL โดยไม่ render PDF และไม่เรียกตัวส่งอีเมล")
    void tenantWithoutEmailIsSkippedWithoutRenderingOrSending() {
        SendReceiptsResponse response = service().dispatch(List.of(target(1L, null)));

        assertThat(response.sent()).isEmpty();
        assertThat(response.skipped()).extracting(SkippedReceipt::receiptId, SkippedReceipt::reason)
                .containsExactly(tuple(1L, SkipReason.NO_EMAIL));
        verify(receiptPdfService, never()).render(anyLong());
        verify(receiptMailer, never()).send(any(), any());
    }

    @Test
    @DisplayName("SSK-143 ส่งสำเร็จแล้วบันทึกว่าส่งแล้วหนึ่งครั้ง คำตอบบอกจำนวนครั้งหลังนับแล้ว")
    void successfulSendIsRecorded() {
        openTransaction();
        Receipt stored = receipt(1L, "somchai.j@example.com");
        when(receiptPdfService.render(1L)).thenReturn(PDF);
        when(receiptRepository.findForUpdateById(1L)).thenReturn(Optional.of(stored));
        when(receiptRepository.saveAndFlush(stored)).thenReturn(stored);

        SendReceiptsResponse response = service().dispatch(List.of(target(1L, "somchai.j@example.com")));

        assertThat(response.skipped()).isEmpty();
        assertThat(response.sent()).singleElement().satisfies(sent -> {
            assertThat(sent.receiptId()).isEqualTo(1L);
            assertThat(sent.email()).isEqualTo("somchai.j@example.com");
            assertThat(sent.sentCount()).isEqualTo(1);
            assertThat(sent.sentAt()).isNotNull().isEqualTo(stored.getLastSentAt());
        });
        verify(receiptMailer).send(argThat(target -> target.id() == 1L), any());
    }

    @Test
    @DisplayName("SSK-143 เมลเซิร์ฟเวอร์ล่มตั้งแต่ใบแรกได้ MailUnavailableException และไม่มีใบไหนถูกบันทึก")
    void mailServerDownAtTheFirstReceiptThrowsAndRecordsNothing() {
        when(receiptPdfService.render(anyLong())).thenReturn(PDF);
        doThrow(new MailSendException("connection refused")).when(receiptMailer).send(any(), any());

        assertThatThrownBy(() -> service().dispatch(List.of(
                target(1L, "somchai.j@example.com"), target(2L, "piyada.s@example.com"))))
                .isInstanceOf(MailUnavailableException.class)
                .hasMessage("The mail server is not reachable. Please try again later");

        // ใบที่สองต้องไม่ถูกลองส่งต่อ และไม่มีใบไหนถูกนับว่าส่งแล้ว
        verify(receiptMailer, times(1)).send(any(), any());
        verify(receiptRepository, never()).findForUpdateById(anyLong());
    }

    @Test
    @DisplayName("SSK-143 เมลเซิร์ฟเวอร์ล่มหลังส่งใบแรกไปแล้ว ไม่โยน 503 แต่บอกใบที่เหลือเป็น SEND_FAILED")
    void failureAfterAFirstSendIsReportedPerReceipt() {
        openTransaction();
        Receipt first = receipt(1L, "somchai.j@example.com");
        when(receiptPdfService.render(anyLong())).thenReturn(PDF);
        when(receiptRepository.findForUpdateById(1L)).thenReturn(Optional.of(first));
        when(receiptRepository.saveAndFlush(first)).thenReturn(first);
        failWhenSending(2L, new MailSendException("connection reset"));

        SendReceiptsResponse response = service().dispatch(List.of(
                target(1L, "somchai.j@example.com"), target(2L, "piyada.s@example.com")));

        assertThat(response.sent()).extracting(SentReceipt::receiptId).containsExactly(1L);
        assertThat(response.skipped()).extracting(SkippedReceipt::receiptId, SkippedReceipt::reason)
                .containsExactly(tuple(2L, SkipReason.SEND_FAILED));
        verify(receiptRepository, never()).findForUpdateById(2L);
    }

    /**
     * ประกอบอีเมลของใบไหนไม่ได้ (เช่นอีเมลของผู้เช่าเป็นรูปแบบที่ JavaMail อ่านไม่ออก) เป็นปัญหาของใบนั้นใบเดียว
     * ถ้าตอบ 503 ผู้ใช้จะได้ข้อความว่าเมลเซิร์ฟเวอร์ล่มทั้งที่มันปกติดี และใบอื่นในคำขอจะไม่ถูกส่งไปด้วย
     */
    @Test
    @DisplayName("SSK-143 ประกอบอีเมลของใบแรกไม่ได้ ข้ามใบนั้นเป็น SEND_FAILED แล้วส่งใบถัดไปต่อ ไม่ตอบ 503")
    void aMessageThatCannotBeBuiltIsSkippedWithoutBlamingTheMailServer() {
        openTransaction();
        Receipt second = receipt(2L, "piyada.s@example.com");
        when(receiptPdfService.render(anyLong())).thenReturn(PDF);
        when(receiptRepository.findForUpdateById(2L)).thenReturn(Optional.of(second));
        when(receiptRepository.saveAndFlush(second)).thenReturn(second);
        failWhenSending(1L, new MailPreparationException("Illegal address"));

        SendReceiptsResponse response = service().dispatch(List.of(
                target(1L, "a,b@example.com"), target(2L, "piyada.s@example.com")));

        assertThat(response.skipped()).extracting(SkippedReceipt::receiptId, SkippedReceipt::reason)
                .containsExactly(tuple(1L, SkipReason.SEND_FAILED));
        assertThat(response.sent()).extracting(SentReceipt::receiptId).containsExactly(2L);
    }

    private ReceiptDispatchService service() {
        return new ReceiptDispatchService(receiptRepository, receiptPdfService, receiptMailer, transactionManager);
    }

    /**
     * ReceiptDispatchService ใช้ TransactionTemplate เอง (ดูคอมเมนต์ของคลาส) เทสชั้นนี้จึงต้องปลอม
     * transaction manager ให้คืนสถานะเปล่า ๆ แบบเดียวกับ ReceiptServiceTest
     */
    private void openTransaction() {
        when(transactionManager.getTransaction(any())).thenReturn(new SimpleTransactionStatus());
    }

    /**
     * ให้ตัวส่งอีเมลปลอมพังเฉพาะตอนส่งใบนี้ ใบอื่นส่งผ่าน
     * <p>
     * ใช้ doAnswer ที่เลือกเองว่าจะโยนไหม ไม่ใช้ doThrow คู่กับ argThat เพราะ strict stubs ของ Mockito
     * จะถือว่าการเรียกด้วยใบอื่นคือการใช้ stub ผิด (PotentialStubbingProblem) แล้วเทสพังด้วยเหตุผลที่ไม่เกี่ยว
     */
    private void failWhenSending(long receiptId, RuntimeException failure) {
        doAnswer(invocation -> {
            ReceiptResponse target = invocation.getArgument(0);
            if (target.id() == receiptId) {
                throw failure;
            }
            return null;
        }).when(receiptMailer).send(any(), any());
    }

    private static SendReceiptsRequest request(LongStream ids) {
        return new SendReceiptsRequest(ids.boxed().toList());
    }

    /** ใบเสร็จที่อ่านมาแล้วในรูปที่ dispatch ใช้ ยังไม่เคยส่ง */
    private static ReceiptResponse target(long id, String email) {
        return new ReceiptResponse(id, "RC-2026-000" + id, 1L, "101", "Tenant " + id, email, "2026-09",
                Instant.parse("2026-09-25T02:00:00Z"), LocalDate.of(2026, 10, 5), ReceiptStatus.PENDING,
                List.of(), new BigDecimal("5290.00"), null, null, null, 0);
    }

    /** entity ของใบเสร็จที่ repository ปลอมคืนให้ ผูกกับสัญญาที่มีผู้เช่าตามอีเมลที่ส่งมา */
    private static Receipt receipt(long id, String email) {
        Room room = new Room("101", (short) 1, RoomType.SINGLE);
        ReflectionTestUtils.setField(room, "id", 1L);
        Tenant tenant = new Tenant("Tenant " + id, "150000000000" + id, "tenant.t", "081-000-0000", email);
        ReflectionTestUtils.setField(tenant, "id", id);
        Lease lease = new Lease(room, tenant, LocalDate.of(2026, 9, 1), null, new BigDecimal("3500.00"),
                BillingCycle.MONTHLY, new LeaseCharges(new BigDecimal("7000.00"), new BigDecimal("9.50"),
                        new BigDecimal("20.00"), new BigDecimal("350.00"), new BigDecimal("0.00")));
        ReflectionTestUtils.setField(lease, "id", 1L);

        Receipt receipt = Receipt.issue(lease, LocalDate.of(2026, 9, 1), new BigDecimal("120"),
                new BigDecimal("15"), LocalDate.of(2026, 10, 5), Instant.parse("2026-09-25T02:00:00Z"));
        receipt.numberedAs("RC-2026-000" + id);
        ReflectionTestUtils.setField(receipt, "id", id);
        return receipt;
    }
}
