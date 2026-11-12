package com.sakurasoul.apartment.billing;

import com.sakurasoul.apartment.apartmentconfig.BankAccount;
import com.sakurasoul.apartment.billing.LeaseAccount.Settled;
import com.sakurasoul.apartment.billing.PaymentAllocator.Allocation;
import com.sakurasoul.apartment.billing.ReceiptDtos.ReceiptResponse;
import com.sakurasoul.apartment.lease.BillingCycle;
import com.sakurasoul.apartment.lease.Lease;
import com.sakurasoul.apartment.lease.LeaseCharges;
import com.sakurasoul.apartment.promptpay.PromptPayId;
import com.sakurasoul.apartment.room.Room;
import com.sakurasoul.apartment.room.RoomType;
import com.sakurasoul.apartment.tenant.Tenant;
import org.springframework.test.util.ReflectionTestUtils;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * ตัวอย่างในสัญญา API หัวข้อ "ใบเสร็จที่ตอบกลับ" ประกอบเป็น entity จริงในหน่วยความจำ ใช้ร่วมกันหลายเทส
 * <ul>
 *   <li>ใบ ต.ค. (RC-2026-0011) ค่าใช้จ่าย 5,000.00 ครบกำหนด 5 พ.ย. รับ 2,000.00 บนใบนั้น (การชำระ 30)</li>
 *   <li>ใบ พ.ย. (RC-2026-0012) ค่าใช้จ่าย 5,100.00 ยกมา 3,000.00 ดอกเบี้ย 1.50% เป็น 45.00 รวม 8,145.00 ครบกำหนด 5 ธ.ค.</li>
 *   <li>รับ 3,000.00 บนใบ พ.ย. (การชำระ 31) ตัดเข้าต้นเงินของใบ ต.ค. ทั้งก้อน ใบ ต.ค. จึงครบ</li>
 *   <li>ใบ พ.ย. มีสำเนาบัญชี {@link #BANK} (SSK-168) ใบ ต.ค. ออกก่อนตั้งบัญชีจึงไม่มี</li>
 * </ul>
 * ผู้เช่ามานี รักเรียน ห้อง 101 สัญญา id 4
 */
final class ContractExample {

    /** ก่อนวันครบกำหนดของใบ พ.ย. */
    static final LocalDate BEFORE_DUE = LocalDate.of(2026, 12, 3);

    /** บัญชีในตัวอย่างของสัญญา API หัวข้อบัญชีรับเงิน */
    static final BankAccount BANK = BankAccount.of("Kasikornbank", "Sakura Soul Apartment", "012-3-45678-9",
            PromptPayId.parse("0812345678"));

    final Receipt october;
    final Receipt november;
    final Payment onOctober;
    final Payment onNovember;

    ContractExample() {
        this(null, BANK);
    }

    /** @param novemberBank สำเนาบัญชีของใบ พ.ย. null คือออกตอนยังไม่ได้ตั้งบัญชี */
    ContractExample(BankAccount novemberBank) {
        this(null, novemberBank);
    }

    /** ใบ ต.ค. ที่มีสำเนาบัญชีด้วย ใช้พิสูจน์ว่าใบที่ครบแล้วหรือถูกยกยอดไม่แสดงบัญชีเพราะสถานะ ไม่ใช่เพราะไม่มีสำเนา */
    ContractExample(BankAccount octoberBank, BankAccount novemberBank) {
        Lease lease = lease();
        october = issue(lease, 11L, "RC-2026-0011", LocalDate.of(2026, 10, 1), "10", Receipt.CarryForward.NONE,
                Instant.parse("2026-11-01T02:00:00Z"), octoberBank);
        november = issue(lease, 12L, "RC-2026-0012", LocalDate.of(2026, 11, 1), "15",
                new Receipt.CarryForward(new BigDecimal("3000.00"), "RC-2026-0011", new BigDecimal("3000.00"),
                        new BigDecimal("1.50")),
                Instant.parse("2026-12-01T02:00:00Z"), novemberBank);
        october.carryTo(12L);
        onOctober = payment(30L, october, "2000.00", Instant.parse("2026-11-10T03:00:00Z"), null);
        onNovember = payment(31L, november, "3000.00", Instant.parse("2026-12-01T03:12:44.120Z"), "KBANK 0012");
        october.applySettlement(new BigDecimal("5000.00"), onNovember.getRecordedAt(), PaymentMethod.TRANSFER.label());
    }

    /** บัญชีตามสถานะตอนนี้ เงินที่ยังไม่ถูกยกเลิกทั้งหมดถูกตัดเข้าต้นเงินของใบ ต.ค. */
    LeaseAccount account() {
        BigDecimal settled = onNovember.isVoided() ? new BigDecimal("2000.00") : new BigDecimal("5000.00");
        return LeaseAccount.of(List.of(october, november), Map.of(11L, new Settled(BigDecimal.ZERO, settled)),
                List.of(onOctober, onNovember));
    }

    /** ขั้นที่สามของตัวอย่าง ยกเลิกการชำระบนใบ พ.ย. ใบ ต.ค. กลับไปค้าง 3,000.00 */
    void voidPaymentOnNovember() {
        Instant voidedAt = Instant.parse("2026-12-02T03:00:00Z");
        onNovember.voidAt(voidedAt);
        october.applySettlement(new BigDecimal("2000.00"), voidedAt, null);
    }

    ReceiptResponse responseOf(Receipt receipt) {
        return ReceiptResponse.of(receipt, account(), BEFORE_DUE);
    }

    /** การชำระบนบิลนี้ จ่ายวันเดียวกับที่บันทึก (เวลาไทย) ตัดเข้าต้นเงินของใบ ต.ค. ทั้งก้อนตามตัวอย่าง */
    private static Payment payment(long id, Receipt bill, String amount, Instant recordedAt, String reference) {
        BigDecimal money = new BigDecimal(amount);
        Payment payment = Payment.record(bill, money, LocalDate.ofInstant(recordedAt, ZoneId.of("Asia/Bangkok")),
                PaymentMethod.TRANSFER, reference, null, recordedAt, List.of(new Allocation(11L, BigDecimal.ZERO, money)));
        ReflectionTestUtils.setField(payment, "id", id);
        return payment;
    }

    /** ค่าเช่า 3,500 ส่วนกลาง 350 ไฟ 100 หน่วย x 9.50 น้ำ x 20: น้ำ 10 หน่วยได้ 5,000.00 น้ำ 15 หน่วยได้ 5,100.00 */
    private static Receipt issue(Lease lease, Long id, String receiptNo, LocalDate month, String waterUnits,
            Receipt.CarryForward carry, Instant issuedAt, BankAccount bank) {
        Receipt receipt = Receipt.issue(lease, month, new BigDecimal("100"), new BigDecimal(waterUnits),
                month.plusMonths(1).withDayOfMonth(5), issuedAt, Set.of(), carry);
        receipt.payableTo(bank);
        receipt.numberedAs(receiptNo);
        ReflectionTestUtils.setField(receipt, "id", id);
        return receipt;
    }

    private static Lease lease() {
        Room room = new Room("101", (short) 1, RoomType.SINGLE);
        Tenant tenant = new Tenant("มานี รักเรียน", "1500000000004", null, "081-000-0004", "manee@example.com");
        Lease lease = new Lease(room, tenant, LocalDate.of(2026, 1, 1), null, new BigDecimal("3500.00"),
                BillingCycle.MONTHLY, new LeaseCharges(new BigDecimal("7000.00"), new BigDecimal("9.50"),
                new BigDecimal("20.00"), new BigDecimal("350.00"), new BigDecimal("0.00")));
        ReflectionTestUtils.setField(lease, "id", 4L);
        return lease;
    }
}
