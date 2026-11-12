package com.sakurasoul.apartment.billing;

import com.sakurasoul.apartment.billing.ReceiptDtos.ReceiptResponse;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * ประกอบ ReceiptResponse ซึ่งต้องรู้ยอดของทั้งสัญญา (SSK-163, SSK-164)
 * <p>
 * ใบเดียวตอบยอดของตัวเองไม่ได้แล้ว ใบล่าสุดต้องรู้ยอดค้างของทุกใบก่อนหน้า และสถานะของแต่ละใบขึ้นกับเงินที่ถูกตัด
 * จากการชำระบนบิลอื่น ตัวนี้จึงโหลดบัญชีของทุกสัญญาที่ใบเหล่านั้นสังกัดในคราวเดียว ({@link LeaseAccounts})
 * จำนวนคิวรีจึงคงที่ไม่ว่าจะกี่ใบ ผู้เรียกต้องอยู่ใน transaction ดูเรื่อง isolation ที่ LeaseAccounts
 */
@Service
public class ReceiptViews {

    private final LeaseAccounts leaseAccounts;

    /** "วันนี้" ตามเวลาไทยของ overdue ดู config.SchedulingConfig */
    private final Clock clock;

    public ReceiptViews(LeaseAccounts leaseAccounts, Clock clock) {
        this.leaseAccounts = leaseAccounts;
        this.clock = clock;
    }

    /** response ของใบเหล่านี้ ลำดับเดียวกับที่ส่งมา */
    public List<ReceiptResponse> render(List<Receipt> receipts) {
        if (receipts.isEmpty()) {
            return List.of();
        }
        Map<Long, LeaseAccount> accounts = leaseAccounts.load(
                receipts.stream().map(receipt -> receipt.getLease().getId()).collect(Collectors.toSet()));
        LocalDate today = LocalDate.now(clock);
        return receipts.stream()
                .map(receipt -> ReceiptResponse.of(receipt, accounts.get(receipt.getLease().getId()), today))
                .toList();
    }

    public ReceiptResponse render(Receipt receipt) {
        return render(List.of(receipt)).getFirst();
    }
}
