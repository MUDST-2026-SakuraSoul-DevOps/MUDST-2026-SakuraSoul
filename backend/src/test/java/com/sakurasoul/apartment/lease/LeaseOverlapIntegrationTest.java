package com.sakurasoul.apartment.lease;

import com.sakurasoul.apartment.TestcontainersConfiguration;
import com.sakurasoul.apartment.common.AppTime;
import com.sakurasoul.apartment.common.ConflictException;
import com.sakurasoul.apartment.lease.LeaseDtos.LeaseRequest;
import com.sakurasoul.apartment.lease.LeaseDtos.LeaseResponse;
import com.sakurasoul.apartment.room.Room;
import com.sakurasoul.apartment.room.RoomDetailResponse;
import com.sakurasoul.apartment.room.RoomRepository;
import com.sakurasoul.apartment.room.RoomService;
import com.sakurasoul.apartment.room.RoomStatus;
import com.sakurasoul.apartment.tenant.Tenant;
import com.sakurasoul.apartment.tenant.TenantRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIf;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataIntegrityViolationException;
import org.testcontainers.DockerClientFactory;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * พิสูจน์เรื่องที่ unit test ทำแทนไม่ได้ เพราะเป็นพฤติกรรมของ PostgreSQL จริง
 * <p>
 * หนึ่ง คือ "Then" ของ US-04-S1 ที่ว่าสร้างสัญญาแล้วห้องต้องกลายเป็นมีผู้เช่าเอง
 * สอง คือ constraint lease_no_overlap กันปล่อยเช่าซ้อนได้จริงถึงจะข้ามการเช็คในโค้ดไป
 * ซึ่งเป็นหัวใจของ US-05-S2 เรื่องสองคำขอที่เข้ามาพร้อมกัน
 * สาม คือ อัตราที่ล็อกไว้กับสัญญาอยู่รอดผ่านการเขียนลงฐานแล้วอ่านกลับมาได้ครบ
 * <p>
 * ต้องใช้ Postgres ตัวจริง H2 ไม่มี EXCLUDE USING gist ให้ใช้ เทสจึงยก container ขึ้นมา
 * ถ้าเครื่องไหนไม่ได้เปิด Docker เทสชุดนี้จะถูกข้าม ไม่ใช่ล้ม เพื่อไม่ให้คนที่ยังไม่ได้
 * ติดตั้ง Docker รัน ./gradlew build ไม่ผ่าน ส่วนบน CI ที่มี Docker อยู่แล้วจะรันจริง
 */
@SpringBootTest
@Import(TestcontainersConfiguration.class)
@EnabledIf("dockerAvailable")
class LeaseOverlapIntegrationTest {

    private static final BigDecimal DEPOSIT = new BigDecimal("7000.00");
    private static final BigDecimal ELECTRIC = new BigDecimal("8.00");
    private static final BigDecimal WATER = new BigDecimal("18.00");
    private static final BigDecimal COMMON_AREA = new BigDecimal("300.00");
    private static final BigDecimal INTERNET = new BigDecimal("250.00");

    @Autowired
    private LeaseService leaseService;

    @Autowired
    private RoomService roomService;

    @Autowired
    private LeaseRepository leaseRepository;

    @Autowired
    private RoomRepository roomRepository;

    @Autowired
    private TenantRepository tenantRepository;

    static boolean dockerAvailable() {
        return DockerClientFactory.instance().isDockerAvailable();
    }

    @AfterEach
    void clearLeases() {
        leaseRepository.deleteAll();
    }

    @Test
    @DisplayName("สร้างสัญญาแล้วห้องเปลี่ยนเป็น OCCUPIED เองโดยไม่ต้องสั่งแยก (US-04-S1)")
    void creatingLeaseFlipsRoomToOccupied() {
        Room room = anyRoom(0);
        Tenant tenant = newTenant("ยูกิ ทานากะ");
        LocalDate today = AppTime.today();

        assertThat(roomService.getRoom(room.getId()).status()).isEqualTo(RoomStatus.AVAILABLE);

        leaseService.create(request(room, tenant, today.minusDays(10), today.plusDays(10)));

        RoomDetailResponse after = roomService.getRoom(room.getId());
        assertThat(after.status()).isEqualTo(RoomStatus.OCCUPIED);
        assertThat(after.currentLease()).isNotNull();
        assertThat(after.currentLease().tenantName()).isEqualTo("ยูกิ ทานากะ");
    }

    @Test
    @DisplayName("สัญญาที่ยังไม่ถึงวันเริ่มไม่ทำให้ห้องขึ้นว่ามีผู้เช่าก่อนเวลา")
    void futureLeaseKeepsRoomAvailable() {
        Room room = anyRoom(1);
        Tenant tenant = newTenant("สมชาย ใจดี");
        LocalDate nextMonth = AppTime.today().plusMonths(1);

        leaseService.create(request(room, tenant, nextMonth, nextMonth.plusMonths(6)));

        assertThat(roomService.getRoom(room.getId()).status()).isEqualTo(RoomStatus.AVAILABLE);
    }

    @Test
    @DisplayName("ยิงสร้างสัญญาทับช่วงเดิมผ่าน service ต้องได้ 409 พร้อมข้อความที่บอกว่าชนกับใคร")
    void serviceRejectsOverlapWithReadableMessage() {
        Room room = anyRoom(2);
        Tenant first = newTenant("ยูกิ ทานากะ");
        Tenant second = newTenant("ปิยะดา แสงทอง");

        leaseService.create(request(room, first, LocalDate.of(2026, 1, 1), LocalDate.of(2026, 12, 31)));

        assertThatThrownBy(() -> leaseService.create(
                request(room, second, LocalDate.of(2026, 6, 1), LocalDate.of(2027, 5, 31))))
                .isInstanceOf(ConflictException.class)
                .hasMessageContaining(room.getRoomNumber())
                .hasMessageContaining("2026-01-01")
                .hasMessageContaining("ยูกิ ทานากะ");
    }

    @Test
    @DisplayName("ข้ามการเช็คในโค้ดแล้วเขียนตรงเข้า database ยังต้องโดน constraint กันไว้ (US-05-S2)")
    void databaseConstraintBlocksOverlapEvenWithoutServiceCheck() {
        Room room = anyRoom(3);
        Tenant first = newTenant("ยูกิ ทานากะ");
        Tenant second = newTenant("Kenji Watanabe");

        leaseRepository.saveAndFlush(new Lease(room, first,
                LocalDate.of(2026, 1, 1), LocalDate.of(2026, 12, 31), room.getBaseRent(),
                BillingCycle.MONTHLY, charges(ELECTRIC)));

        // จงใจไม่ผ่าน LeaseService เพื่อจำลองสองคำขอที่เช็คผ่านพร้อมกันแล้วเขียนลงไปทั้งคู่
        Lease overlapping = new Lease(room, second,
                LocalDate.of(2026, 12, 31), null, room.getBaseRent(),
                BillingCycle.MONTHLY, charges(ELECTRIC));

        assertThatThrownBy(() -> leaseRepository.saveAndFlush(overlapping))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    @DisplayName("อัตราที่ล็อกไว้อยู่รอดผ่าน database จริง และสัญญาคนละใบถืออัตราคนละชุดได้")
    void lockedRatesSurviveARoundTripAndStayPerContract() {
        Tenant tenant = newTenant("ยูกิ ทานากะ");

        // ใบแรกทำตอนค่าไฟหน่วยละ 8 บาท
        LeaseResponse before = leaseService.create(request(anyRoom(4), tenant,
                LocalDate.of(2026, 1, 1), LocalDate.of(2026, 12, 31)));

        // ใบที่สองทำหลังแอดมินขึ้นค่าไฟเป็น 12.50 บาท คนละห้องกันจะได้ไม่ติด constraint
        BigDecimal raised = new BigDecimal("12.50");
        Room laterRoom = anyRoom(5);
        leaseRepository.saveAndFlush(new Lease(laterRoom, tenant,
                LocalDate.of(2026, 1, 1), LocalDate.of(2026, 12, 31), laterRoom.getBaseRent(),
                BillingCycle.MONTHLY, charges(raised)));

        // อ่านใบแรกกลับมาจากฐานใหม่หมด ต้องยังเป็นอัตราเดิม ไม่ได้ถูกอัตราใหม่ทับ
        Lease reloaded = leaseRepository.findById(before.id()).orElseThrow();
        assertThat(reloaded.getCharges().getElectricRatePerUnit()).isEqualByComparingTo(ELECTRIC);
        assertThat(reloaded.getCharges().getWaterRatePerUnit()).isEqualByComparingTo(WATER);
        assertThat(reloaded.getCharges().getCommonAreaFee()).isEqualByComparingTo(COMMON_AREA);
        assertThat(reloaded.getCharges().getInternetFee()).isEqualByComparingTo(INTERNET);
        assertThat(reloaded.getCharges().getSecurityDeposit()).isEqualByComparingTo(DEPOSIT);
    }

    private static LeaseCharges charges(BigDecimal electricRate) {
        return new LeaseCharges(DEPOSIT, electricRate, WATER, COMMON_AREA, INTERNET);
    }

    private static LeaseRequest request(Room room, Tenant tenant, LocalDate startDate, LocalDate endDate) {
        return new LeaseRequest(room.getId(), tenant.getId(), startDate, endDate, room.getBaseRent(),
                BillingCycle.MONTHLY, DEPOSIT, ELECTRIC, WATER, COMMON_AREA, INTERNET);
    }

    /** ห้องมาจาก migration V2 ใช้คนละห้องในแต่ละเทสจะได้ไม่ต้องพึ่งลำดับการรัน */
    private Room anyRoom(int index) {
        List<Room> rooms = roomRepository.findAllByOrderByRoomNumberAsc();
        assertThat(rooms).hasSizeGreaterThan(index);
        return rooms.get(index);
    }

    private Tenant newTenant(String fullName) {
        return tenantRepository.saveAndFlush(new Tenant(fullName, "081-000-0000", null));
    }
}
