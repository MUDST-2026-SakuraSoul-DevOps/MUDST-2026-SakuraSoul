package com.sakurasoul.apartment.dev;

import com.sakurasoul.apartment.billing.PaymentService;
import com.sakurasoul.apartment.billing.ReceiptDtos.CreateReceiptRequest;
import com.sakurasoul.apartment.billing.ReceiptDtos.ReceiptResponse;
import com.sakurasoul.apartment.billing.ReceiptService;
import com.sakurasoul.apartment.common.AppTime;
import com.sakurasoul.apartment.dev.UsageHistoryPlan.MonthUsage;
import com.sakurasoul.apartment.dev.UsageHistoryPlan.RoomHistory;
import com.sakurasoul.apartment.lease.BillingCycle;
import com.sakurasoul.apartment.lease.LeaseDtos.LeaseRequest;
import com.sakurasoul.apartment.lease.LeaseDtos.LeaseResponse;
import com.sakurasoul.apartment.lease.LeaseService;
import com.sakurasoul.apartment.room.Room;
import com.sakurasoul.apartment.room.RoomRepository;
import com.sakurasoul.apartment.tenant.TenantDtos.CreateTenantRequest;
import com.sakurasoul.apartment.tenant.TenantDtos.TenantResponse;
import com.sakurasoul.apartment.tenant.TenantRepository;
import com.sakurasoul.apartment.tenant.TenantService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

/**
 * ประวัติการใช้น้ำไฟย้อนหลังสามปีของ dev (SSK-181) ตามแผนใน UsageHistoryPlan การ์ดขอข้อมูลอย่างน้อยสามปีด้วย seed คงที่
 * <p>
 * ใช้ห้องลำดับที่ 7 ถึง 9 ของสองชั้นแรกตามผังตึก (ตอนนี้ 107-109 กับ 207-209) ไม่ชนห้องของข้อมูลตัวอย่าง
 * ผู้เช่าเก่าแต่ละคนมีสัญญาที่ปิดไปแล้ว ห้องจึงว่างอยู่ตอนนี้ e2e แจ้งซ่อมห้อง 108 กับ 109 ได้ตามปกติ
 * (ลองกับ docker แล้วห้องทั้งหกเป็น AVAILABLE)
 * <p>
 * ทำทีละห้อง ห้องที่มีผู้เช่าเก่าของห้องนั้นแล้ว (เลขบัตร 9000000000001 ถึง 9000000000006) ถูกข้าม
 * ห้องที่มีสัญญาอื่นทับช่วงของประวัติ (เช่นผู้ใช้สร้างสัญญาไว้เองในฐาน dev เดิม) ถูกข้ามก่อนสร้างอะไร จึงลองใหม่ได้ตอนสตาร์ตครั้งถัดไป
 * ฐาน dev ที่มีข้อมูลตัวอย่างอยู่แล้วได้ประวัติตอนสตาร์ตครั้งถัดไปโดยไม่แตะข้อมูลเดิม
 * ห้องที่พังกลางทางด้วยเหตุอื่นถูกข้ามพร้อม log แอปยังสตาร์ตได้ (UsageHistorySeederTest คุมว่าทางปกติไม่พัง)
 * <p>
 * ค่ามิเตอร์เขียนตรงด้วย SQL แบบเดียวกับการนำเข้า CSV (SSK-166) ON CONFLICT DO NOTHING คงค่าที่มีอยู่แล้ว
 * ใบเสร็จออกผ่าน ReceiptService และรับชำระผ่าน PaymentService กฎจริงทำงานครบ แล้วเลื่อนวันที่ให้เป็นอดีตจริง
 * (backdate) คือวันออกใบเป็นวันที่ 1 ของเดือนถัดไป วันที่จ่ายเป็นวันที่ 3 ของเดือนถัดไป และเลขที่ใบใช้ปีของรอบบิล
 * (RC-2024-H1001) ไม่งั้นใบปี 2023 ได้เลข RC-2026 และเงินสามปีนับเป็นรายรับของวันนี้
 */
@Component
@Profile("dev")
class UsageHistorySeeder {


    private static final Logger log = LoggerFactory.getLogger(UsageHistorySeeder.class);

    /** ตำแหน่งในชั้น (นับจาก 0) ของห้องที่ใช้ */
    private static final List<Integer> POSITIONS = List.of(6, 7, 8);

    private final TenantRepository tenantRepository;
    private final TenantService tenantService;
    private final RoomRepository roomRepository;
    private final LeaseService leaseService;
    private final ReceiptService receiptService;
    private final PaymentService paymentService;
    private final JdbcClient jdbc;

    UsageHistorySeeder(TenantRepository tenantRepository, TenantService tenantService, RoomRepository roomRepository,
            LeaseService leaseService, ReceiptService receiptService, PaymentService paymentService,
            JdbcClient jdbc) {
        this.tenantRepository = tenantRepository;
        this.tenantService = tenantService;
        this.roomRepository = roomRepository;
        this.leaseService = leaseService;
        this.receiptService = receiptService;
        this.paymentService = paymentService;
        this.jdbc = jdbc;
    }

    /** เลขบัตรของผู้เช่าเก่าห้องที่ index (นับจาก 0) เช่น 9000000000001 */
    static String nationalIdOf(int index) {
        return String.format("9%012d", index + 1);
    }

    /** @return จำนวนห้องที่ seed รอบนี้ */
    int seed() {
        List<Room> rooms = historyRooms();
        List<RoomHistory> plans = UsageHistoryPlan.plan(AppTime.today(), rooms.size());
        int seeded = 0;
        for (RoomHistory plan : plans) {
            Room room = rooms.get(plan.index());
            if (tenantRepository.existsByNationalId(nationalIdOf(plan.index()))) {
                continue;
            }
            if (hasOverlappingLease(room, plan)) {
                log.info("ห้อง {} มีสัญญาอื่นทับช่วงของประวัติ ข้ามห้องนี้", room.getRoomNumber());
                continue;
            }
            try {
                seedRoom(room, plan);
                seeded++;
            } catch (RuntimeException failed) {
                log.warn("seed ประวัติของห้อง {} ไม่สำเร็จ ข้ามห้องนี้: {}", room.getRoomNumber(), failed.getMessage());
            }
        }
        if (seeded > 0) {
            log.info("seed ประวัติการใช้น้ำไฟ {} เดือนของ {} ห้องเรียบร้อย", UsageHistoryPlan.MONTHS, seeded);
        }
        return seeded;
    }

    private boolean hasOverlappingLease(Room room, RoomHistory plan) {
        return jdbc.sql("""
                        SELECT EXISTS (SELECT 1 FROM lease
                                       WHERE room_id = :room AND start_date <= :end
                                         AND (end_date IS NULL OR end_date >= :start))""")
                .param("room", room.getId())
                .param("start", plan.start())
                .param("end", plan.end())
                .query(Boolean.class)
                .single();
    }

    /**
     * วันที่ของใบเสร็จและการชำระของประวัติเป็นอดีตจริง เวลาไทย: ออกใบ 08:00 วันที่ 1 ของเดือนถัดไป จ่าย 10:00 วันที่ 3
     * เลขที่ใบเปลี่ยนเป็นปีของรอบบิลตามด้วย H ลำดับห้อง และลำดับใบ (ห้องแรก RC-2024-H1001) ไม่ชนเลขจริงที่เป็นตัวเลขล้วน
     * และไม่ชนกันเองระหว่างห้อง
     * ใบของปีนี้ที่เป็นประวัติยังถูกนับตอนหาเลขถัดไป เลขจริงจึงข้ามไปบ้าง แต่ไม่มีวันซ้ำ (receipt_no_uk)
     */
    private void backdate(Long leaseId, int roomIndex) {
        jdbc.sql("""
                        UPDATE receipt r
                        SET issued_at = (r.billing_month + INTERVAL '1 month 8 hours') AT TIME ZONE 'Asia/Bangkok',
                            paid_at = (r.billing_month + INTERVAL '1 month 2 days 10 hours') AT TIME ZONE 'Asia/Bangkok',
                            receipt_no = 'RC-' || EXTRACT(YEAR FROM r.billing_month) || '-H' || (:room * 1000 + n.seq)
                        FROM (SELECT id, row_number() OVER (ORDER BY billing_month) AS seq
                              FROM receipt WHERE lease_id = :lease) n
                        WHERE r.id = n.id""")
                .param("lease", leaseId)
                .param("room", roomIndex + 1)
                .update();
        jdbc.sql("""
                        UPDATE payment p
                        SET paid_on = (r.billing_month + INTERVAL '1 month 2 days')::date,
                            recorded_at = (r.billing_month + INTERVAL '1 month 2 days 10 hours') AT TIME ZONE 'Asia/Bangkok'
                        FROM receipt r
                        WHERE r.id = p.receipt_id AND p.lease_id = :lease""")
                .param("lease", leaseId)
                .update();
    }

    /** ห้องลำดับที่ 7-9 ของสองชั้นแรกตามผังตึก ชั้นที่มีห้องไม่ถึงก็ได้น้อยห้องลง */
    private List<Room> historyRooms() {
        Map<Short, List<Room>> byFloor = new TreeMap<>();
        for (Room room : roomRepository.findAllInLayoutOrder()) {
            byFloor.computeIfAbsent(room.getFloor(), floor -> new ArrayList<>()).add(room);
        }
        List<Room> picked = new ArrayList<>();
        byFloor.values().stream().limit(2).forEach(floor -> POSITIONS.stream()
                .filter(position -> position < floor.size())
                .forEach(position -> picked.add(floor.get(position))));
        return picked;
    }

    private void seedRoom(Room room, RoomHistory plan) {
        TenantResponse tenant = tenantService.create(new CreateTenantRequest("ผู้เช่าเก่า ห้อง " + room.getRoomNumber(),
                nationalIdOf(plan.index()), null, "080-000-" + String.format("%04d", plan.index() + 1),
                null));
        LeaseResponse lease = leaseService.create(new LeaseRequest(room.getId(), tenant.id(), plan.start(), plan.end(),
                null, BillingCycle.MONTHLY, null, null, null, null, null));

        for (MonthUsage month : plan.months()) {
            if (month.reading()) {
                jdbc.sql("""
                                INSERT INTO meter_reading (room_id, reading_month, electric_units, water_units, source,
                                                           imported_at)
                                VALUES (:room, :month, :electric, :water, 'MANUAL', :at)
                                ON CONFLICT (room_id, reading_month) DO NOTHING""")
                        .param("room", room.getId())
                        .param("month", month.month().atDay(1))
                        .param("electric", month.electricUnits())
                        .param("water", month.waterUnits())
                        .param("at", Timestamp.from(Instant.now()))
                        .update();
            }
            if (month.receipt()) {
                ReceiptResponse receipt = receiptService.create(new CreateReceiptRequest(lease.id(),
                        month.month().toString(), month.electricUnits().add(BigDecimal.TWO),
                        month.waterUnits(), null));
                paymentService.payInFull(receipt.id(), "Cash");
            }
        }
        backdate(lease.id(), plan.index());
        leaseService.terminate(lease.id(), plan.end());
    }
}
