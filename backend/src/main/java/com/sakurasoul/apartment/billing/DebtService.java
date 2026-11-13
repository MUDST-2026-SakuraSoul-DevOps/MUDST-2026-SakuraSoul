package com.sakurasoul.apartment.billing;

import com.sakurasoul.apartment.lease.Lease;
import com.sakurasoul.apartment.lease.LeaseRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDate;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * หนี้ค้างของทุกสัญญา (SSK-163) รวมสัญญาที่ปิดไปแล้วแต่ยังค้างอยู่ การหักเงินมัดจำไม่อยู่ในการ์ดนี้
 * <p>
 * อ่านสัญญาทั้งหมดพร้อมห้องและผู้เช่าในคิวรีเดียว แล้วโหลดบัญชีของทุกสัญญาในคราวเดียว (LeaseAccounts)
 * จำนวนคิวรีจึงคงที่ไม่ว่าจะกี่สัญญา
 */
@Service
public class DebtService {

    /** ค้างนานสุดก่อน เท่ากันเรียงตามเลขห้อง */
    private static final Comparator<DebtResponse> LONGEST_OWED_FIRST =
            Comparator.comparing(DebtResponse::oldestUnpaidDueDate).thenComparing(DebtResponse::roomNumber);

    private final LeaseRepository leaseRepository;
    private final LeaseAccounts leaseAccounts;

    /** "วันนี้" ตามเวลาไทยของ daysOverdue ดู config.SchedulingConfig */
    private final Clock clock;

    public DebtService(LeaseRepository leaseRepository, LeaseAccounts leaseAccounts, Clock clock) {
        this.leaseRepository = leaseRepository;
        this.leaseAccounts = leaseAccounts;
        this.clock = clock;
    }

    /** อ่านแบบ REPEATABLE_READ เพราะบัญชีประกอบจากหลายคิวรี ดู LeaseAccounts */
    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public List<DebtResponse> list() {
        List<Lease> leases = leaseRepository.findAllByOrderByStartDateDesc();
        Map<Long, LeaseAccount> accounts = leaseAccounts.load(leases.stream().map(Lease::getId).toList());
        LocalDate today = LocalDate.now(clock);
        return leases.stream()
                .map(lease -> DebtResponse.of(lease, accounts.get(lease.getId()), today))
                .flatMap(Optional::stream)
                .sorted(LONGEST_OWED_FIRST)
                .toList();
    }
}
