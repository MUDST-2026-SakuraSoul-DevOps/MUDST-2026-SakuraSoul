package com.sakurasoul.apartment.billing;

import com.sakurasoul.apartment.billing.LateInterest.Candidate;
import com.sakurasoul.apartment.billing.PaymentAllocator.Due;
import com.sakurasoul.apartment.lease.LeaseLateTerms;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

/**
 * ภาพบัญชีของสัญญาหนึ่งใบ ณ ขณะหนึ่ง (SSK-163, SSK-164) ตอบทุกยอดที่ API ต้องใช้ เป็น logic ล้วน ไม่แตะฐานข้อมูล
 *
 * <h2>สองมุมของตัวเลข</h2>
 * <ul>
 *   <li>มุมบิล: totalAmount ที่พิมพ์บนกระดาษ ลบเงินที่บันทึกบนบิลนั้น ({@link #paidAmount}) ได้ {@link #balanceDue()}
 *       มีความหมายเฉพาะใบล่าสุด</li>
 *   <li>มุมของใบเอง: ค่าใช้จ่ายกับดอกเบี้ยของใบนั้น ลบเงินที่ถูกตัดเข้า (จากการชำระครั้งไหนก็ได้) ได้ {@link #outstandingAmount}
 *       ไม่รวมยอดยกมา รวมหลายใบได้โดยไม่นับซ้ำ</li>
 * </ul>
 * ข้อเดียวที่ทั้งระบบพึ่ง: balanceDue ของใบล่าสุด = ผลรวม outstandingAmount ของทุกใบ ({@link #assertBalanced()})
 * กฎ "จ่ายที่ใบล่าสุดเท่านั้น", "ออกใบตามลำดับเดือน", "ยกเลิกได้เฉพาะก้อนล่าสุดบนใบล่าสุด" มีไว้รักษาสมการนี้
 */
public final class LeaseAccount {

    private static final Comparator<Receipt> OLDEST_FIRST = Comparator.comparing(Receipt::getBillingMonth);

    /** เรียงจากเดือนเก่าสุด */
    private final List<Receipt> receipts;
    private final Map<Long, Settled> settledByReceiptId;
    /** รวมที่ยกเลิก เรียงตาม id */
    private final List<Payment> payments;

    private LeaseAccount(List<Receipt> receipts, Map<Long, Settled> settledByReceiptId, List<Payment> payments) {
        this.receipts = receipts;
        this.settledByReceiptId = settledByReceiptId;
        this.payments = payments;
    }

    /**
     * @param receiptsOfOneLease ทุกใบของสัญญาเดียว ลำดับไหนก็ได้
     * @param settledByReceiptId เงินที่ถูกตัดเข้าแต่ละใบ เฉพาะการชำระที่ยังไม่ถูกยกเลิก ใบที่ไม่อยู่ใน map ยังไม่ถูกตัดเลย
     * @param paymentsOfLease    ทุกการชำระของสัญญา รวมที่ยกเลิก
     */
    public static LeaseAccount of(List<Receipt> receiptsOfOneLease, Map<Long, Settled> settledByReceiptId,
            List<Payment> paymentsOfLease) {
        return new LeaseAccount(
                receiptsOfOneLease.stream().sorted(OLDEST_FIRST).toList(),
                Map.copyOf(settledByReceiptId),
                paymentsOfLease.stream().sorted(Comparator.comparing(Payment::getId)).toList());
    }

    /** ใบของสัญญานี้ตาม id ไม่อยู่ในบัญชีคือบั๊กของผู้เรียก */
    public Receipt receipt(Long receiptId) {
        return receipts.stream()
                .filter(receipt -> receipt.getId().equals(receiptId))
                .findFirst()
                .orElseThrow(() -> new IllegalStateException("Receipt " + receiptId + " is not part of this lease"));
    }

    /** ใบของเดือนล่าสุด สัญญาที่ยังไม่มีใบเลยไม่มีใบล่าสุด */
    public Optional<Receipt> latest() {
        return receipts.isEmpty() ? Optional.empty() : Optional.of(receipts.getLast());
    }

    public boolean isLatest(Receipt receipt) {
        return latest().map(latest -> latest.getId().equals(receipt.getId())).orElse(false);
    }

    /** เงินที่ถูกตัดเข้าค่าใช้จ่ายกับดอกเบี้ยของใบนี้แล้ว */
    public BigDecimal settledAmount(Receipt receipt) {
        return settled(receipt).total();
    }

    public BigDecimal interestDue(Receipt receipt) {
        return receipt.getInterestAmount().subtract(settled(receipt).interest());
    }

    public BigDecimal principalDue(Receipt receipt) {
        return receipt.chargesAmount().subtract(settled(receipt).principal());
    }

    /** ค่าใช้จ่ายกับดอกเบี้ยของใบนี้ที่ยังไม่ถูกตัด ไม่รวมยอดยกมา */
    public BigDecimal outstandingAmount(Receipt receipt) {
        return interestDue(receipt).add(principalDue(receipt));
    }

    /** ผลรวมการชำระที่บันทึกบนบิลนี้และยังไม่ถูกยกเลิก เงินก้อนนั้นอาจถูกตัดเข้าใบเก่ากว่าก็ได้ */
    public BigDecimal paidAmount(Receipt bill) {
        return payments.stream()
                .filter(payment -> !payment.isVoided() && payment.getReceiptId().equals(bill.getId()))
                .map(Payment::getAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    /** ยอดที่ยังต้องจ่ายตามบิลล่าสุด ยังไม่มีใบเลยเป็นศูนย์ */
    public BigDecimal balanceDue() {
        return latest().map(latest -> latest.getTotalAmount().subtract(paidAmount(latest))).orElse(BigDecimal.ZERO);
    }

    /** ยอดค้างของแต่ละใบที่ยังค้าง เรียงจากเดือนเก่าสุด สำหรับ PaymentAllocator */
    public List<Due> duesOldestFirst() {
        return unpaid().stream()
                .map(receipt -> new Due(receipt.getId(), interestDue(receipt), principalDue(receipt)))
                .toList();
    }

    /** วันครบกำหนดของใบเก่าสุดที่ยังค้าง ไม่มีหนี้เป็นว่าง */
    public Optional<LocalDate> oldestUnpaidDueDate() {
        return unpaid().stream().findFirst().map(Receipt::getDueDate);
    }

    /** บิลล่าสุดยังมียอดต้องจ่าย และวันนี้ (เวลาไทย) เลยวันครบกำหนดของใบเก่าสุดที่ยังค้างแล้ว */
    public boolean isOverdue(LocalDate today) {
        return balanceDue().signum() > 0 && oldestUnpaidDueDate().map(today::isAfter).orElse(false);
    }

    /** การชำระของสัญญานี้ตาม id ไม่อยู่ในบัญชีคือบั๊กของผู้เรียก */
    public Payment payment(Long paymentId) {
        return payments.stream()
                .filter(payment -> payment.getId().equals(paymentId))
                .findFirst()
                .orElseThrow(() -> new IllegalStateException("Payment " + paymentId + " is not part of this lease"));
    }

    /** การชำระก้อนล่าสุดของสัญญาที่ยังไม่ถูกยกเลิก ก้อนเดียวที่ยกเลิกได้ */
    public Optional<Payment> latestActivePayment() {
        return payments.stream().filter(payment -> !payment.isVoided()).reduce((first, second) -> second);
    }

    /** บิลนี้มีการชำระที่ยังไม่ถูกยกเลิกไหม ใบที่มีแก้ไม่ได้ */
    public boolean hasActivePaymentsOn(Receipt bill) {
        return payments.stream().anyMatch(payment -> !payment.isVoided() && payment.getReceiptId().equals(bill.getId()));
    }

    /** การชำระที่บันทึกบนบิลนี้ รวมที่ยกเลิก เรียงตามลำดับที่บันทึก ตรงกับ payments ของใบเสร็จในสัญญา API */
    public List<Payment> paymentsOn(Receipt bill) {
        return payments.stream().filter(payment -> payment.getReceiptId().equals(bill.getId())).toList();
    }

    /** ใบที่ยังค้าง เรียงจากเดือนเก่าสุด เป็นใบที่ต้องถูกยกไปบิลใหม่ */
    public List<Receipt> unpaid() {
        return receipts.stream().filter(receipt -> outstandingAmount(receipt).signum() > 0).toList();
    }

    /**
     * ยอดยกมากับฐานของดอกเบี้ยของบิลเดือนใหม่ (SSK-164)
     * <ul>
     *   <li>ยอดยกมา: ยอดค้างของทุกใบ (ต้นเงินกับดอกเบี้ยที่ยังค้าง) ซึ่งเท่ากับ balanceDue ของบิลล่าสุดเดิม</li>
     *   <li>ฐานของดอกเบี้ย: ต้นเงินคงเหลือของใบที่เลยกำหนด ณ วันอ้างอิง ({@link LateInterest#referenceDate}) ดอกเบี้ยที่ยังค้างไม่ถูกคิดซ้ำ</li>
     *   <li>อัตราและวันผ่อนผันจากสัญญา</li>
     * </ul>
     */
    public Receipt.CarryForward carryForwardFor(YearMonth newMonth, LocalDate issueDate, LeaseLateTerms terms) {
        List<Receipt> unpaid = unpaid();
        if (unpaid.isEmpty()) {
            return Receipt.CarryForward.NONE;
        }
        BigDecimal previousBalance = unpaid.stream().map(this::outstandingAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        String receiptNumbers = unpaid.stream().map(Receipt::getReceiptNo).collect(Collectors.joining(", "));
        List<Candidate> candidates = unpaid.stream()
                .map(receipt -> new Candidate(principalDue(receipt), receipt.getDueDate()))
                .toList();
        BigDecimal interestPrincipal = LateInterest.overduePrincipal(candidates, terms.getGraceDays(),
                LateInterest.referenceDate(newMonth, issueDate));
        return new Receipt.CarryForward(previousBalance, receiptNumbers, interestPrincipal, terms.getPercentPerMonth());
    }

    /**
     * ตรวจข้อที่ทั้งระบบพึ่งก่อนเขียนอะไร ไม่จริงคือข้อมูลเสียหรือบั๊กของเรา โยน IllegalStateException (500)
     * และไม่เขียนอะไรต่อ ดีกว่าตัดยอดผิดแล้วไม่มีใครรู้
     */
    public void assertBalanced() {
        BigDecimal outstanding = receipts.stream().map(this::outstandingAmount).reduce(BigDecimal.ZERO, BigDecimal::add);
        if (balanceDue().compareTo(outstanding) != 0) {
            throw new IllegalStateException("The balance due " + balanceDue() + " of lease "
                    + latest().map(receipt -> receipt.getLease().getId()).orElse(null)
                    + " does not match the outstanding " + outstanding + " of its receipts");
        }
    }

    private Settled settled(Receipt receipt) {
        return settledByReceiptId.getOrDefault(receipt.getId(), Settled.NONE);
    }

    /** เงินที่ถูกตัดเข้าใบหนึ่ง แยกดอกเบี้ยกับต้นเงิน */
    public record Settled(BigDecimal interest, BigDecimal principal) {

        static final Settled NONE = new Settled(BigDecimal.ZERO, BigDecimal.ZERO);

        BigDecimal total() {
            return interest.add(principal);
        }
    }
}
