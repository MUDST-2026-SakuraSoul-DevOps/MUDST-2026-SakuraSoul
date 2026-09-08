package com.sakurasoul.apartment.lease;

import com.sakurasoul.apartment.TestcontainersConfiguration;
import com.sakurasoul.apartment.common.AppTime;
import com.sakurasoul.apartment.common.ConflictException;
import com.sakurasoul.apartment.lease.LeaseDtos.LeaseRequest;
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
 * พิสูจน์สองเรื่องที่ unit test ทำแทนไม่ได้ เพราะทั้งคู่เป็นพฤติกรรมของ PostgreSQL จริง
 * <p>
 * หนึ่ง คือ "Then" ของ US-04-S1 ที่ว่าสร้างสัญญาแล้วห้องต้องกลายเป็นมีผู้เช่าเอง
 * สอง คือ constraint lease_no_overlap กันปล่อยเช่าซ้อนได้จริงถึงจะข้ามการเช็คในโค้ดไป
 * ซึ่งข้อสองคือหัวใจของ US-05-S2 เรื่องสองคำขอที่เข้ามาพร้อมกัน
 * <p>
 * ต้องใช้ Postgres ตัวจริง H2 ไม่มี EXCLUDE USING gist ให้ใช้ เทสจึงยก container ขึ้นมา
 * ถ้าเครื่องไหนไม่ได้เปิด Docker เทสชุดนี้จะถูกข้าม ไม่ใช่ล้ม เพื่อไม่ให้คนที่ยังไม่ได้
 * ติดตั้ง Docker รัน ./gradlew build ไม่ผ่าน ส่วนบน CI ที่มี Docker อยู่แล้วจะรันจริง
 */
@SpringBootTest
@Import(TestcontainersConfiguration.class)
@EnabledIf("dockerAvailable")
class LeaseOverlapIntegrationTest {

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

        leaseService.create(new LeaseRequest(room.getId(), tenant.getId(),
                today.minusDays(10), today.plusDays(10), room.getBaseRent(), BillingCycle.MONTHLY));

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

        leaseService.create(new LeaseRequest(room.getId(), tenant.getId(),
                nextMonth, nextMonth.plusMonths(6), room.getBaseRent(), BillingCycle.MONTHLY));

        assertThat(roomService.getRoom(room.getId()).status()).isEqualTo(RoomStatus.AVAILABLE);
    }

    @Test
    @DisplayName("ยิงสร้างสัญญาทับช่วงเดิมผ่าน service ต้องได้ 409 พร้อมข้อความที่บอกว่าชนกับใคร")
    void serviceRejectsOverlapWithReadableMessage() {
        Room room = anyRoom(2);
        Tenant first = newTenant("ยูกิ ทานากะ");
        Tenant second = newTenant("ปิยะดา แสงทอง");

        leaseService.create(new LeaseRequest(room.getId(), first.getId(),
                LocalDate.of(2026, 1, 1), LocalDate.of(2026, 12, 31),
                room.getBaseRent(), BillingCycle.MONTHLY));

        assertThatThrownBy(() -> leaseService.create(new LeaseRequest(room.getId(), second.getId(),
                LocalDate.of(2026, 6, 1), LocalDate.of(2027, 5, 31),
                room.getBaseRent(), BillingCycle.MONTHLY)))
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
        BigDecimal rent = room.getBaseRent();

        leaseRepository.saveAndFlush(new Lease(room, first,
                LocalDate.of(2026, 1, 1), LocalDate.of(2026, 12, 31), rent, BillingCycle.MONTHLY));

        // จงใจไม่ผ่าน LeaseService เพื่อจำลองสองคำขอที่เช็คผ่านพร้อมกันแล้วเขียนลงไปทั้งคู่
        Lease overlapping = new Lease(room, second,
                LocalDate.of(2026, 12, 31), null, rent, BillingCycle.MONTHLY);

        assertThatThrownBy(() -> leaseRepository.saveAndFlush(overlapping))
                .isInstanceOf(DataIntegrityViolationException.class);
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
