package com.sakurasoul.apartment.dev;

import com.sakurasoul.apartment.common.AppTime;
import com.sakurasoul.apartment.lease.BillingCycle;
import com.sakurasoul.apartment.lease.LeaseDtos.LeaseRequest;
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
    private final LeaseService leaseService;

    public DevDataSeeder(TenantRepository tenantRepository, TenantService tenantService,
            RoomRepository roomRepository, LeaseService leaseService) {
        this.tenantRepository = tenantRepository;
        this.tenantService = tenantService;
        this.roomRepository = roomRepository;
        this.leaseService = leaseService;
    }

    @Override
    public void run(ApplicationArguments args) {
        if (tenantRepository.count() > 0) {
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

    /**
     * อัตราตัวอย่างชุดเดียวกับที่ backend จำลองฝั่งหน้าเว็บ seed ไว้ (mockApi.ts)
     * ของจริงหน้าเว็บจะเติมมาจาก Apartment Config ให้ ที่นี่แค่ต้องใส่อะไรสักอย่างให้ครบ
     */
    private static final BigDecimal ELECTRIC_RATE = new BigDecimal("8.00");
    private static final BigDecimal WATER_RATE = new BigDecimal("18.00");
    private static final BigDecimal COMMON_AREA_FEE = new BigDecimal("300.00");
    private static final BigDecimal INTERNET_FEE = new BigDecimal("250.00");

    private void createLease(Room room, TenantResponse tenant, LocalDate startDate, LocalDate endDate) {
        // มัดจำสองเท่าของค่าเช่าเป็นธรรมเนียมหอพักไทยทั่วไป
        BigDecimal securityDeposit = room.getBaseRent().multiply(BigDecimal.valueOf(2));

        leaseService.create(new LeaseRequest(room.getId(), tenant.id(), startDate, endDate,
                room.getBaseRent(), BillingCycle.MONTHLY, securityDeposit,
                ELECTRIC_RATE, WATER_RATE, COMMON_AREA_FEE, INTERNET_FEE));
    }
}
