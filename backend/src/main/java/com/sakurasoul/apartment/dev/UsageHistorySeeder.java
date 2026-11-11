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
 * และห้องที่ e2e ใช้ ผู้เช่าเก่าแต่ละคนมีสัญญาที่ปิดไปแล้ว ห้องจึงว่างอยู่ตอนนี้
 * <p>
 * ทำครั้งเดียว ดูจากผู้เช่าเก่าคนแรก (เลขบัตร 9000000000001) ฐาน dev ที่มีข้อมูลตัวอย่างอยู่แล้วได้ประวัติตอนสตาร์ตครั้งถัดไป
 * โดยไม่แตะข้อมูลเดิม ห้องที่ทำไม่สำเร็จ (เช่นมีสัญญาที่ผู้ใช้สร้างเองทับช่วง) ถูกข้ามพร้อม log ไม่ทำให้แอปสตาร์ตไม่ขึ้น
 * <p>
 * ค่ามิเตอร์เขียนตรงด้วย SQL แบบเดียวกับการนำเข้า CSV (SSK-166) ใบเสร็จออกผ่าน ReceiptService กฎจริงทำงานครบ
 * แล้วเลื่อนวันออกใบไปต้นเดือนถัดไปของแต่ละใบ ใบเก่าจะได้ไม่ขึ้นบนสุดของหน้า Payments
 */
@Component
@Profile("dev")
class UsageHistorySeeder {

    static final String FIRST_NATIONAL_ID = "9000000000001";

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

    void seed() {
        if (tenantRepository.existsByNationalId(FIRST_NATIONAL_ID)) {
            log.info("มีประวัติการใช้น้ำไฟย้อนหลังอยู่แล้ว ข้าม");
            return;
        }
        List<Room> rooms = historyRooms();
        List<RoomHistory> plans = UsageHistoryPlan.plan(AppTime.today(), rooms.size());
        int seeded = 0;
        for (RoomHistory plan : plans) {
            Room room = rooms.get(plan.index());
            try {
                seedRoom(room, plan);
                seeded++;
            } catch (RuntimeException failed) {
                log.warn("seed ประวัติของห้อง {} ไม่สำเร็จ ข้ามห้องนี้: {}", room.getRoomNumber(), failed.getMessage());
            }
        }
        log.info("seed ประวัติการใช้น้ำไฟ {} เดือนของ {} ห้องเรียบร้อย", UsageHistoryPlan.MONTHS, seeded);
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
                String.format("9%012d", plan.index() + 1), null, "080-000-" + String.format("%04d", plan.index() + 1),
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
        jdbc.sql("UPDATE receipt SET issued_at = billing_month + INTERVAL '1 month' WHERE lease_id = :lease")
                .param("lease", lease.id())
                .update();
        leaseService.terminate(lease.id(), plan.end());
    }
}
