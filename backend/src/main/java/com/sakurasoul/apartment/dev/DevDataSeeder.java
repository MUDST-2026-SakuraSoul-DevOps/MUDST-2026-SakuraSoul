package com.sakurasoul.apartment.dev;

import com.sakurasoul.apartment.common.AppTime;
import com.sakurasoul.apartment.lease.BillingCycle;
import com.sakurasoul.apartment.lease.LeaseDtos.LeaseRequest;
import com.sakurasoul.apartment.lease.LeaseRepository;
import com.sakurasoul.apartment.lease.LeaseService;
import com.sakurasoul.apartment.room.Room;
import com.sakurasoul.apartment.room.RoomRepository;
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
    private final LeaseRepository leaseRepository;
    private final LeaseService leaseService;

    public DevDataSeeder(TenantRepository tenantRepository, TenantService tenantService,
            RoomRepository roomRepository, LeaseRepository leaseRepository, LeaseService leaseService) {
        this.tenantRepository = tenantRepository;
        this.tenantService = tenantService;
        this.roomRepository = roomRepository;
        this.leaseRepository = leaseRepository;
        this.leaseService = leaseService;
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

        TenantResponse somchai =
                tenantService.create(new CreateTenantRequest("สมชาย ใจดี", "081-234-5678", "1234567890123"));
        TenantResponse piyada =
                tenantService.create(new CreateTenantRequest("ปิยะดา แสงทอง", "089-876-5432", "1234567890124"));
        tenantService.create(new CreateTenantRequest("Kenji Watanabe", "062-111-2222", null));

        log.info("seed ผู้เช่าตัวอย่าง 3 คนเรียบร้อย");

        seedLeases(somchai, piyada);
        lockRoomsUnderMaintenance();
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
    private void seedLeases(TenantResponse somchai, TenantResponse piyada) {
        List<Room> rooms = roomRepository.findAllByOrderByRoomNumberAsc();
        if (rooms.size() < 2) {
            log.warn("มีห้องน้อยกว่าสองห้อง ข้ามการ seed สัญญาเช่า");
            return;
        }

        LocalDate startDate = AppTime.today().minusMonths(1);
        createLease(rooms.get(0), somchai, startDate, null);
        createLease(rooms.get(1), piyada, startDate, startDate.plusYears(1));

        log.info("seed สัญญาเช่าตัวอย่าง 2 ใบเรียบร้อย");
    }

    private void createLease(Room room, TenantResponse tenant, LocalDate startDate, LocalDate endDate) {
        // มัดจำสองเท่าของค่าเช่าเป็นธรรมเนียมหอพักไทยทั่วไป ค่าตั้งต้น 0 ของ service
        // จึงไม่เหมาะกับข้อมูลตัวอย่าง ใส่เองให้เห็นตัวเลขจริงตอนกดดู
        BigDecimal securityDeposit = room.getBaseRent().multiply(BigDecimal.valueOf(2));

        // อัตราสี่ตัวส่ง null ไปให้ LeaseService คัดลอกจาก apartment_config เอง
        // ข้อมูลตัวอย่างจะได้ตรงกับอัตราที่ตั้งไว้จริง ไม่ใช่ชุดที่ก๊อปมาแปะไว้ที่นี่
        leaseService.create(new LeaseRequest(room.getId(), tenant.id(), startDate, endDate,
                room.getBaseRent(), BillingCycle.MONTHLY, securityDeposit,
                null, null, null, null));
    }
}
