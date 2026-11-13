package com.sakurasoul.apartment.billing;

import com.sakurasoul.apartment.billing.PaymentAllocationRepository.SettledRow;
import com.sakurasoul.apartment.common.NotFoundException;
import com.sakurasoul.apartment.lease.Lease;
import com.sakurasoul.apartment.lease.LeaseRepository;
import org.springframework.stereotype.Service;

import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * โหลดบัญชีของสัญญา ({@link LeaseAccount}) จากฐานข้อมูล (SSK-163, SSK-164)
 * <p>
 * บัญชีหนึ่งก้อนประกอบจากสามคิวรีต่อคำขอ ไม่ว่าจะกี่สัญญา: ใบทุกใบของสัญญาเหล่านั้น ผลรวมการตัดยอดต่อใบ และการชำระ
 * ผู้เรียกต้องอยู่ใน transaction ถ้าเป็นการอ่านล้วนให้ใช้ REPEATABLE_READ เพราะภายใต้ READ COMMITTED แต่ละคิวรี
 * เห็นข้อมูลคนละจังหวะ อาจเห็นการชำระที่เพิ่ง commit แต่ไม่เห็นใบที่มันตัด ตัวเลขที่ได้จะไม่ตรงกันเอง
 */
@Service
public class LeaseAccounts {

    private final LeaseRepository leaseRepository;
    private final ReceiptRepository receiptRepository;
    private final PaymentRepository paymentRepository;
    private final PaymentAllocationRepository paymentAllocationRepository;

    public LeaseAccounts(LeaseRepository leaseRepository, ReceiptRepository receiptRepository,
            PaymentRepository paymentRepository, PaymentAllocationRepository paymentAllocationRepository) {
        this.leaseRepository = leaseRepository;
        this.receiptRepository = receiptRepository;
        this.paymentRepository = paymentRepository;
        this.paymentAllocationRepository = paymentAllocationRepository;
    }

    /** บัญชีของแต่ละสัญญา สัญญาที่ยังไม่มีใบได้บัญชีว่าง */
    public Map<Long, LeaseAccount> load(Collection<Long> leaseIds) {
        Set<Long> ids = Set.copyOf(leaseIds);
        Map<Long, List<Receipt>> receipts = receiptRepository.findByLeaseIdIn(ids).stream()
                .collect(Collectors.groupingBy(receipt -> receipt.getLease().getId()));
        Map<Long, LeaseAccount.Settled> settled = settledOf(ids);
        Map<Long, List<Payment>> payments = paymentRepository.findByLeaseIdInOrderByIdAsc(ids).stream()
                .collect(Collectors.groupingBy(Payment::getLeaseId));
        return ids.stream().collect(Collectors.toUnmodifiableMap(Function.identity(),
                leaseId -> LeaseAccount.of(receipts.getOrDefault(leaseId, List.of()), settled,
                        payments.getOrDefault(leaseId, List.of()))));
    }

    /**
     * ล็อกสัญญากับใบทุกใบของสัญญา แล้วอ่านบัญชี ใช้กับทุกเส้นทางที่เขียนยอด (รับชำระ ยกเลิก ออกใบ แก้ใบ)
     * <p>
     * ล็อกแถวสัญญาก่อนเสมอ เพราะทุกการตัดสินใจขึ้นกับชุดใบของสัญญา (ใบไหนล่าสุด ยอดค้างเท่าไหร่ ก้อนไหนล่าสุด)
     * ล็อกแถวใบอย่างเดียวกันการแทรกใบใหม่ไม่ได้ แถวใบถูกล็อกตามมาเรียงตาม id เพราะ ReceiptDispatchService.markSent
     * ล็อกใบโดยไม่ล็อกสัญญา ถ้าเราไม่ล็อก การเขียนใบของเรา (Hibernate เขียนทุกคอลัมน์) จะทับ sent_count ที่อีกฝั่งเพิ่งนับ
     * ทุกเส้นทางล็อกตามลำดับ สัญญา แล้วใบ ส่วน markSent ไม่เคยขอล็อกสัญญา จึงไม่มีวงรอ
     * <p>
     * ตรวจข้อที่ทั้งระบบพึ่งก่อนคืน (LeaseAccount.assertBalanced) ไม่จริงโยน IllegalStateException และไม่มีใครได้เขียนต่อ
     * ผู้เรียกต้องไม่เคยโหลดใบของสัญญานี้ใน transaction เดียวกันมาก่อน ไม่งั้นได้ก้อนเก่าใน persistence context
     */
    public Locked lock(Long leaseId) {
        Lease lease = leaseRepository.findForUpdateById(leaseId)
                .orElseThrow(() -> new NotFoundException("lease", leaseId));
        List<Receipt> receipts = receiptRepository.findByLeaseIdForUpdate(leaseId);
        LeaseAccount account = LeaseAccount.of(receipts, settledOf(Set.of(leaseId)),
                paymentRepository.findByLeaseIdOrderByIdAsc(leaseId));
        account.assertBalanced();
        return new Locked(lease, account);
    }

    /** สัญญาที่ล็อกไว้แล้วกับบัญชีของมัน ทั้งสองเป็นก้อนเดียวกับที่อยู่ใน persistence context แก้แล้ว flush ได้เลย */
    public record Locked(Lease lease, LeaseAccount account) {
    }

    /** map เดียวใช้ร่วมกันทุกสัญญา id ของใบไม่ซ้ำข้ามสัญญา และ Map.copyOf ใน LeaseAccount.of ไม่คัดลอก map ที่แก้ไม่ได้อยู่แล้ว */
    private Map<Long, LeaseAccount.Settled> settledOf(Set<Long> leaseIds) {
        return paymentAllocationRepository.sumActiveByLeaseIds(leaseIds).stream()
                .collect(Collectors.toUnmodifiableMap(SettledRow::getReceiptId,
                        row -> new LeaseAccount.Settled(row.getInterest(), row.getPrincipal())));
    }
}
