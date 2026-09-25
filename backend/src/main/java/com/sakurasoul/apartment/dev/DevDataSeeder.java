package com.sakurasoul.apartment.dev;

import com.sakurasoul.apartment.billing.ReceiptDtos.CreateReceiptRequest;
import com.sakurasoul.apartment.billing.ReceiptDtos.ReceiptResponse;
import com.sakurasoul.apartment.billing.ReceiptService;
import com.sakurasoul.apartment.common.AppTime;
import com.sakurasoul.apartment.lease.BillingCycle;
import com.sakurasoul.apartment.lease.LeaseDtos.LeaseRequest;
import com.sakurasoul.apartment.lease.LeaseDtos.LeaseResponse;
import com.sakurasoul.apartment.lease.LeaseRepository;
import com.sakurasoul.apartment.lease.LeaseService;
import com.sakurasoul.apartment.maintenance.MaintenanceDtos.CreateTicketRequest;
import com.sakurasoul.apartment.maintenance.MaintenanceDtos.TicketResponse;
import com.sakurasoul.apartment.maintenance.MaintenanceDtos.UpdateTicketRequest;
import com.sakurasoul.apartment.maintenance.MaintenanceService;
import com.sakurasoul.apartment.room.Room;
import com.sakurasoul.apartment.room.RoomRepository;
import com.sakurasoul.apartment.room.RoomTypeRate;
import com.sakurasoul.apartment.room.RoomTypeRateRepository;
import com.sakurasoul.apartment.tenant.TenantDtos.CreateTenantRequest;
import com.sakurasoul.apartment.tenant.TenantDtos.TenantResponse;
import com.sakurasoul.apartment.tenant.TenantRepository;
import com.sakurasoul.apartment.tenant.TenantService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.List;

/**
 * ใส่ผู้เช่าตัวอย่างให้ตอน dev จะได้มีข้อมูลให้กดเล่นโดยไม่ต้องนั่งกรอกเอง
 * <p>
 * ห้องทั้ง 24 ห้องไม่ได้อยู่ที่นี่ แต่อยู่ใน migration V2 เพราะเป็นข้อมูลจริงของตึก
 * ส่วนผู้เช่าเป็นของปลอม เลยผูกไว้กับโปรไฟล์ dev ซึ่ง k8s ไม่ได้เปิด ข้อมูลปลอมจึงไม่หลุดขึ้นไป
 * <p>
 * เรียกผ่าน service ไม่ยิง repository ตรง จะได้เดินผ่านกฎเดียวกับที่ API ใช้
 */
@Component
@Profile("dev")
public class DevDataSeeder implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(DevDataSeeder.class);

    private final TenantRepository tenantRepository;
    private final TenantService tenantService;
    private final RoomRepository roomRepository;
    private final RoomTypeRateRepository roomTypeRateRepository;
    private final LeaseRepository leaseRepository;
    private final LeaseService leaseService;
    private final MaintenanceService maintenanceService;
    private final ReceiptService receiptService;

    public DevDataSeeder(TenantRepository tenantRepository, TenantService tenantService,
            RoomRepository roomRepository, RoomTypeRateRepository roomTypeRateRepository,
            LeaseRepository leaseRepository, LeaseService leaseService,
            MaintenanceService maintenanceService, ReceiptService receiptService) {
        this.tenantRepository = tenantRepository;
        this.tenantService = tenantService;
        this.roomRepository = roomRepository;
        this.roomTypeRateRepository = roomTypeRateRepository;
        this.leaseRepository = leaseRepository;
        this.leaseService = leaseService;
        this.maintenanceService = maintenanceService;
        this.receiptService = receiptService;
    }

    /**
     * เช็คทั้งสองตาราง ไม่ใช่แค่ผู้เช่า เพราะฐานข้อมูล dev ที่ seed ค้างกลางทาง
     * (เช่นลบผู้เช่าทิ้งมือแต่สัญญายังอยู่) จะวิ่งมา seed สัญญาซ้ำแล้วชน constraint
     * lease_no_overlap ตั้งแต่ตอนสตาร์ต ทำให้แอปขึ้นไม่ได้ทั้งตัวเพราะข้อมูลปลอม
     */
    @Override
    public void run(ApplicationArguments args) {
        if (tenantRepository.count() > 0 || leaseRepository.count() > 0) {
            log.info("มีข้อมูลตัวอย่างอยู่แล้ว ข้ามการ seed");
            return;
        }

        // ลำดับช่องคือ ชื่อ เลขบัตร Line ID เบอร์โทร อีเมล ตามชุดฟิลด์ของ US-03
        // Kenji เป็นผู้เช่าต่างชาติ ใช้เลขพาสปอร์ตแทนเลขบัตรประชาชน และไม่ใส่อีเมล
        // ไว้เป็นตัวอย่างว่าช่องอีเมลไม่บังคับจริง หน้าเว็บต้องทนกับค่า null ได้
        TenantResponse somchai = tenantService.create(new CreateTenantRequest(
                "สมชาย ใจดี", "1234567890123", "somchai.j", "081-234-5678", "somchai.j@example.com"));
        TenantResponse piyada = tenantService.create(new CreateTenantRequest(
                "ปิยะดา แสงทอง", "1234567890124", "piyada.s", "089-876-5432", "piyada.s@example.com"));
        tenantService.create(new CreateTenantRequest(
                "Kenji Watanabe", "AB1234567", "kenji.w", "062-111-2222", null));

        log.info("seed ผู้เช่าตัวอย่าง 3 คนเรียบร้อย");

        List<LeaseResponse> leases = seedLeases(somchai, piyada);
        if (leases.size() == 2) {
            seedReceipts(leases.get(0), leases.get(1));
        }
        lockRoomsUnderMaintenance();
        seedTickets();
    }

    /**
     * ใบแจ้งซ่อมตัวอย่างสี่ใบ (SSK-131) แท็บ Maintenance Tasks กับ Log จะได้ไม่ว่างตอนเดโม
     * <p>
     * ชื่อ รายละเอียด ช่าง และผู้แจ้งชุดเดียวกับ backend จำลอง (frontend/src/api/mockApi.ts)
     * สลับระหว่าง VITE_API_MOCK=1 กับของจริงแล้วเห็นหน้าจอชุดเดียวกัน วันนัดคิดจากวันที่ seed
     * ไม่เขียนเป็นวันตายตัว ข้อมูลตัวอย่างจะได้ไม่ดูเก่าไปเรื่อย ๆ
     * <p>
     * สร้างผ่าน MaintenanceService ใบใหม่เป็น OPEN เสมอ ใบที่กำลังทำจึงต้อง PATCH สถานะต่ออีกที
     * แบบเดียวกับที่แอดมินทำผ่านหน้าจอจริง
     */
    private void seedTickets() {
        LocalDate today = AppTime.today();
        seedTicket("106", "AC compressor replacement",
                "Air conditioner not cooling. Technician booked to swap the compressor; unit closed during the work.",
                "Air Conditioning", "HIGH", "Kenji Tanaka", "Sarah J.", today.plusDays(1), true);
        seedTicket("206", "Bathroom drain pipe leaking",
                "Water seeping into the ceiling below. Waiting on the plumber to lift the tiles.",
                "Plumbing", "MEDIUM", "Mei Lin", "David W.", today.plusDays(2), true);
        seedTicket("104", "Scheduled AC cleaning", "Six-month service due. Cleaning booked.",
                "Air Conditioning", "LOW", "Kenji Tanaka", "Alex P.", today.plusDays(3), true);
        // เพิ่งแจ้งเข้ามา ยังไม่มีช่างรับ ขึ้นป้าย Wait for Assign และเป็นใบเดียวที่ลบได้
        seedTicket("201", "Bathroom tap dripping", "Tenant reports the tap drips constantly.",
                "Plumbing", "MEDIUM", null, "Kenji Sato", null, false);

        log.info("seed ใบแจ้งซ่อมตัวอย่าง 4 ใบเรียบร้อย");
    }

    private void seedTicket(String roomNumber, String title, String detail, String maintenanceType,
            String priority, String assignedTo, String reportedBy, LocalDate scheduledDate,
            boolean inProgress) {
        roomRepository.findByRoomNumber(roomNumber).ifPresent(room -> {
            TicketResponse ticket = maintenanceService.create(new CreateTicketRequest(room.getId(), title,
                    detail, maintenanceType, priority, assignedTo, reportedBy, scheduledDate, null, null));
            if (inProgress) {
                maintenanceService.update(ticket.id(), new UpdateTicketRequest(
                        "IN_PROGRESS", null, null, null, null, null, null, null, null));
            }
        });
    }

    /**
     * ปิดซ่อมสองห้องให้ผังห้องมีครบทั้งสามสี ตั้งแต่เปิดเครื่อง ไม่ต้องไปกดล็อกเองก่อนทุกครั้ง
     * <p>
     * เลือกห้อง 106 กับ 206 ห้องเดียวกับที่ backend จำลองฝั่งหน้าเว็บ seed ไว้
     * (frontend/src/api/mockApi.ts) คนที่สลับไปมาระหว่าง VITE_API_MOCK=1 กับของจริง
     * จะได้เห็นหน้าจอชุดเดียวกัน ไม่ต้องมานั่งสงสัยว่าต่ออยู่กับตัวไหน
     * <p>
     * ตั้งธงผ่าน entity ตรง ๆ ไม่ผ่าน RoomService เพราะเมธอดนั้นรับสตริงจากหน้าเว็บ
     * แล้วแปลงกลับเป็นธงอีกที ตรงนี้รู้อยู่แล้วว่าจะล็อก จึงไม่ต้องเดินผ่านตัวแปลง
     */
    private void lockRoomsUnderMaintenance() {
        for (String roomNumber : List.of("106", "206")) {
            // ห้องมาจาก migration V2 ถ้าไม่เจอแปลว่าข้อมูลตึกถูกแก้ ข้ามไปเงียบ ๆ
            // ไม่ต้องให้ข้อมูลตัวอย่างเป็นเหตุให้แอปสตาร์ตไม่ขึ้น
            roomRepository.findByRoomNumber(roomNumber).ifPresent(room -> {
                room.lockForMaintenance();
                roomRepository.save(room);
                log.info("ล็อกห้อง {} เป็นซ่อมบำรุงให้ข้อมูลตัวอย่าง", room.getRoomNumber());
            });
        }
    }

    /**
     * ผูกผู้เช่าสองคนแรกเข้าห้องสองห้องแรก ผังห้องจะได้มีทั้งห้องว่างและห้องมีคนอยู่
     * ให้กดดูตั้งแต่เปิดเครื่อง ไม่ต้องนั่งสร้างสัญญาเองก่อนทุกครั้ง
     * <p>
     * เริ่มสัญญาย้อนหลังหนึ่งเดือนเพื่อให้สัญญาครอบวันนี้จริง ห้องถึงจะขึ้น OCCUPIED
     */
    private List<LeaseResponse> seedLeases(TenantResponse somchai, TenantResponse piyada) {
        List<Room> rooms = roomRepository.findAllByOrderByRoomNumberAsc();
        if (rooms.size() < 2) {
            log.warn("มีห้องน้อยกว่าสองห้อง ข้ามการ seed สัญญาเช่า");
            return List.of();
        }

        LocalDate startDate = AppTime.today().minusMonths(1);
        LeaseResponse first = createLease(rooms.get(0), somchai, startDate, null);
        LeaseResponse second = createLease(rooms.get(1), piyada, startDate, startDate.plusYears(1));

        log.info("seed สัญญาเช่าตัวอย่าง 2 ใบเรียบร้อย");
        return List.of(first, second);
    }

    /**
     * ใบเสร็จตัวอย่างสามใบ (SSK-16) หน้า Payments บน backend จริงจะไม่ว่างตอนเดโม และเห็นครบ
     * สามสถานะ คือชำระแล้ว เลยกำหนด และรอชำระ ป้ายสถานะของผู้เช่าในหน้า Tenants ก็คิดจากใบพวกนี้
     * <p>
     * ออกผ่าน ReceiptService กฎจริงทำงานครบ (อัตราจากสัญญา เลขใบเรียงตามปี ห้ามออกซ้ำเดือน)
     * ชุดข้อมูลแยกไว้ใน receiptPlan ให้เทสได้โดยไม่ต้องมี database
     */
    private void seedReceipts(LeaseResponse somchai, LeaseResponse piyada) {
        for (SeedReceipt seed : receiptPlan(AppTime.today(), somchai.id(), piyada.id())) {
            ReceiptResponse issued = receiptService.create(seed.request());
            if (seed.paid()) {
                receiptService.pay(issued.id(), "Cash");
            }
        }
        log.info("seed ใบเสร็จตัวอย่าง 3 ใบเรียบร้อย (ชำระแล้ว / เลยกำหนด / รอชำระ)");
    }

    /** ใบเสร็จหนึ่งใบที่จะออก และจะกดรับชำระให้เลยหรือไม่ */
    record SeedReceipt(CreateReceiptRequest request, boolean paid) {
    }

    /**
     * สองสัญญาตัวอย่างเริ่มเมื่อเดือนก่อน เดือนก่อนกับเดือนนี้จึงอยู่ในช่วงสัญญาเสมอ
     * <p>
     * ใบค้างของเดือนก่อนตั้งวันครบกำหนดเป็นเจ็ดวันก่อนเอง ไม่ใช้ค่าตั้งต้นวันที่ 5 ของเดือนนี้
     * เพราะถ้า seed ช่วงวันที่ 1 ถึง 5 ใบนั้นจะยังไม่เลยกำหนด ตอนเดโมจะไม่เห็นสถานะ Overdue
     */
    static List<SeedReceipt> receiptPlan(LocalDate today, Long firstLeaseId, Long secondLeaseId) {
        YearMonth thisMonth = YearMonth.from(today);
        String lastMonth = thisMonth.minusMonths(1).toString();
        return List.of(
                new SeedReceipt(new CreateReceiptRequest(firstLeaseId, lastMonth,
                        BigDecimal.valueOf(120), BigDecimal.valueOf(15), null), true),
                new SeedReceipt(new CreateReceiptRequest(secondLeaseId, lastMonth,
                        BigDecimal.valueOf(95), BigDecimal.valueOf(12), today.minusDays(7)), false),
                new SeedReceipt(new CreateReceiptRequest(firstLeaseId, thisMonth.toString(),
                        BigDecimal.valueOf(130), BigDecimal.valueOf(14), null), false));
    }

    private LeaseResponse createLease(Room room, TenantResponse tenant, LocalDate startDate, LocalDate endDate) {
        // มัดจำสองเท่าของค่าเช่าเป็นธรรมเนียมหอพักไทยทั่วไป ค่าตั้งต้น 0 ของ service
        // จึงไม่เหมาะกับข้อมูลตัวอย่าง ใส่เองให้เห็นตัวเลขจริงตอนกดดู
        // ค่าเช่าอ่านจากชนิดห้องตั้งแต่ V12 ห้องไม่มีคอลัมน์ base_rent แล้ว
        BigDecimal rent = roomTypeRateRepository.findById(room.getRoomType())
                .map(RoomTypeRate::getMonthlyRent)
                .orElseThrow(() -> new IllegalStateException(
                        "ไม่มีค่าเช่าของชนิดห้อง " + room.getRoomType() + " ในตาราง room_type"));
        BigDecimal securityDeposit = rent.multiply(BigDecimal.valueOf(2));

        // ค่าเช่าส่ง null เพราะ LeaseService หาเองจากชนิดห้อง (V12) ส่งมาก็ถูกมองข้าม
        // อัตราสี่ตัวส่ง null ไปให้ LeaseService คัดลอกจาก apartment_config เอง
        // ข้อมูลตัวอย่างจะได้ตรงกับอัตราที่ตั้งไว้จริง ไม่ใช่ชุดที่ก๊อปมาแปะไว้ที่นี่
        return leaseService.create(new LeaseRequest(room.getId(), tenant.id(), startDate, endDate,
                null, BillingCycle.MONTHLY, securityDeposit,
                null, null, null, null));
    }
}
