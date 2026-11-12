package com.sakurasoul.apartment.reports;

import com.sakurasoul.apartment.billing.LeaseAccount;
import com.sakurasoul.apartment.billing.LeaseAccounts;
import com.sakurasoul.apartment.billing.Receipt;
import com.sakurasoul.apartment.billing.ReceiptLineRepository;
import com.sakurasoul.apartment.billing.ReceiptLineRepository.ReceiptTotal;
import com.sakurasoul.apartment.billing.ReceiptRepository;
import com.sakurasoul.apartment.common.Money;
import com.sakurasoul.apartment.common.NotFoundException;
import com.sakurasoul.apartment.room.RoomRepository;
import com.sakurasoul.apartment.tenant.TenantRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * รายงานสรุป (SSK-170) จากใบเสร็จที่ billingMonth อยู่ในช่วง ผู้เช่าที่ย้ายออกไปแล้วยังอยู่ในรายงาน
 * <p>
 * ยอดรับกับยอดค้างมาจากบัญชีของสัญญา (LeaseAccounts) ตัวเดียวกับใบเสร็จและ /api/debts ไม่คิดการตัดยอดซ้ำใน SQL
 * ยอดค้างจึงเป็นยอด ณ ตอนนี้ (ตัดสิน 10 พ.ย.) และถ้าช่วงครอบทุกใบที่ยังค้าง ผลรวมเท่ากับหน้าหนี้ค้าง
 * <p>
 * จำนวนคิวรีคงที่ไม่ว่าจะกี่ใบ: ตรวจตัวกรอง (ไม่เกินสาม) ใบในช่วงพร้อมสัญญา (หนึ่ง) ผลรวมบรรทัดพิเศษ (หนึ่ง)
 * บัญชีของสัญญา (สาม) ไม่แตะ receipt.getLines() กับการชำระทีละใบ เพราะสองอย่างนั้นโหลดทีละชุด
 * ตัวกรองใช้ใน Java แบบเดียวกับ ReceiptService.list ช่วงสิบปีของตึกนี้ราวสามพันใบ อยู่ในหน่วยความจำได้สบาย
 */
@Service
public class SummaryReportService {

    private static final BigDecimal NO_EXTRA_CHARGES = BigDecimal.ZERO.setScale(Money.SCALE);

    private final ReceiptRepository receiptRepository;
    private final ReceiptLineRepository receiptLineRepository;
    private final LeaseAccounts leaseAccounts;
    private final RoomRepository roomRepository;
    private final TenantRepository tenantRepository;

    public SummaryReportService(ReceiptRepository receiptRepository, ReceiptLineRepository receiptLineRepository,
            LeaseAccounts leaseAccounts, RoomRepository roomRepository, TenantRepository tenantRepository) {
        this.receiptRepository = receiptRepository;
        this.receiptLineRepository = receiptLineRepository;
        this.leaseAccounts = leaseAccounts;
        this.roomRepository = roomRepository;
        this.tenantRepository = tenantRepository;
    }

    /** อ่านแบบ REPEATABLE_READ เพราะใบ บรรทัด และบัญชีมาจากหลายคิวรี ต้องเห็นข้อมูลจังหวะเดียวกัน ดู LeaseAccounts */
    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public SummaryReport summary(ReportQuery query) {
        checkFiltersExist(query);
        List<Receipt> receipts = receiptRepository
                .findWithLeaseByBillingMonthBetween(query.firstMonth(), query.lastMonth()).stream()
                .filter(query::matches)
                .toList();
        if (receipts.isEmpty()) {
            return SummaryReport.of(query, List.of());
        }
        Map<Long, BigDecimal> extraCharges = receiptLineRepository
                .sumByReceiptInMonths(query.firstMonth(), query.lastMonth()).stream()
                .collect(Collectors.toUnmodifiableMap(ReceiptTotal::getReceiptId, ReceiptTotal::getAmount));
        Map<Long, LeaseAccount> accounts = leaseAccounts.load(
                receipts.stream().map(receipt -> receipt.getLease().getId()).distinct().toList());
        return SummaryReport.of(query, receipts.stream()
                .map(receipt -> ReceiptFigures.of(receipt, accounts.get(receipt.getLease().getId()),
                        extraCharges.getOrDefault(receipt.getId(), NO_EXTRA_CHARGES)))
                .toList());
    }

    /** ตัวกรองที่ชี้ของที่ไม่มีตอบ 404 ตามสัญญา API ไม่ใช่รายงานว่าง ผู้ใช้จะได้รู้ว่าเลือกผิด */
    private void checkFiltersExist(ReportQuery query) {
        if (query.roomId() != null && !roomRepository.existsById(query.roomId())) {
            throw new NotFoundException("unit", query.roomId());
        }
        if (query.floor() != null && !roomRepository.existsByFloor(query.floor())) {
            throw new NotFoundException("Floor " + query.floor() + " does not exist");
        }
        if (query.tenantId() != null && !tenantRepository.existsById(query.tenantId())) {
            throw new NotFoundException("tenant", query.tenantId());
        }
    }
}
