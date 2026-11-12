package com.sakurasoul.apartment.reports;

import com.sakurasoul.apartment.billing.Receipt;
import com.sakurasoul.apartment.lease.BillingCycle;
import com.sakurasoul.apartment.lease.Lease;
import com.sakurasoul.apartment.lease.LeaseCharges;
import com.sakurasoul.apartment.room.Room;
import com.sakurasoul.apartment.room.RoomType;
import com.sakurasoul.apartment.tenant.Tenant;
import org.springframework.test.util.ReflectionTestUtils;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.Set;

/**
 * สัญญากับใบเสร็จจริงในหน่วยความจำสำหรับเทสของรายงานที่ไม่ยก Spring
 * <p>
 * อัตราตั้งต้นของตึก ไฟ 8 น้ำ 18 ส่วนกลาง 300 อินเทอร์เน็ต 250 ค่าเช่า 3,500
 * ใบที่ไฟ 100 หน่วยน้ำ 10 หน่วยได้ค่าใช้จ่าย 3,500 + 800 + 180 + 300 + 250 = 5,030.00
 */
final class ReportFixtures {

    private ReportFixtures() {
    }

    static Lease lease(long leaseId, long roomId, String roomNumber, int floor, long tenantId, String tenantName) {
        Room room = new Room(roomNumber, (short) floor, RoomType.SINGLE);
        ReflectionTestUtils.setField(room, "id", roomId);
        Tenant tenant = new Tenant(tenantName, "1500000000" + String.format("%03d", tenantId), null,
                "081-000-0000", null);
        ReflectionTestUtils.setField(tenant, "id", tenantId);
        Lease lease = new Lease(room, tenant, LocalDate.of(2020, 1, 1), null, new BigDecimal("3500.00"),
                BillingCycle.MONTHLY, new LeaseCharges(new BigDecimal("7000.00"), new BigDecimal("8.00"),
                new BigDecimal("18.00"), new BigDecimal("300.00"), new BigDecimal("250.00")));
        ReflectionTestUtils.setField(lease, "id", leaseId);
        return lease;
    }

    /** ใบที่ไม่มียอดยกมา ไฟ 100 น้ำตามที่ส่ง */
    static Receipt receipt(Lease lease, long id, String month, String waterUnits) {
        return receipt(lease, id, month, waterUnits, Receipt.CarryForward.NONE);
    }

    static Receipt receipt(Lease lease, long id, String month, String waterUnits, Receipt.CarryForward carry) {
        LocalDate billingMonth = YearMonth.parse(month).atDay(1);
        Receipt receipt = Receipt.issue(lease, billingMonth, new BigDecimal("100"), new BigDecimal(waterUnits),
                billingMonth.plusMonths(1).withDayOfMonth(5), Instant.parse("2026-01-01T00:00:00Z"), Set.of(), carry);
        receipt.numberedAs("RC-2026-" + String.format("%04d", id));
        ReflectionTestUtils.setField(receipt, "id", id);
        return receipt;
    }
}
