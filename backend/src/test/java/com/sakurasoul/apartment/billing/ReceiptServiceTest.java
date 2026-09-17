package com.sakurasoul.apartment.billing;

import com.sakurasoul.apartment.billing.ReceiptDtos.CreateReceiptRequest;
import com.sakurasoul.apartment.common.AppTime;
import com.sakurasoul.apartment.common.ConflictException;
import com.sakurasoul.apartment.lease.BillingCycle;
import com.sakurasoul.apartment.lease.Lease;
import com.sakurasoul.apartment.lease.LeaseCharges;
import com.sakurasoul.apartment.lease.LeaseRepository;
import com.sakurasoul.apartment.room.Room;
import com.sakurasoul.apartment.tenant.Tenant;
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
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
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

    @Mock
    private ReceiptRepository receiptRepository;

    @Mock
    private LeaseRepository leaseRepository;

    @Mock
    private PlatformTransactionManager transactionManager;

    @Test
    @DisplayName("ยอดแต่ละบรรทัดคิดจากอัตราที่ล็อกไว้กับสัญญา และยอดรวมเท่ากับผลบวกของบรรทัดที่พิมพ์")
    void issueComputesEveryLineFromTheLeaseRates() {
        Receipt receipt = Receipt.issue(lease(), SEPTEMBER,
                new BigDecimal("120"), new BigDecimal("15"),
                LocalDate.of(2026, 10, 5), Instant.now());

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
                LocalDate.of(2026, 10, 5), Instant.now());

        // หน่วยเองก็ถูกปัดก่อนคูณ เพราะคอลัมน์ที่เก็บเป็น NUMERIC(10,2) เหมือนกัน
        assertThat(receipt.getElectricUnits()).isEqualByComparingTo("12.35");
        assertThat(receipt.getElectricAmount()).isEqualByComparingTo("117.33");
        assertThat(receipt.getTotalAmount()).isEqualByComparingTo("3967.33");
    }

    @Test
    @DisplayName("ใบที่เพิ่งออกต้องเป็น PENDING และยังไม่มีวันที่ชำระ")
    void issueStartsPending() {
        Receipt receipt = Receipt.issue(lease(), SEPTEMBER, BigDecimal.ZERO, BigDecimal.ZERO,
                LocalDate.of(2026, 10, 5), Instant.now());

        assertThat(receipt.getStatus()).isEqualTo(ReceiptStatus.PENDING);
        assertThat(receipt.getPaidAt()).isNull();
        assertThat(receipt.getPaymentMethod()).isNull();
    }

    @Test
    @DisplayName("จ่ายซ้ำต้องได้ 409 และวันที่ชำระครั้งแรกต้องไม่ถูกเขียนทับ")
    void payingTwiceIsRejectedAndKeepsTheFirstPaymentDate() {
        Receipt receipt = Receipt.issue(lease(), SEPTEMBER, BigDecimal.ZERO, BigDecimal.ZERO,
                LocalDate.of(2026, 10, 5), Instant.now());
        Instant firstPayment = Instant.parse("2026-10-03T04:00:00Z");

        receipt.markPaid("เงินสด", firstPayment);

        assertThatThrownBy(() -> receipt.markPaid("โอนผ่านธนาคาร", Instant.now()))
                .isInstanceOf(ConflictException.class)
                .hasMessage("This receipt has already been paid");
        assertThat(receipt.getPaidAt()).isEqualTo(firstPayment);
        assertThat(receipt.getPaymentMethod()).isEqualTo("เงินสด");
    }

    @Test
    @DisplayName("เดือนที่เรียกเก็บเก็บเป็นวันที่ 1 เสมอ แต่ตอบกลับเป็น YYYY-MM")
    void billingMonthIsNormalisedToTheFirstDay() {
        Receipt receipt = Receipt.issue(lease(), LocalDate.of(2026, 9, 30),
                BigDecimal.ZERO, BigDecimal.ZERO, LocalDate.of(2026, 10, 5), Instant.now());

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
        when(leaseRepository.findById(7L)).thenReturn(Optional.of(lease));
        when(receiptRepository.existsByLeaseIdAndBillingMonth(7L, SEPTEMBER)).thenReturn(false);
        when(receiptRepository.countByReceiptNoStartingWith(any())).thenReturn(0L);
        when(receiptRepository.saveAndFlush(any(Receipt.class))).thenAnswer(call -> call.getArgument(0));

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
    @DisplayName("ออกใบของเดือนที่มีใบอยู่แล้วต้องได้ 409 และต้องไม่เขียนอะไรลงตาราง")
    void duplicateMonthIsRejectedBeforeSaving() {
        ReceiptService service = service();
        Lease lease = lease();
        ReflectionTestUtils.setField(lease, "id", 7L);

        openTransaction();
        when(leaseRepository.findById(7L)).thenReturn(Optional.of(lease));
        when(receiptRepository.existsByLeaseIdAndBillingMonth(7L, SEPTEMBER)).thenReturn(true);

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
        when(leaseRepository.findById(7L)).thenReturn(Optional.of(lease));

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

        when(receiptRepository.existsByLeaseIdAndBillingMonth(7L, SEPTEMBER)).thenReturn(false);
        when(receiptRepository.countByReceiptNoStartingWith(any())).thenReturn(0L);
        when(receiptRepository.saveAndFlush(any(Receipt.class))).thenAnswer(call -> call.getArgument(0));

        assertThat(service.create(new CreateReceiptRequest(7L, "2026-09",
                BigDecimal.ZERO, BigDecimal.ZERO, null)).billingMonth()).isEqualTo("2026-09");
    }

    private ReceiptService service() {
        return new ReceiptService(receiptRepository, leaseRepository, transactionManager);
    }

    /**
     * ReceiptService ใช้ TransactionTemplate เองเพื่อให้ลองออกเลขใหม่ได้เมื่อชนกัน
     * (ดูคอมเมนต์ที่ field transactions) เทสชั้นนี้จึงต้องปลอม transaction manager
     * ให้คืนสถานะเปล่า ๆ ไม่งั้น template จะไปเรียก commit บน null แล้วพังก่อนถึง logic
     */
    private void openTransaction() {
        when(transactionManager.getTransaction(any())).thenReturn(new SimpleTransactionStatus());
    }

    private static Lease lease() {
        Room room = new Room("101", (short) 1, RENT);
        ReflectionTestUtils.setField(room, "id", 1L);
        Tenant tenant = new Tenant("ยูกิ ทานากะ", "1500000000001", "yuki.t", "081-000-0000", null);
        ReflectionTestUtils.setField(tenant, "id", 1L);

        return new Lease(room, tenant, LocalDate.of(2026, 9, 1), null, RENT, BillingCycle.MONTHLY,
                new LeaseCharges(DEPOSIT, ELECTRIC_RATE, WATER_RATE, COMMON_AREA, INTERNET));
    }
}
