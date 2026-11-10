package com.sakurasoul.apartment.billing;

import com.sakurasoul.apartment.billing.PaymentAllocator.Allocation;
import com.sakurasoul.apartment.billing.PaymentDtos.PaymentResponse;
import com.sakurasoul.apartment.billing.PaymentDtos.RecordPaymentRequest;
import com.sakurasoul.apartment.billing.ReceiptDtos.ReceiptResponse;
import com.sakurasoul.apartment.common.ConflictException;
import com.sakurasoul.apartment.common.NotFoundException;
import com.sakurasoul.apartment.pdf.DocumentFormat;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

/**
 * รับชำระ (SSK-163) ตามสัญญา API หัวข้อ "รับชำระ"
 * <p>
 * เงินถูกบันทึกบนใบล่าสุดของสัญญาเท่านั้น แล้วตัดเข้าใบที่ค้างแบบ FIFO ข้ามใบ ภายในใบเดียวกันตัดดอกเบี้ยก่อนต้นเงิน
 * (PaymentAllocator) ใบที่ถูกตัดเปลี่ยนสถานะตามยอดที่ถูกตัดทั้งหมด (Receipt.applySettlement)
 * ทุกการตัดสินใจทำภายใต้ล็อกของสัญญา (LeaseAccounts.lock) สองคำขอของสัญญาเดียวกันจึงเข้าทีละคำขอ
 * และคำขอหลังเห็นยอดหลังคำขอแรกเสมอ ไม่ว่าคำขอจะเข้า pod ไหน
 */
@Service
public class PaymentService {

    private final LeaseAccounts leaseAccounts;
    private final ReceiptRepository receiptRepository;
    private final PaymentRepository paymentRepository;
    private final ReceiptViews receiptViews;

    /** เวลาที่บันทึกกับ "วันนี้" ตามเวลาไทย อ่านจากนาฬิกาครั้งเดียวต่อคำขอ ดู config.SchedulingConfig */
    private final Clock clock;

    public PaymentService(LeaseAccounts leaseAccounts, ReceiptRepository receiptRepository,
            PaymentRepository paymentRepository, ReceiptViews receiptViews, Clock clock) {
        this.leaseAccounts = leaseAccounts;
        this.receiptRepository = receiptRepository;
        this.paymentRepository = paymentRepository;
        this.receiptViews = receiptViews;
        this.clock = clock;
    }

    /**
     * POST /api/receipts/{id}/payments ตอบบิลนี้หลังตัดยอด การชำระที่เพิ่งบันทึกเป็นตัวสุดท้ายของ payments
     * <p>
     * ลำดับการตรวจตามสัญญา: ไม่พบใบ 404 → ไม่ใช่ใบล่าสุด 409 → จ่ายครบแล้ว 409 → ค่าในคำขอ 400 → เกินยอด 400
     */
    @Transactional
    public ReceiptResponse record(Long receiptId, RecordPaymentRequest request) {
        LeaseAccount account = lockAccountOf(receiptId);
        Receipt bill = payableBill(account, receiptId);

        Instant now = clock.instant();
        PaymentRules.Valid payment = PaymentRules.check(request, LocalDate.ofInstant(now, clock.getZone()));
        BigDecimal balanceDue = account.balanceDue();
        if (payment.amount().compareTo(balanceDue) > 0) {
            throw new IllegalArgumentException(
                    "The amount is more than the balance due of " + DocumentFormat.money(balanceDue));
        }

        settle(account, bill, payment, now, payment.method().label());
        return receiptViews.render(bill);
    }

    /**
     * POST /api/receipts/{id}/pay แบบเดิม รับเท่ายอดที่ต้องจ่ายทั้งหมดในครั้งเดียว กฎเดียวกับ record
     * <p>
     * ข้อความช่องทางที่ส่งมาเป็นข้อความอิสระ จึงเก็บใน note ของการชำระ ช่องทางเป็น OTHER
     * ส่วน paymentMethod ของใบที่ถูกตัดครบยังเป็นข้อความเดิมที่ส่งมา อีเมลแบบ "Paid on … (Cash)" จึงอ่านเหมือนเดิม
     */
    @Transactional
    public ReceiptResponse payInFull(Long receiptId, String paymentMethodText) {
        LeaseAccount account = lockAccountOf(receiptId);
        Receipt bill = payableBill(account, receiptId);

        String text = PaymentRules.payInFullText(paymentMethodText);
        Instant now = clock.instant();
        PaymentRules.Valid payment = new PaymentRules.Valid(account.balanceDue(),
                LocalDate.ofInstant(now, clock.getZone()), PaymentMethod.OTHER, null, text);

        settle(account, bill, payment, now, text);
        return receiptViews.render(bill);
    }

    /**
     * POST /api/payments/{id}/void ยกเลิกการชำระ ตอบบิลที่การชำระนั้นอยู่หลังคืนยอด
     * <p>
     * ยกเลิกได้เฉพาะก้อนล่าสุดของสัญญาที่ยังไม่ถูกยกเลิก และบิลที่บันทึกไว้ต้องยังเป็นใบล่าสุด เพราะยอดยกมาของบิลใหม่
     * ถูกแช่แข็งจากยอดหลังรับเงินก้อนนั้นแล้ว ถ้าคืนยอดให้ใบเก่า สองใบจะไม่ตรงกัน
     * ย้อนทีละก้อนจากล่าสุดทำให้ทุกยอดกลับไปตรงกับก่อนรับชำระทุกสตางค์ เพราะการคืนยอดคือการไม่นับแถวของก้อนนั้น
     * ไม่ใช่เลขคณิตย้อนกลับ
     * <p>
     * ลำดับการตรวจ: ไม่พบ 404 → ยกเลิกแล้ว 409 → บิลไม่ใช่ใบล่าสุดแล้ว 409 → ไม่ใช่ก้อนล่าสุด 409
     */
    @Transactional
    public ReceiptResponse voidPayment(Long paymentId) {
        Long leaseId = paymentRepository.findLeaseIdById(paymentId)
                .orElseThrow(() -> new NotFoundException("payment", paymentId));
        LeaseAccount account = leaseAccounts.lock(leaseId);
        Payment payment = account.payment(paymentId);
        if (payment.isVoided()) {
            throw new ConflictException("This payment has already been voided");
        }
        Receipt bill = account.receipt(payment.getReceiptId());
        if (!account.isLatest(bill)) {
            throw new ConflictException(newerBillMessage(account, bill));
        }
        if (!account.latestActivePayment().map(latest -> latest.getId().equals(paymentId)).orElse(false)) {
            throw new ConflictException("Only the most recent payment of this lease can be voided");
        }

        payment.voidAt(clock.instant());
        for (PaymentAllocation allocation : payment.getAllocations()) {
            Receipt receipt = account.receipt(allocation.getReceiptId());
            receipt.applySettlement(account.settledAmount(receipt).subtract(allocation.total()),
                    payment.getVoidedAt(), null);
        }
        paymentRepository.flush();
        return receiptViews.render(bill);
    }

    /** GET /api/receipts/{id}/payments การชำระที่บันทึกบนบิลนี้ รวมที่ยกเลิก เรียงตามลำดับที่บันทึก */
    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public List<PaymentResponse> paymentsOn(Long receiptId) {
        if (!receiptRepository.existsById(receiptId)) {
            throw new NotFoundException("receipt", receiptId);
        }
        return paymentRepository.findByReceiptIdOrderByIdAsc(receiptId).stream().map(PaymentResponse::of).toList();
    }

    /** อ่าน lease_id ของใบก่อน (ไม่โหลด entity) แล้วล็อกทั้งสัญญา ดูเหตุผลที่ ReceiptRepository.findLeaseIdById */
    private LeaseAccount lockAccountOf(Long receiptId) {
        Long leaseId = receiptRepository.findLeaseIdById(receiptId)
                .orElseThrow(() -> new NotFoundException("receipt", receiptId));
        return leaseAccounts.lock(leaseId);
    }

    /**
     * บิลถูกยกยอดไปแล้วบอกเลขที่บิลที่รับยอดไป ถ้าตัดครบก่อนออกบิลใหม่ (ไม่ถูกยกยอด) บอกเลขที่บิลล่าสุดแทน
     * เพราะประโยค "was carried into" จะไม่จริง ทั้งสองกรณียกเลิกไม่ได้ด้วยเหตุผลเดียวกัน
     */
    private static String newerBillMessage(LeaseAccount account, Receipt bill) {
        if (bill.getCarriedToReceiptId() != null) {
            return "This payment is on a bill that was carried into "
                    + account.receipt(bill.getCarriedToReceiptId()).getReceiptNo() + " and can no longer be voided";
        }
        return "A newer bill (" + account.latest().orElseThrow().getReceiptNo()
                + ") has been issued for this lease, so this payment can no longer be voided";
    }

    /** ใบล่าสุดที่ยังมียอดต้องจ่าย ตรวจไม่ใช่ใบล่าสุดก่อนจ่ายครบแล้ว ตามลำดับในสัญญา */
    private static Receipt payableBill(LeaseAccount account, Long receiptId) {
        Receipt bill = account.receipt(receiptId);
        if (!account.isLatest(bill)) {
            throw new ConflictException("Payments are recorded on the latest bill of this lease ("
                    + account.latest().orElseThrow().getReceiptNo() + ")");
        }
        if (account.balanceDue().signum() <= 0) {
            throw new ConflictException("This receipt has already been paid");
        }
        return bill;
    }

    /**
     * ตัดยอด บันทึกการชำระพร้อมการตัด แล้วปรับสถานะของทุกใบที่ถูกตัด
     * <p>
     * flush ก่อนประกอบ response ให้ constraint ของฐานข้อมูลดังในเมธอดนี้ ไม่ใช่ตอน commit หลังตอบไปแล้ว
     * และให้คิวรีของ ReceiptViews เห็นแถวที่เพิ่งเขียน
     *
     * @param receiptMethodText ข้อความช่องทางที่ใบซึ่งถูกตัดครบจะเก็บไว้ใน paymentMethod
     */
    private void settle(LeaseAccount account, Receipt bill, PaymentRules.Valid valid, Instant recordedAt,
            String receiptMethodText) {
        List<Allocation> allocations = PaymentAllocator.allocate(valid.amount(), account.duesOldestFirst());
        Payment payment = paymentRepository.save(Payment.record(bill, valid.amount(), valid.paidOn(), valid.method(),
                valid.reference(), valid.note(), recordedAt, allocations));
        for (Allocation allocation : allocations) {
            Receipt receipt = account.receipt(allocation.receiptId());
            receipt.applySettlement(account.settledAmount(receipt).add(allocation.total()), payment.getRecordedAt(),
                    receiptMethodText);
        }
        paymentRepository.flush();
    }
}
