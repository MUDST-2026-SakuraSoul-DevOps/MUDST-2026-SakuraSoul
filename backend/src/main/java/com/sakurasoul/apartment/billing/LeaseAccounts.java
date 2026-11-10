package com.sakurasoul.apartment.billing;

import com.sakurasoul.apartment.billing.PaymentAllocationRepository.SettledRow;
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

    private final ReceiptRepository receiptRepository;
    private final PaymentRepository paymentRepository;
    private final PaymentAllocationRepository paymentAllocationRepository;

    public LeaseAccounts(ReceiptRepository receiptRepository, PaymentRepository paymentRepository,
            PaymentAllocationRepository paymentAllocationRepository) {
        this.receiptRepository = receiptRepository;
        this.paymentRepository = paymentRepository;
        this.paymentAllocationRepository = paymentAllocationRepository;
    }

    /** บัญชีของแต่ละสัญญา สัญญาที่ยังไม่มีใบได้บัญชีว่าง */
    public Map<Long, LeaseAccount> load(Collection<Long> leaseIds) {
        Set<Long> ids = Set.copyOf(leaseIds);
        Map<Long, List<Receipt>> receipts = receiptRepository.findByLeaseIdIn(ids).stream()
                .collect(Collectors.groupingBy(receipt -> receipt.getLease().getId()));
        // map เดียวใช้ร่วมกันทุกสัญญา id ของใบไม่ซ้ำข้ามสัญญา และ Map.copyOf ใน LeaseAccount.of ไม่คัดลอก map ที่แก้ไม่ได้อยู่แล้ว
        Map<Long, LeaseAccount.Settled> settled = paymentAllocationRepository.sumActiveByLeaseIds(ids).stream()
                .collect(Collectors.toUnmodifiableMap(SettledRow::getReceiptId,
                        row -> new LeaseAccount.Settled(row.getInterest(), row.getPrincipal())));
        Map<Long, List<Payment>> payments = paymentRepository.findByLeaseIdInOrderByIdAsc(ids).stream()
                .collect(Collectors.groupingBy(Payment::getLeaseId));
        return ids.stream().collect(Collectors.toUnmodifiableMap(Function.identity(),
                leaseId -> LeaseAccount.of(receipts.getOrDefault(leaseId, List.of()), settled,
                        payments.getOrDefault(leaseId, List.of()))));
    }
}
