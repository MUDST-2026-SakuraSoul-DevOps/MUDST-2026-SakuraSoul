package com.sakurasoul.apartment.billing;

import com.sakurasoul.apartment.apartmentconfig.ApartmentConfig;
import com.sakurasoul.apartment.apartmentconfig.ApartmentConfigRepository;
import com.sakurasoul.apartment.apartmentconfig.BankAccount;
import com.sakurasoul.apartment.billing.ReceiptDtos.CreateReceiptRequest;
import com.sakurasoul.apartment.billing.ReceiptDtos.ReceiptItem;
import com.sakurasoul.apartment.billing.ReceiptDtos.ReceiptResponse;
import com.sakurasoul.apartment.billing.ReceiptDtos.UpdateReceiptRequest;
import com.sakurasoul.apartment.common.AppTime;
import com.sakurasoul.apartment.common.ConflictException;
import com.sakurasoul.apartment.extracharge.ChargeRecurrence;
import com.sakurasoul.apartment.extracharge.ExtraChargeTerms;
import com.sakurasoul.apartment.extracharge.RoomExtraCharge;
import com.sakurasoul.apartment.lease.BillingCycle;
import com.sakurasoul.apartment.lease.Lease;
import com.sakurasoul.apartment.lease.LeaseCharges;
import com.sakurasoul.apartment.lease.LeaseRepository;
import com.sakurasoul.apartment.promptpay.PromptPayId;
import com.sakurasoul.apartment.room.Room;
import com.sakurasoul.apartment.room.RoomType;
import com.sakurasoul.apartment.tenant.Tenant;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.invocation.InvocationOnMock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.SimpleTransactionStatus;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.List;
import java.util.Optional;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * เทสของ US-10 "ออกใบเสร็จ" (SSK-16) ระดับ logic ล้วน ปลอม repository ทั้งหมด
 * <p>
 * สิ่งที่ชั้นนี้พิสูจน์ได้คือสูตรคิดเงิน การปัดเศษ การออกเลขที่ตามลำดับของปี และวันครบกำหนด
 * ตั้งต้น ส่วนการกันออกใบซ้ำเดือนของจริงอยู่ที่ constraint receipt_lease_month_uk
 * ใน PostgreSQL ซึ่งพิสูจน์ที่ ReceiptApiTest แทน เพราะ repository ปลอมจับ race ไม่ได้
 * <p>
 * เหตุผลเดียวกับที่ LeaseServiceTest แยกจาก LeaseOverlapIntegrationTest
 */
@ExtendWith(MockitoExtension.class)
class ReceiptServiceTest {

    private static final LocalDate SEPTEMBER = LocalDate.of(2026, 9, 1);

    /** อัตราที่ "ล็อกไว้กับสัญญา" ตั้งใจให้ต่างจากอัตราตั้งต้นของตึกทุกตัว */
    private static final BigDecimal RENT = new BigDecimal("3500.00");
    private static final BigDecimal DEPOSIT = new BigDecimal("7000.00");
    private static final BigDecimal ELECTRIC_RATE = new BigDecimal("9.50");
    private static final BigDecimal WATER_RATE = new BigDecimal("20.00");
    private static final BigDecimal COMMON_AREA = new BigDecimal("350.00");
    private static final BigDecimal INTERNET = new BigDecimal("0.00");

    /** ค่าใช้จ่ายพิเศษที่ leaseWithExtraCharges ตกลงไว้ */
    private static final long PARKING = 31L;
    private static final long KEY_CARD = 32L;

    @Mock
    private ReceiptRepository receiptRepository;

    @Mock
    private ReceiptLineRepository receiptLineRepository;

    @Mock
    private LeaseRepository leaseRepository;

    @Mock
    private PlatformTransactionManager transactionManager;

    /** ไม่ stub คือยังไม่มีการชำระ ใบทุกใบยังไม่ถูกตัด */
    @Mock
    private PaymentRepository paymentRepository;

    @Mock
    private PaymentAllocationRepository paymentAllocationRepository;

    /** ไม่ stub คือไม่มีแถวค่าตั้ง (Mockito คืน Optional ว่าง) ใบที่ออกจึงไม่มีสำเนาบัญชี */
    @Mock
    private ApartmentConfigRepository apartmentConfigRepository;

    @Test
    @DisplayName("ยอดแต่ละบรรทัดคิดจากอัตราที่ล็อกไว้กับสัญญา และยอดรวมเท่ากับผลบวกของบรรทัดที่พิมพ์")
    void issueComputesEveryLineFromTheLeaseRates() {
        Receipt receipt = Receipt.issue(lease(), SEPTEMBER,
                new BigDecimal("120"), new BigDecimal("15"),
                LocalDate.of(2026, 10, 5), Instant.now(), Set.of(), Receipt.CarryForward.NONE);

        assertThat(receipt.getElectricAmount()).isEqualByComparingTo("1140.00");
        assertThat(receipt.getWaterAmount()).isEqualByComparingTo("300.00");

        // 3500 ค่าเช่า + 350 ส่วนกลาง + 0 อินเทอร์เน็ต + 1140 ค่าไฟ + 300 ค่าน้ำ
        assertThat(receipt.getTotalAmount()).isEqualByComparingTo("5290.00");
        assertThat(receipt.getTotalAmount()).isEqualByComparingTo(
                receipt.getMonthlyRent()
                        .add(receipt.getCommonAreaFee())
                        .add(receipt.getInternetFee())
                        .add(receipt.getElectricAmount())
                        .add(receipt.getWaterAmount()));
    }

    /**
     * ปัดทีละบรรทัดก่อนบวก ไม่ใช่บวกดิบแล้วปัดทีเดียวตอนท้าย
     * <p>
     * 12.345 หน่วย x 9.50 = 117.2775 ปัดครึ่งขึ้นเหลือ 117.28 ซึ่งเป็นเลขที่ถูกพิมพ์
     * ลงใบเสร็จ ถ้าเก็บทศนิยมเต็มไว้แล้วไปปัดตอนรวม ผลรวมบนกระดาษจะไม่เท่ากับ
     * ผลบวกของตัวเลขที่อยู่เหนือมันเอง ซึ่งผู้เช่ากดเครื่องคิดเลขตามแล้วจะเจอทันที
     */
    @Test
    @DisplayName("หน่วยที่มีเศษต้องปัดครึ่งขึ้นเหลือสองตำแหน่งทีละบรรทัดก่อนนำไปรวม")
    void issueRoundsEachLineHalfUpBeforeAdding() {
        Receipt receipt = Receipt.issue(lease(), SEPTEMBER,
                new BigDecimal("12.345"), new BigDecimal("0"),
                LocalDate.of(2026, 10, 5), Instant.now(), Set.of(), Receipt.CarryForward.NONE);

        // หน่วยเองก็ถูกปัดก่อนคูณ เพราะคอลัมน์ที่เก็บเป็น NUMERIC(10,2) เหมือนกัน
        assertThat(receipt.getElectricUnits()).isEqualByComparingTo("12.35");
        assertThat(receipt.getElectricAmount()).isEqualByComparingTo("117.33");
        assertThat(receipt.getTotalAmount()).isEqualByComparingTo("3967.33");
    }

    @Test
    @DisplayName("ใบที่เพิ่งออกต้องเป็น PENDING และยังไม่มีวันที่ชำระ")
    void issueStartsPending() {
        Receipt receipt = Receipt.issue(lease(), SEPTEMBER, BigDecimal.ZERO, BigDecimal.ZERO,
                LocalDate.of(2026, 10, 5), Instant.now(), Set.of(), Receipt.CarryForward.NONE);

        assertThat(receipt.getStatus()).isEqualTo(ReceiptStatus.PENDING);
        assertThat(receipt.getPaidAt()).isNull();
        assertThat(receipt.getPaymentMethod()).isNull();
    }

    @Test
    @DisplayName("เดือนที่เรียกเก็บเก็บเป็นวันที่ 1 เสมอ แต่ตอบกลับเป็น YYYY-MM")
    void billingMonthIsNormalisedToTheFirstDay() {
        Receipt receipt = Receipt.issue(lease(), LocalDate.of(2026, 9, 30),
                BigDecimal.ZERO, BigDecimal.ZERO, LocalDate.of(2026, 10, 5), Instant.now(), Set.of(), Receipt.CarryForward.NONE);

        assertThat(receipt.getBillingMonth()).isEqualTo(LocalDate.of(2026, 9, 1));
        assertThat(receipt.billingMonthText()).isEqualTo("2026-09");
    }

    @Test
    @DisplayName("ไม่ส่งวันครบกำหนดมาต้องตกไปเป็นวันที่ 5 ของเดือนถัดไป รวมถึงตอนข้ามปี")
    void defaultDueDateIsTheFifthOfTheNextMonth() {
        assertThat(ReceiptService.defaultDueDate(LocalDate.of(2026, 9, 1)))
                .isEqualTo(LocalDate.of(2026, 10, 5));
        assertThat(ReceiptService.defaultDueDate(LocalDate.of(2026, 12, 1)))
                .isEqualTo(LocalDate.of(2027, 1, 5));
    }

    @Test
    @DisplayName("เดือนที่รูปแบบไม่ใช่ YYYY-MM ต้องได้ข้อความไทยที่หน้าเว็บเอาไปโชว์ใต้ฟอร์มได้")
    void badMonthFormatIsRejectedWithAThaiMessage() {
        assertThat(ReceiptService.parseBillingMonth("2026-09")).isEqualTo(LocalDate.of(2026, 9, 1));

        // เดือนหลักเดียวไม่ผ่าน เพราะความยาวไม่คงที่ทำให้เรียงสตริงข้ามเดือนไม่ได้
        assertThatThrownBy(() -> ReceiptService.parseBillingMonth("2026-9"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("The billing month must be in YYYY-MM format");
        assertThatThrownBy(() -> ReceiptService.parseBillingMonth("กันยายน 2569"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("The billing month must be in YYYY-MM format");
    }

    /**
     * เลขที่เป็นลำดับ "ต่อปี" ไม่ใช่ลำดับต่อเนื่องตลอดกาล ขึ้นปีใหม่ต้องกลับไปเริ่มที่ 0001
     * <p>
     * นับด้วย prefix ของปีปัจจุบันเสมอ ปีจึงมาจาก AppTime (เวลาไทย) ไม่ใช่ UTC
     * เทสจึงประกอบ prefix ที่คาดหวังจาก AppTime เหมือนกัน ไม่ได้ปักปีไว้ในเทส
     * ซึ่งจะกลายเป็นเทสที่พังเองตอนขึ้นปีใหม่
     */
    @Test
    @DisplayName("เลขที่ใบเสร็จเป็นลำดับสี่หลักของปีนั้น นับจากใบที่ออกไปแล้วในปีเดียวกัน")
    void receiptNumberIsAFourDigitSequencePerYear() {
        String prefix = "RC-" + AppTime.today().getYear() + "-";
        ReceiptService service = service();

        when(receiptRepository.countByReceiptNoStartingWith(prefix)).thenReturn(0L);
        assertThat(service.nextReceiptNo()).isEqualTo(prefix + "0001");

        when(receiptRepository.countByReceiptNoStartingWith(prefix)).thenReturn(12L);
        assertThat(service.nextReceiptNo()).isEqualTo(prefix + "0013");

        when(receiptRepository.countByReceiptNoStartingWith(prefix)).thenReturn(9999L);
        assertThat(service.nextReceiptNo()).isEqualTo(prefix + "10000");
    }

    @Test
    @DisplayName("ออกใบเสร็จสำเร็จต้องติดเลขที่ให้ก่อนบันทึก และคิดเงินจากอัตราของสัญญาใบนั้น")
    void createNumbersTheReceiptBeforeSaving() {
        ReceiptService service = service();
        Lease lease = lease();
        ReflectionTestUtils.setField(lease, "id", 7L);

        openTransaction();
        when(leaseRepository.findForUpdateById(7L)).thenReturn(Optional.of(lease));
        when(receiptRepository.countByReceiptNoStartingWith(any())).thenReturn(0L);
        when(receiptRepository.saveAndFlush(any(Receipt.class))).thenAnswer(ReceiptServiceTest::savedWithId);

        service.create(new CreateReceiptRequest(7L, "2026-09",
                new BigDecimal("120"), new BigDecimal("15"), null));

        ArgumentCaptor<Receipt> saved = ArgumentCaptor.forClass(Receipt.class);
        verify(receiptRepository).saveAndFlush(saved.capture());
        assertThat(saved.getValue().getReceiptNo())
                .isEqualTo("RC-" + AppTime.today().getYear() + "-0001");
        assertThat(saved.getValue().getTotalAmount()).isEqualByComparingTo("5290.00");
        assertThat(saved.getValue().getDueDate()).isEqualTo(LocalDate.of(2026, 10, 5));
    }

    @Test
    @DisplayName("SSK-168 ออกใบตอนตั้งบัญชีรับเงินไว้ ใบได้สำเนาของบัญชีนั้น ไม่ใช่ instance เดียวกับค่าตั้ง")
    void createCopiesTheCurrentBankAccountOntoTheReceipt() {
        ReceiptService service = service();
        Lease lease = lease();
        ReflectionTestUtils.setField(lease, "id", 7L);
        BankAccount current = BankAccount.of("Kasikornbank", "Sakura Soul Apartment", "012-3-45678-9",
                PromptPayId.parse("0812345678"));
        ApartmentConfig config = mock(ApartmentConfig.class);
        when(config.getBankAccount()).thenReturn(current);
        when(apartmentConfigRepository.findById((short) 1)).thenReturn(Optional.of(config));

        openTransaction();
        when(leaseRepository.findForUpdateById(7L)).thenReturn(Optional.of(lease));
        when(receiptRepository.saveAndFlush(any(Receipt.class))).thenAnswer(ReceiptServiceTest::savedWithId);

        ReceiptResponse response = service.create(new CreateReceiptRequest(7L, "2026-09",
                new BigDecimal("120"), new BigDecimal("15"), null));

        ArgumentCaptor<Receipt> saved = ArgumentCaptor.forClass(Receipt.class);
        verify(receiptRepository).saveAndFlush(saved.capture());
        assertThat(saved.getValue().getBankAccount()).isEqualTo(current).isNotSameAs(current);
        // ยอดใน QR พึ่งบัญชีของทั้งสัญญา ซึ่ง ReceiptResponseTest กับ PromptPayApiTest เทสแทน
        assertThat(response.bank().promptPayId()).isEqualTo("0812345678");
    }

    @Test
    @DisplayName("SSK-168 ยังไม่ได้ตั้งบัญชี (หรือไม่มีแถวค่าตั้ง) ออกใบได้ตามปกติ ไม่มีสำเนาบัญชีและไม่มี QR")
    void createWithoutABankAccountIssuesNormally() {
        ReceiptService service = service();
        Lease lease = lease();
        ReflectionTestUtils.setField(lease, "id", 7L);

        openTransaction();
        when(leaseRepository.findForUpdateById(7L)).thenReturn(Optional.of(lease));
        when(receiptRepository.saveAndFlush(any(Receipt.class))).thenAnswer(ReceiptServiceTest::savedWithId);

        ReceiptResponse response = service.create(new CreateReceiptRequest(7L, "2026-09",
                new BigDecimal("120"), new BigDecimal("15"), null));

        assertThat(response.bank()).isNull();
        assertThat(response.promptPayPayload()).isNull();
        assertThat(response.totalAmount()).isEqualByComparingTo("5290.00");
        verify(apartmentConfigRepository).findById((short) 1);
    }

    @Test
    @DisplayName("ออกใบของเดือนที่มีใบอยู่แล้วต้องได้ 409 และต้องไม่เขียนอะไรลงตาราง")
    void duplicateMonthIsRejectedBeforeSaving() {
        ReceiptService service = service();
        Lease lease = lease();
        ReflectionTestUtils.setField(lease, "id", 7L);

        openTransaction();
        when(leaseRepository.findForUpdateById(7L)).thenReturn(Optional.of(lease));
        when(receiptRepository.findByLeaseIdForUpdate(7L)).thenReturn(List.of(issued(lease, SEPTEMBER, 41L)));

        assertThatThrownBy(() -> service.create(new CreateReceiptRequest(7L, "2026-09",
                BigDecimal.ZERO, BigDecimal.ZERO, null)))
                .isInstanceOf(ConflictException.class)
                .hasMessage("A receipt for this month has already been issued for this lease");

        verify(receiptRepository, never()).saveAndFlush(any(Receipt.class));
    }

    /**
     * ใบเสร็จลบไม่ได้แก้ไม่ได้ (ไม่มี endpoint ลบโดยตั้งใจ ส่วนใบลดหนี้ยังไม่ได้ตกลงกัน)
     * เดือนที่พิมพ์ผิดจึงต้องถูกปฏิเสธตั้งแต่ตอนออก ไม่ใช่ปล่อยให้ได้ใบที่เก็บเงินเดือนที่
     * ผู้เช่าไม่ได้อยู่ ค้างอยู่ในลำดับเลขที่ถาวร
     * <p>
     * แต่ต้องไม่เลยเถิดไปห้ามเดือนที่อยู่ไม่เต็มเดือน สัญญาที่ปิดวันที่ 30 ก.ย. ยังต้องออกใบ
     * ของเดือนกันยายนได้ เพราะเป็นใบสุดท้ายที่แอดมินต้องเก็บเงินจริง
     */
    @Test
    @DisplayName("เดือนที่อยู่นอกช่วงสัญญาต้องได้ 400 ส่วนเดือนสุดท้ายของสัญญาที่ปิดแล้วยังออกใบได้")
    void billingMonthOutsideTheLeasePeriodIsRejected() {
        ReceiptService service = service();
        Lease lease = lease();
        ReflectionTestUtils.setField(lease, "id", 7L);
        lease.terminate(LocalDate.of(2026, 9, 30));

        openTransaction();
        when(leaseRepository.findForUpdateById(7L)).thenReturn(Optional.of(lease));

        // เดือนก่อนเริ่มสัญญา และเดือนหลังผู้เช่าย้ายออกไปแล้ว
        assertThatThrownBy(() -> service.create(new CreateReceiptRequest(7L, "2025-01",
                BigDecimal.ZERO, BigDecimal.ZERO, null)))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("The billing month is outside the lease period");
        assertThatThrownBy(() -> service.create(new CreateReceiptRequest(7L, "2026-10",
                BigDecimal.ZERO, BigDecimal.ZERO, null)))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("The billing month is outside the lease period");
        verify(receiptRepository, never()).saveAndFlush(any(Receipt.class));

        when(receiptRepository.countByReceiptNoStartingWith(any())).thenReturn(0L);
        when(receiptRepository.saveAndFlush(any(Receipt.class))).thenAnswer(ReceiptServiceTest::savedWithId);

        assertThat(service.create(new CreateReceiptRequest(7L, "2026-09",
                BigDecimal.ZERO, BigDecimal.ZERO, null)).billingMonth()).isEqualTo("2026-09");
    }

    @Test
    @DisplayName("ออกใบของเดือนในอนาคตต้องได้ 400")
    void createRejectsFutureMonth() {
        ReceiptService service = service();
        Lease lease = lease();
        ReflectionTestUtils.setField(lease, "id", 7L);

        openTransaction();
        when(leaseRepository.findForUpdateById(7L)).thenReturn(Optional.of(lease));

        String futureMonth = AppTime.today().plusMonths(1).toString().substring(0, 7);
        assertThatThrownBy(() -> service.create(new CreateReceiptRequest(7L, futureMonth,
                BigDecimal.ZERO, BigDecimal.ZERO, null)))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("The billing month cannot be in the future");

        verify(receiptRepository, never()).saveAndFlush(any(Receipt.class));
    }

    @Test
    @DisplayName("แก้ไขใบเสร็จที่รอชำระ ต้องคิดยอดใหม่ด้วยอัตราเดิมที่ snapshot ไว้ และเลขที่ใบเสร็จต้องไม่เปลี่ยน")
    void updateRecalculatesUsingSnapshottedRates() {
        ReceiptService service = service();
        Lease lease = lease();
        ReflectionTestUtils.setField(lease, "id", 7L);

        Receipt receipt = Receipt.issue(lease, SEPTEMBER, new BigDecimal("100"), new BigDecimal("10"),
                LocalDate.of(2026, 10, 5), Instant.now(), Set.of(), Receipt.CarryForward.NONE);
        receipt.numberedAs("RC-2026-0001");
        ReflectionTestUtils.setField(receipt, "id", 42L);

        lockForUpdate(42L, lease, receipt);
        when(receiptRepository.saveAndFlush(any(Receipt.class))).thenAnswer(ReceiptServiceTest::savedWithId);

        // อัตราเดิม: ค่าเช่า 3500, ส่วนกลาง 350, ไฟ 9.50, น้ำ 20
        // แก้ไขเป็น: ไฟ 120 (1140), น้ำ 15 (300) -> รวม 5290
        ReceiptResponse response = service.update(42L, new UpdateReceiptRequest("2026-09",
                new BigDecimal("120"), new BigDecimal("15")));

        assertThat(response.receiptNo()).isEqualTo("RC-2026-0001");
        assertThat(response.totalAmount()).isEqualByComparingTo("5290.00");
        assertThat(receipt.getElectricUnits()).isEqualByComparingTo("120.00");
        assertThat(receipt.getWaterUnits()).isEqualByComparingTo("15.00");
    }

    @Test
    @DisplayName("SSK-163 แก้ไขใบเสร็จที่มีการชำระต้องได้ 409")
    void updateRejectsAReceiptWithPayments() {
        ReceiptService service = service();
        Lease lease = lease();
        ReflectionTestUtils.setField(lease, "id", 7L);

        Receipt receipt = issued(lease, SEPTEMBER, 42L);
        BigDecimal half = new BigDecimal("1000.00");
        Payment payment = Payment.record(receipt, half, LocalDate.of(2026, 10, 3), PaymentMethod.CASH, null, null,
                Instant.parse("2026-10-03T03:00:00Z"), List.of(new PaymentAllocator.Allocation(42L, BigDecimal.ZERO, half)));
        ReflectionTestUtils.setField(payment, "id", 30L);
        receipt.applySettlement(half, payment.getRecordedAt(), PaymentMethod.CASH.label());

        lockForUpdate(42L, lease, receipt);
        when(paymentRepository.findByLeaseIdOrderByIdAsc(7L)).thenReturn(List.of(payment));
        when(paymentAllocationRepository.sumActiveByLeaseIds(Set.of(7L))).thenReturn(List.of(settled(42L, half)));

        assertThatThrownBy(() -> service.update(42L, new UpdateReceiptRequest("2026-09",
                BigDecimal.TEN, BigDecimal.TEN)))
                .isInstanceOf(ConflictException.class)
                .hasMessage("Receipts with payments cannot be edited");

        verify(receiptRepository, never()).saveAndFlush(any(Receipt.class));
    }

    @Test
    @DisplayName("SSK-164 แก้ไขใบที่ถูกยกยอดไปบิลใหม่แล้วต้องได้ 409 พร้อมเลขที่บิลที่รับยอดไป")
    void updateRejectsACarriedReceipt() {
        ReceiptService service = service();
        Lease lease = lease();
        ReflectionTestUtils.setField(lease, "id", 7L);
        Receipt september = issued(lease, SEPTEMBER, 42L);
        Receipt october = carriedInto(lease, september, 43L);

        lockForUpdate(42L, lease, september, october);

        assertThatThrownBy(() -> service.update(42L, new UpdateReceiptRequest("2026-09",
                BigDecimal.TEN, BigDecimal.TEN)))
                .isInstanceOf(ConflictException.class)
                .hasMessage("This receipt was carried into RC-2026-0043 and can no longer be edited");
        verify(receiptRepository, never()).saveAndFlush(any(Receipt.class));
    }

    /** ใบที่ไม่ใช่ใบล่าสุด ไม่ถูกยกยอด และไม่มีการชำระ เกิดได้ทางเดียวคือใบยอดศูนย์ที่ PAID ตั้งแต่ออก */
    @Test
    @DisplayName("SSK-164 แก้ไขใบที่มีใบของเดือนหลังกว่าแล้วต้องได้ 409 ข้อความเดียวกับการออกใบย้อนเดือน")
    void updateRejectsAReceiptThatIsNotTheLatest() {
        ReceiptService service = service();
        Lease base = lease();
        Lease free = new Lease(base.getRoom(), base.getTenant(), LocalDate.of(2026, 9, 1), null,
                BigDecimal.ZERO, BillingCycle.MONTHLY, new LeaseCharges(BigDecimal.ZERO, BigDecimal.ZERO,
                BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO));
        ReflectionTestUtils.setField(free, "id", 7L);
        Receipt september = issued(free, SEPTEMBER, 42L);
        Receipt october = issued(free, LocalDate.of(2026, 10, 1), 43L);

        lockForUpdate(42L, free, september, october);

        assertThatThrownBy(() -> service.update(42L, new UpdateReceiptRequest("2026-09",
                BigDecimal.TEN, BigDecimal.TEN)))
                .isInstanceOf(ConflictException.class)
                .hasMessage("A receipt for a later month (2026-10) has already been issued for this lease");
    }

    @Test
    @DisplayName("SSK-164 แก้เดือนของใบล่าสุดไปไว้ก่อนใบก่อนหน้าของสัญญาไม่ได้ ใบต้องเรียงตามเดือน")
    void updateKeepsTheReceiptsOfALeaseInMonthOrder() {
        ReceiptService service = service();
        Lease base = lease();
        Lease lease = new Lease(base.getRoom(), base.getTenant(), LocalDate.of(2026, 1, 1), null, RENT,
                BillingCycle.MONTHLY, new LeaseCharges(DEPOSIT, ELECTRIC_RATE, WATER_RATE, COMMON_AREA, INTERNET));
        ReflectionTestUtils.setField(lease, "id", 7L);
        // ใบ ก.ย. ตัดครบก่อนออกใบ ต.ค. จึงไม่ถูกยกยอด ใบ ต.ค. เป็นใบล่าสุดที่แก้ได้
        Receipt september = issued(lease, SEPTEMBER, 42L);
        Payment payment = paidInFull(september, 30L);
        Receipt october = issued(lease, LocalDate.of(2026, 10, 1), 43L);

        lockForUpdate(43L, lease, september, october);
        when(paymentRepository.findByLeaseIdOrderByIdAsc(7L)).thenReturn(List.of(payment));
        when(paymentAllocationRepository.sumActiveByLeaseIds(Set.of(7L)))
                .thenReturn(List.of(settled(42L, september.ownAmount())));

        assertThatThrownBy(() -> service.update(43L, new UpdateReceiptRequest("2026-08",
                BigDecimal.TEN, BigDecimal.TEN)))
                .isInstanceOf(ConflictException.class)
                .hasMessage("The billing month must be after the previous receipt of this lease (2026-09)");
        verify(receiptRepository, never()).saveAndFlush(any(Receipt.class));
    }

    @Test
    @DisplayName("แก้ไขเป็นเดือนในอนาคตต้องได้ 400")
    void updateRejectsFutureMonth() {
        ReceiptService service = service();
        Lease lease = lease();
        ReflectionTestUtils.setField(lease, "id", 7L);

        Receipt receipt = Receipt.issue(lease, SEPTEMBER, BigDecimal.ZERO, BigDecimal.ZERO,
                LocalDate.of(2026, 10, 5), Instant.now(), Set.of(), Receipt.CarryForward.NONE);
        ReflectionTestUtils.setField(receipt, "id", 42L);

        lockForUpdate(42L, lease, receipt);

        String futureMonth = AppTime.today().plusMonths(1).toString().substring(0, 7);
        assertThatThrownBy(() -> service.update(42L, new UpdateReceiptRequest(futureMonth,
                BigDecimal.ZERO, BigDecimal.ZERO)))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("The billing month cannot be in the future");

        verify(receiptRepository, never()).saveAndFlush(any(Receipt.class));
    }

    @Test
    @DisplayName("แก้ไขเดือนไปชนกับเดือนที่มีใบอยู่แล้วของสัญญาเดียวกันต้องได้ 409")
    void updateRejectsDuplicateMonth() {
        ReceiptService service = service();
        Lease baseLease = lease();
        Lease lease = new Lease(baseLease.getRoom(), baseLease.getTenant(), LocalDate.of(2026, 1, 1), null, RENT, BillingCycle.MONTHLY,
                new LeaseCharges(DEPOSIT, ELECTRIC_RATE, WATER_RATE, COMMON_AREA, INTERNET));
        ReflectionTestUtils.setField(lease, "id", 7L);

        Receipt receipt = Receipt.issue(lease, SEPTEMBER, BigDecimal.ZERO, BigDecimal.ZERO,
                LocalDate.of(2026, 10, 5), Instant.now(), Set.of(), Receipt.CarryForward.NONE);
        ReflectionTestUtils.setField(receipt, "id", 42L);

        // ใบ ส.ค. ตัดครบแล้ว ใบ ก.ย. จึงเป็นใบล่าสุดที่ยังไม่ถูกยกยอด
        Receipt august = issued(lease, LocalDate.of(2026, 8, 1), 41L);
        Payment payment = paidInFull(august, 30L);
        lockForUpdate(42L, lease, august, receipt);
        when(paymentRepository.findByLeaseIdOrderByIdAsc(7L)).thenReturn(List.of(payment));
        when(paymentAllocationRepository.sumActiveByLeaseIds(Set.of(7L)))
                .thenReturn(List.of(settled(41L, august.ownAmount())));

        assertThatThrownBy(() -> service.update(42L, new UpdateReceiptRequest("2026-08",
                BigDecimal.ZERO, BigDecimal.ZERO)))
                .isInstanceOf(ConflictException.class)
                .hasMessage("A receipt for this month has already been issued for this lease");

        verify(receiptRepository, never()).saveAndFlush(any(Receipt.class));
    }

    @Test
    @DisplayName("SSK-164 ออกใบใหม่ ยอดค้างของใบเดิมเป็นยอดยกมา ใบเดิมชี้มาที่ใบใหม่ สัญญาไม่คิดดอกเบี้ยจึงไม่มีดอกเบี้ย")
    void issuingCarriesTheUnpaidReceiptsIntoTheNewBill() {
        ReceiptService service = service();
        Lease lease = lease();
        ReflectionTestUtils.setField(lease, "id", 7L);
        Receipt september = issued(lease, SEPTEMBER, 42L);

        openTransaction();
        when(leaseRepository.findForUpdateById(7L)).thenReturn(Optional.of(lease));
        when(receiptRepository.findByLeaseIdForUpdate(7L)).thenReturn(List.of(september));
        when(receiptRepository.countByReceiptNoStartingWith(any())).thenReturn(42L);
        when(receiptRepository.saveAndFlush(any(Receipt.class))).thenAnswer(ReceiptServiceTest::savedWithId);

        service.create(new CreateReceiptRequest(7L, "2026-10", new BigDecimal("100"), new BigDecimal("10"), null));

        ArgumentCaptor<Receipt> saved = ArgumentCaptor.forClass(Receipt.class);
        verify(receiptRepository).saveAndFlush(saved.capture());
        Receipt october = saved.getValue();
        assertThat(october.getPreviousBalance()).isEqualByComparingTo(september.getTotalAmount());
        assertThat(october.getPreviousBalanceReceipts()).isEqualTo("RC-2026-0042");
        assertThat(october.getInterestAmount()).isEqualByComparingTo("0.00");
        assertThat(october.getTotalAmount()).isEqualByComparingTo(
                october.chargesAmount().add(september.getTotalAmount()));
        assertThat(september.getCarriedToReceiptId()).isEqualTo(october.getId());
        verify(receiptRepository).flush();
    }

    @Test
    @DisplayName("SSK-164 ออกใบของเดือนที่เก่ากว่าใบล่าสุดของสัญญาต้องได้ 409 ใบต้องออกตามลำดับเดือน")
    void issuingAnEarlierMonthIsRejected() {
        ReceiptService service = service();
        Lease lease = lease();
        ReflectionTestUtils.setField(lease, "id", 7L);

        openTransaction();
        when(leaseRepository.findForUpdateById(7L)).thenReturn(Optional.of(lease));
        when(receiptRepository.findByLeaseIdForUpdate(7L))
                .thenReturn(List.of(issued(lease, LocalDate.of(2026, 10, 1), 43L)));

        assertThatThrownBy(() -> service.create(new CreateReceiptRequest(7L, "2026-09",
                BigDecimal.ZERO, BigDecimal.ZERO, null)))
                .isInstanceOf(ConflictException.class)
                .hasMessage("A receipt for a later month (2026-10) has already been issued for this lease");
        verify(receiptRepository, never()).saveAndFlush(any(Receipt.class));
    }

    @Test
    @DisplayName("SSK-165 ค่าใช้จ่ายพิเศษที่ถึงรอบต่อท้ายห้าบรรทัดมาตรฐาน และยอดรวมนับบรรทัดเหล่านั้นด้วย")
    void issueAppendsTheDueExtraCharges() {
        Receipt receipt = Receipt.issue(leaseWithExtraCharges(), SEPTEMBER,
                new BigDecimal("120"), new BigDecimal("15"), LocalDate.of(2026, 10, 5), Instant.now(), Set.of(), Receipt.CarryForward.NONE);

        // 5290 ของห้าบรรทัดมาตรฐาน (ดู issueComputesEveryLineFromTheLeaseRates) + ที่จอดรถ 500 + ค่าทำกุญแจ 200
        assertThat(receipt.getTotalAmount()).isEqualByComparingTo("5990.00");
        List<ReceiptItem> items = ReceiptResponse.itemsOf(receipt);
        assertThat(items).extracting(ReceiptItem::item).containsExactly(
                "Room rent", "Common area fee", "Internet", "Electricity", "Water", "Parking", "Key card");
        assertThat(items.get(0).chargeId()).isNull();
        assertThat(items.get(5)).isEqualTo(
                new ReceiptItem("Parking", "Monthly", null, null, null, new BigDecimal("500.00"), PARKING));
        assertThat(items.get(6).detail()).isEqualTo("One-time");
    }

    @Test
    @DisplayName("SSK-165 ค่าครั้งเดียวที่บิลก่อนของสัญญาเก็บไปแล้วไม่ถูกเก็บซ้ำ")
    void issueSkipsOneTimeChargesAlreadyBilled() {
        Receipt receipt = Receipt.issue(leaseWithExtraCharges(), SEPTEMBER,
                new BigDecimal("120"), new BigDecimal("15"), LocalDate.of(2026, 10, 5), Instant.now(),
                Set.of(KEY_CARD), Receipt.CarryForward.NONE);

        assertThat(receipt.getLines()).extracting(ReceiptLine::getChargeId).containsExactly(PARKING);
        assertThat(receipt.getTotalAmount()).isEqualByComparingTo("5790.00");
    }

    @Test
    @DisplayName("SSK-165 ออกใบผ่าน service ต้องส่งค่าครั้งเดียวที่สัญญานี้เคยเก็บแล้วไปให้ใบใหม่")
    void createPassesTheOneTimeChargesAlreadyBilledToTheLease() {
        ReceiptService service = service();
        Lease lease = leaseWithExtraCharges();
        ReflectionTestUtils.setField(lease, "id", 7L);

        openTransaction();
        when(leaseRepository.findForUpdateById(7L)).thenReturn(Optional.of(lease));
        when(receiptLineRepository.findChargeIdsBilledToLease(7L, ChargeRecurrence.ONE_TIME))
                .thenReturn(Set.of(KEY_CARD));
        when(receiptRepository.saveAndFlush(any(Receipt.class))).thenAnswer(ReceiptServiceTest::savedWithId);

        ReceiptResponse response = service.create(new CreateReceiptRequest(7L, "2026-09",
                new BigDecimal("120"), new BigDecimal("15"), null));

        assertThat(response.items()).extracting(ReceiptItem::chargeId).containsExactly(
                null, null, null, null, null, PARKING);
        assertThat(response.totalAmount()).isEqualByComparingTo("5790.00");
    }

    /**
     * สองใบของสัญญาเดียวกันคนละเดือนออกพร้อมกัน ทั้งคู่อ่านได้ว่ายังไม่เคยเก็บค่าทำกุญแจ ใบที่บันทึกทีหลังชน
     * receipt_line_one_time_uk ต้องลองใหม่เอง ไม่ใช่ตอบ 409 รอบหน้าอ่านเจอว่าเก็บไปแล้ว จึงได้ใบที่ไม่มีบรรทัดนั้น
     */
    @Test
    @DisplayName("SSK-165 ชนกันที่ค่าครั้งเดียวต้องลองออกใหม่ และใบที่ได้ไม่เก็บค่านั้นซ้ำ")
    void createRetriesWhenAnotherBillTookTheOneTimeCharge() {
        ReceiptService service = service();
        Lease lease = leaseWithExtraCharges();
        ReflectionTestUtils.setField(lease, "id", 7L);

        openTransaction();
        when(leaseRepository.findForUpdateById(7L)).thenReturn(Optional.of(lease));
        when(receiptLineRepository.findChargeIdsBilledToLease(7L, ChargeRecurrence.ONE_TIME))
                .thenReturn(Set.of())
                .thenReturn(Set.of(KEY_CARD));
        when(receiptRepository.saveAndFlush(any(Receipt.class)))
                .thenThrow(new DataIntegrityViolationException(
                        "duplicate key value violates unique constraint \"receipt_line_one_time_uk\""))
                .thenAnswer(ReceiptServiceTest::savedWithId);

        ReceiptResponse response = service.create(new CreateReceiptRequest(7L, "2026-09",
                new BigDecimal("120"), new BigDecimal("15"), null));

        verify(receiptRepository, times(2)).saveAndFlush(any(Receipt.class));
        assertThat(response.items()).extracting(ReceiptItem::item).doesNotContain("Key card");
    }

    @Test
    @DisplayName("constraint อื่นที่ลองใหม่ก็ไม่ผ่านต้องโยนต่อทันทีโดยไม่ลองซ้ำ")
    void createDoesNotRetryOtherConstraints() {
        ReceiptService service = service();
        Lease lease = lease();
        ReflectionTestUtils.setField(lease, "id", 7L);

        openTransaction();
        when(leaseRepository.findForUpdateById(7L)).thenReturn(Optional.of(lease));
        when(receiptRepository.saveAndFlush(any(Receipt.class))).thenThrow(new DataIntegrityViolationException(
                "duplicate key value violates unique constraint \"receipt_lease_month_uk\""));

        assertThatThrownBy(() -> service.create(new CreateReceiptRequest(7L, "2026-09",
                BigDecimal.ZERO, BigDecimal.ZERO, null)))
                .isInstanceOf(DataIntegrityViolationException.class);
        verify(receiptRepository, times(1)).saveAndFlush(any(Receipt.class));
    }

    /**
     * การแก้ใบ (SSK-155) เดิมคิดยอดรวมจากห้าบรรทัดมาตรฐานเท่านั้น ถ้าไม่ได้รวมสูตรไว้ที่เดียว
     * แก้หน่วยไฟของใบที่มีค่าที่จอดรถแล้วยอด 500 จะหายไปจากยอดรวมเงียบ ๆ ทั้งที่บรรทัดยังโชว์อยู่
     */
    @Test
    @DisplayName("SSK-165 แก้หน่วยของใบที่มีค่าใช้จ่ายพิเศษ บรรทัดยังอยู่และยังรวมในยอดใหม่")
    void updateKeepsTheExtraChargesInTheTotal() {
        ReceiptService service = service();
        Lease lease = leaseWithExtraCharges();
        ReflectionTestUtils.setField(lease, "id", 7L);
        Receipt receipt = Receipt.issue(lease, SEPTEMBER, new BigDecimal("100"), new BigDecimal("10"),
                LocalDate.of(2026, 10, 5), Instant.now(), Set.of(KEY_CARD), Receipt.CarryForward.NONE);
        ReflectionTestUtils.setField(receipt, "id", 42L);

        lockForUpdate(42L, lease, receipt);
        when(receiptRepository.saveAndFlush(any(Receipt.class))).thenAnswer(ReceiptServiceTest::savedWithId);

        ReceiptResponse response = service.update(42L, new UpdateReceiptRequest("2026-09",
                new BigDecimal("120"), new BigDecimal("15")));

        assertThat(response.totalAmount()).isEqualByComparingTo("5790.00");
        assertThat(response.items()).extracting(ReceiptItem::item).endsWith("Parking");
    }

    private ReceiptService service() {
        LeaseAccounts accounts =
                new LeaseAccounts(leaseRepository, receiptRepository, paymentRepository, paymentAllocationRepository);
        ReceiptViews views = new ReceiptViews(accounts,
                Clock.fixed(Instant.parse("2026-10-10T03:00:00Z"), ZoneId.of("Asia/Bangkok")));
        return new ReceiptService(receiptRepository, receiptLineRepository, accounts, views,
                apartmentConfigRepository, transactionManager);
    }

    /** การแก้ใบอ่าน lease_id ของใบ แล้วล็อกสัญญา 7 พร้อมใบเหล่านี้ แบบที่ LeaseAccounts.lock อ่านจากฐาน */
    private void lockForUpdate(long editedId, Lease lease, Receipt... receipts) {
        when(receiptRepository.findLeaseIdById(editedId)).thenReturn(Optional.of(7L));
        when(leaseRepository.findForUpdateById(7L)).thenReturn(Optional.of(lease));
        when(receiptRepository.findByLeaseIdForUpdate(7L)).thenReturn(List.of(receipts));
    }

    /** ใบที่ออกไปแล้วของเดือนนั้น ไม่มียอดยกมา เลขที่ตาม id */
    private static Receipt issued(Lease lease, LocalDate month, long id) {
        Receipt receipt = Receipt.issue(lease, month, new BigDecimal("100"), new BigDecimal("10"),
                month.plusMonths(1).withDayOfMonth(5), Instant.parse("2026-10-01T02:00:00Z"), Set.of(),
                Receipt.CarryForward.NONE);
        receipt.numberedAs("RC-2026-%04d".formatted(id));
        ReflectionTestUtils.setField(receipt, "id", id);
        return receipt;
    }

    /** ใบเดือนถัดไปที่ยกยอดค้างทั้งใบของใบก่อนมา อัตราดอกเบี้ย 0 แล้วชี้ใบก่อนมาที่ใบนี้ */
    private static Receipt carriedInto(Lease lease, Receipt earlier, long id) {
        LocalDate month = earlier.getBillingMonth().plusMonths(1);
        Receipt receipt = Receipt.issue(lease, month, new BigDecimal("100"), new BigDecimal("10"),
                month.plusMonths(1).withDayOfMonth(5), Instant.parse("2026-11-01T02:00:00Z"), Set.of(),
                new Receipt.CarryForward(earlier.ownAmount(), earlier.getReceiptNo(), earlier.ownAmount(), BigDecimal.ZERO));
        receipt.numberedAs("RC-2026-%04d".formatted(id));
        ReflectionTestUtils.setField(receipt, "id", id);
        earlier.carryTo(id);
        return receipt;
    }

    /** รับเงินเต็มยอดของใบนี้บนใบนี้เอง ตัดเข้าต้นเงินทั้งก้อน แล้วใบเป็น PAID */
    private static Payment paidInFull(Receipt receipt, long paymentId) {
        Payment payment = Payment.record(receipt, receipt.ownAmount(), receipt.getDueDate().minusDays(2),
                PaymentMethod.CASH, null, null, receipt.getIssuedAt().plusSeconds(86_400),
                List.of(new PaymentAllocator.Allocation(receipt.getId(), BigDecimal.ZERO, receipt.ownAmount())));
        ReflectionTestUtils.setField(payment, "id", paymentId);
        receipt.applySettlement(receipt.ownAmount(), payment.getRecordedAt(), PaymentMethod.CASH.label());
        return payment;
    }

    /** ผลรวมการตัดยอดของใบหนึ่งแบบที่ PaymentAllocationRepository คืน ต้นเงินทั้งก้อน */
    private static PaymentAllocationRepository.SettledRow settled(long receiptId, BigDecimal principal) {
        return new PaymentAllocationRepository.SettledRow() {
            @Override
            public Long getReceiptId() {
                return receiptId;
            }

            @Override
            public BigDecimal getInterest() {
                return BigDecimal.ZERO;
            }

            @Override
            public BigDecimal getPrincipal() {
                return principal;
            }
        };
    }

    /**
     * ReceiptService ใช้ TransactionTemplate เองเพื่อให้ลองออกเลขใหม่ได้เมื่อชนกัน
     * (ดูคอมเมนต์ที่ field transactions) เทสชั้นนี้จึงต้องปลอม transaction manager
     * ให้คืนสถานะเปล่า ๆ ไม่งั้น template จะไปเรียก commit บน null แล้วพังก่อนถึง logic
     */
    private void openTransaction() {
        when(transactionManager.getTransaction(any())).thenReturn(new SimpleTransactionStatus());
    }

    /** บันทึกแบบที่ฐานข้อมูลทำ ใบใหม่ได้ id ใบที่มี id อยู่แล้วคง id เดิม */
    private static Receipt savedWithId(InvocationOnMock call) {
        Receipt receipt = call.getArgument(0);
        if (receipt.getId() == null) {
            ReflectionTestUtils.setField(receipt, "id", 99L);
        }
        return receipt;
    }

    private static Lease lease() {
        Room room = new Room("101", (short) 1, RoomType.SINGLE);
        ReflectionTestUtils.setField(room, "id", 1L);
        Tenant tenant = new Tenant("ยูกิ ทานากะ", "1500000000001", "yuki.t", "081-000-0000", null);
        ReflectionTestUtils.setField(tenant, "id", 1L);

        return new Lease(room, tenant, LocalDate.of(2026, 9, 1), null, RENT, BillingCycle.MONTHLY,
                new LeaseCharges(DEPOSIT, ELECTRIC_RATE, WATER_RATE, COMMON_AREA, INTERNET));
    }

    /** สัญญาที่ตกลงค่าที่จอดรถรายเดือน 500 กับค่าทำกุญแจครั้งเดียว 200 ไว้ ทั้งคู่เริ่มเดือนกันยายน */
    private static Lease leaseWithExtraCharges() {
        Lease lease = lease();
        lease.agreeExtraCharges(List.of(
                roomCharge(lease.getRoom(), PARKING, "Parking", "500", ChargeRecurrence.MONTHLY),
                roomCharge(lease.getRoom(), KEY_CARD, "Key card", "200", ChargeRecurrence.ONE_TIME)));
        return lease;
    }

    private static RoomExtraCharge roomCharge(Room room, long id, String label, String amount,
            ChargeRecurrence recurrence) {
        RoomExtraCharge charge = new RoomExtraCharge(room, new ExtraChargeTerms(label, new BigDecimal(amount),
                recurrence, YearMonth.of(2026, 9), null), true);
        ReflectionTestUtils.setField(charge, "id", id);
        return charge;
    }
}
