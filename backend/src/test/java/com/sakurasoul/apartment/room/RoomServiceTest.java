package com.sakurasoul.apartment.room;

import com.sakurasoul.apartment.common.AppTime;
import com.sakurasoul.apartment.common.NotFoundException;
import com.sakurasoul.apartment.lease.BillingCycle;
import com.sakurasoul.apartment.lease.Lease;
import com.sakurasoul.apartment.lease.LeaseCharges;
import com.sakurasoul.apartment.lease.LeaseRepository;
import com.sakurasoul.apartment.lease.LeaseStatus;
import com.sakurasoul.apartment.tenant.Tenant;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;

/**
 * ตัวอย่างการเขียน unit test ฝั่ง backend ไว้ให้ทีมก๊อปไปทำส่วนของตัวเอง
 * <p>
 * ไม่แตะ database ไม่ยก Spring context ใช้ Mockito ปลอม repository เอา
 * เทสแบบนี้รันเร็วมากและพังเฉพาะตอน logic ผิดจริง ไม่ใช่ตอน environment มีปัญหา
 * <p>
 * ชุดหลังเป็นของ US-04 ตอน "Then" ที่ว่าสร้างสัญญาแล้วห้องต้องเปลี่ยนเป็นมีผู้เช่าเอง
 * ซึ่งฝั่ง backend แปลว่าสถานะห้องต้องคำนวณจากสัญญา ไม่ได้เก็บเป็นคอลัมน์
 * <p>
 * ชุดท้ายสุดเป็นของ US-15 ล็อกห้องเป็นซ่อมบำรุง จุดที่ต้องระวังคือธงซ่อมกับสัญญาเป็นคนละ
 * เรื่องกัน ปลดล็อกห้องที่ยังมีผู้เช่าต้องได้ OCCUPIED ไม่ใช่ AVAILABLE ตามที่ส่งมา
 */
@ExtendWith(MockitoExtension.class)
class RoomServiceTest {

    @Mock
    private RoomRepository roomRepository;

    @Mock
    private LeaseRepository leaseRepository;

    @InjectMocks
    private RoomService roomService;

    @Test
    @DisplayName("แปลง entity เป็น response ครบทุกฟิลด์และคงลำดับที่ repository ส่งมา")
    void listRoomsMapsEveryField() {
        when(roomRepository.findAllByOrderByRoomNumberAsc())
                .thenReturn(List.of(room(1L, "101", (short) 1, "3500.00"),
                        room(2L, "201", (short) 2, "3800.00")));
        when(leaseRepository.findByStatus(LeaseStatus.ACTIVE)).thenReturn(List.of());

        List<RoomSummaryResponse> rooms = roomService.listRooms();

        assertThat(rooms).hasSize(2);
        assertThat(rooms.get(0).roomNumber()).isEqualTo("101");
        assertThat(rooms.get(0).floor()).isEqualTo(1);
        assertThat(rooms.get(0).baseRent()).isEqualByComparingTo("3500.00");
        assertThat(rooms.get(1).roomNumber()).isEqualTo("201");
        assertThat(rooms.get(1).floor()).isEqualTo(2);
    }

    @Test
    @DisplayName("ไม่มีห้องในระบบต้องได้ลิสต์ว่าง ไม่ใช่ null")
    void listRoomsReturnsEmptyListWhenNoRooms() {
        when(roomRepository.findAllByOrderByRoomNumberAsc()).thenReturn(List.of());
        when(leaseRepository.findByStatus(LeaseStatus.ACTIVE)).thenReturn(List.of());

        assertThat(roomService.listRooms()).isEmpty();
    }

    @Test
    @DisplayName("ขอห้องที่มีอยู่ ต้องได้รายละเอียดรวมหมายเหตุ")
    void getRoomReturnsDetail() {
        Room room = room(5L, "105", (short) 1, "3500.00");
        room.setNote("แอร์เพิ่งล้างเมื่อเดือนที่แล้ว");
        when(roomRepository.findById(5L)).thenReturn(Optional.of(room));
        when(leaseRepository.findByRoomIdAndStatus(5L, LeaseStatus.ACTIVE)).thenReturn(List.of());

        RoomDetailResponse detail = roomService.getRoom(5L);

        assertThat(detail.roomNumber()).isEqualTo("105");
        assertThat(detail.note()).isEqualTo("แอร์เพิ่งล้างเมื่อเดือนที่แล้ว");
    }

    @Test
    @DisplayName("ขอห้องที่ไม่มีต้องโยน NotFoundException เพื่อให้กลายเป็น 404 ไม่ใช่ 500")
    void getRoomThrowsWhenMissing() {
        when(roomRepository.findById(999L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> roomService.getRoom(999L))
                .isInstanceOf(NotFoundException.class)
                .hasMessageContaining("999");
    }

    @Test
    @DisplayName("ห้องที่ไม่มีสัญญาต้องเป็น AVAILABLE และไม่มี currentLease")
    void listRoomsMarksRoomWithoutLeaseAsAvailable() {
        when(roomRepository.findAllByOrderByRoomNumberAsc())
                .thenReturn(List.of(room(1L, "101", (short) 1, "3500.00")));
        when(leaseRepository.findByStatus(LeaseStatus.ACTIVE)).thenReturn(List.of());

        RoomSummaryResponse room = roomService.listRooms().getFirst();

        assertThat(room.status()).isEqualTo(RoomStatus.AVAILABLE);
        assertThat(room.currentLease()).isNull();
    }

    @Test
    @DisplayName("ห้องที่มีสัญญาครอบวันนี้ต้องเป็น OCCUPIED พร้อมชื่อผู้เช่า (US-04-S1 ตอน Then)")
    void listRoomsMarksLeasedRoomAsOccupied() {
        Room room = room(2L, "102", (short) 1, "3500.00");
        LocalDate today = AppTime.today();
        Lease lease = lease(7L, room, tenant(1L, "ยูกิ ทานากะ"), today.minusMonths(1), today.plusMonths(1));

        when(roomRepository.findAllByOrderByRoomNumberAsc()).thenReturn(List.of(room));
        when(leaseRepository.findByStatus(LeaseStatus.ACTIVE)).thenReturn(List.of(lease));

        RoomSummaryResponse summary = roomService.listRooms().getFirst();

        assertThat(summary.status()).isEqualTo(RoomStatus.OCCUPIED);
        assertThat(summary.currentLease()).isNotNull();
        assertThat(summary.currentLease().tenantName()).isEqualTo("ยูกิ ทานากะ");
        assertThat(summary.currentLease().id()).isEqualTo(7L);
    }

    @Test
    @DisplayName("สัญญาที่เซ็นล่วงหน้าไว้เดือนหน้ายังไม่ทำให้ห้องกลายเป็นมีผู้เช่าวันนี้")
    void listRoomsIgnoresLeaseThatStartsLater() {
        Room room = room(3L, "103", (short) 1, "3500.00");
        LocalDate nextMonth = AppTime.today().plusMonths(1);
        Lease future = lease(8L, room, tenant(2L, "สมชาย ใจดี"), nextMonth, nextMonth.plusMonths(6));

        when(roomRepository.findAllByOrderByRoomNumberAsc()).thenReturn(List.of(room));
        when(leaseRepository.findByStatus(LeaseStatus.ACTIVE)).thenReturn(List.of(future));

        RoomSummaryResponse summary = roomService.listRooms().getFirst();

        assertThat(summary.status()).isEqualTo(RoomStatus.AVAILABLE);
        assertThat(summary.currentLease()).isNull();
    }

    @Test
    @DisplayName("สัญญาที่ไม่กำหนดวันจบยังนับว่าครอบวันนี้อยู่")
    void getRoomTreatsOpenEndedLeaseAsCovering() {
        Room room = room(4L, "104", (short) 1, "3500.00");
        Lease openEnded = lease(9L, room, tenant(3L, "Kenji Watanabe"),
                AppTime.today().minusDays(1), null);

        when(roomRepository.findById(4L)).thenReturn(Optional.of(room));
        when(leaseRepository.findByRoomIdAndStatus(4L, LeaseStatus.ACTIVE)).thenReturn(List.of(openEnded));

        RoomDetailResponse detail = roomService.getRoom(4L);

        assertThat(detail.status()).isEqualTo(RoomStatus.OCCUPIED);
        assertThat(detail.currentLease().endDate()).isNull();
    }

    @Test
    @DisplayName("US-15 ห้องที่ปิดซ่อมต้องเป็น MAINTENANCE ถึงจะมีสัญญาครอบวันนี้อยู่ก็ตาม")
    void lockedRoomBeatsItsActiveLease() {
        Room room = room(6L, "106", (short) 1, "3500.00");
        room.lockForMaintenance();
        LocalDate today = AppTime.today();
        Lease lease = lease(10L, room, tenant(4L, "อาริสา พงษ์ศิริ"), today.minusMonths(2), null);

        when(roomRepository.findAllByOrderByRoomNumberAsc()).thenReturn(List.of(room));
        when(leaseRepository.findByStatus(LeaseStatus.ACTIVE)).thenReturn(List.of(lease));

        RoomSummaryResponse summary = roomService.listRooms().getFirst();

        assertThat(summary.status()).isEqualTo(RoomStatus.MAINTENANCE);
        // สัญญายังอยู่ครบ การล็อกห้องไม่ได้ไปยกเลิกใคร แค่บังสถานะที่โชว์ไว้
        assertThat(summary.currentLease()).isNotNull();
        assertThat(summary.currentLease().tenantName()).isEqualTo("อาริสา พงษ์ศิริ");
    }

    @Test
    @DisplayName("US-15-S1 สั่ง MAINTENANCE ต้องติดธงที่ห้องและตอบสถานะใหม่กลับไป")
    void updateStatusToMaintenanceLocksTheRoom() {
        Room room = room(1L, "101", (short) 1, "3500.00");
        when(roomRepository.findById(1L)).thenReturn(Optional.of(room));
        when(roomRepository.saveAndFlush(room)).thenReturn(room);
        when(leaseRepository.findByRoomIdAndStatus(1L, LeaseStatus.ACTIVE)).thenReturn(List.of());

        RoomDetailResponse detail = roomService.updateStatus(1L, "MAINTENANCE");

        assertThat(detail.status()).isEqualTo(RoomStatus.MAINTENANCE);
        assertThat(room.isUnderMaintenance()).isTrue();
    }

    /**
     * หัวใจของ US-15-S2 ส่ง AVAILABLE มาแต่ได้ OCCUPIED กลับไป เพราะสิ่งที่สั่งคือ
     * "ปลดธงซ่อม" ไม่ใช่ "ตั้งสถานะเป็นว่าง" สถานะที่เห็นยังคำนวณจากสัญญาเหมือนเดิม
     */
    @Test
    @DisplayName("US-15-S2 ปลดล็อกห้องที่ยังมีสัญญาครอบวันนี้ ต้องได้ OCCUPIED ไม่ใช่ AVAILABLE")
    void updateStatusToAvailableFallsBackToTheLeaseDerivedStatus() {
        Room room = room(2L, "102", (short) 1, "3500.00");
        room.lockForMaintenance();
        LocalDate today = AppTime.today();
        Lease lease = lease(11L, room, tenant(1L, "ยูกิ ทานากะ"), today.minusMonths(1), today.plusMonths(1));

        when(roomRepository.findById(2L)).thenReturn(Optional.of(room));
        when(roomRepository.saveAndFlush(room)).thenReturn(room);
        when(leaseRepository.findByRoomIdAndStatus(2L, LeaseStatus.ACTIVE)).thenReturn(List.of(lease));

        RoomDetailResponse detail = roomService.updateStatus(2L, "AVAILABLE");

        assertThat(detail.status()).isEqualTo(RoomStatus.OCCUPIED);
        assertThat(detail.currentLease().tenantName()).isEqualTo("ยูกิ ทานากะ");
        assertThat(room.isUnderMaintenance()).isFalse();
    }

    @Test
    @DisplayName("US-15 ปลดล็อกห้องที่ไม่มีสัญญา ต้องกลับไปเป็น AVAILABLE")
    void updateStatusToAvailableClearsTheFlagOnAnEmptyRoom() {
        Room room = room(3L, "103", (short) 1, "3500.00");
        room.lockForMaintenance();

        when(roomRepository.findById(3L)).thenReturn(Optional.of(room));
        when(roomRepository.saveAndFlush(room)).thenReturn(room);
        when(leaseRepository.findByRoomIdAndStatus(3L, LeaseStatus.ACTIVE)).thenReturn(List.of());

        assertThat(roomService.updateStatus(3L, "AVAILABLE").status()).isEqualTo(RoomStatus.AVAILABLE);
        assertThat(room.isUnderMaintenance()).isFalse();
    }

    /**
     * ข้อความต้องตรงตัวอักษรกับที่ backend จำลองฝั่งหน้าเว็บตอบ
     * (frontend/src/api/mockApi.ts) เพราะหน้าเว็บเอา detail ไปโชว์ตรง ๆ
     */
    @Test
    @DisplayName("US-15 ส่งสถานะที่ตั้งเองไม่ได้ ต้องโยน IllegalArgumentException พร้อมข้อความที่ตกลงไว้")
    void updateStatusRejectsValuesThatCannotBeSetByHand() {
        Room room = room(1L, "101", (short) 1, "3500.00");
        when(roomRepository.findById(1L)).thenReturn(Optional.of(room));

        // OCCUPIED เป็นค่าที่ระบบใช้จริง แต่ตั้งเองไม่ได้ ต้องเกิดจากสัญญาเท่านั้น
        assertThatThrownBy(() -> roomService.updateStatus(1L, "OCCUPIED"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("สถานะที่ตั้งเองได้มีแค่ MAINTENANCE กับ AVAILABLE");

        // ตัวพิมพ์เล็กกับค่าที่ไม่ได้ส่งมาเลยก็ต้องได้ข้อความเดียวกัน ไม่ใช่ 500
        assertThatThrownBy(() -> roomService.updateStatus(1L, "maintenance"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("สถานะที่ตั้งเองได้มีแค่ MAINTENANCE กับ AVAILABLE");
        assertThatThrownBy(() -> roomService.updateStatus(1L, null))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("สถานะที่ตั้งเองได้มีแค่ MAINTENANCE กับ AVAILABLE");

        // ธงต้องไม่ถูกแตะเลยเมื่อคำขอไม่ผ่าน
        assertThat(room.isUnderMaintenance()).isFalse();
    }

    @Test
    @DisplayName("US-15 ล็อกห้องที่ไม่มีต้องเป็น NotFoundException เพื่อให้กลายเป็น 404 ไม่ใช่ 500")
    void updateStatusThrowsWhenRoomIsMissing() {
        when(roomRepository.findById(999L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> roomService.updateStatus(999L, "MAINTENANCE"))
                .isInstanceOf(NotFoundException.class)
                .hasMessage("ไม่พบห้อง id 999");
    }

    private static Room room(Long id, String roomNumber, short floor, String baseRent) {
        Room room = new Room(roomNumber, floor, new BigDecimal(baseRent));
        // id ถูกกำหนดโดย database ตอน insert เทสเลยต้องยัดเอง
        ReflectionTestUtils.setField(room, "id", id);
        return room;
    }

    private static Tenant tenant(Long id, String fullName) {
        // repository ถูกปลอมทั้งหมด ค่าติดตัวจึงไม่มีผลกับเทส ขอแค่ครบช่องตาม constructor ชุดใหม่
        Tenant tenant = new Tenant(fullName, "1234567890123", "yuki.t", "081-000-0000", "yuki.t@example.com");
        ReflectionTestUtils.setField(tenant, "id", id);
        return tenant;
    }

    private static Lease lease(Long id, Room room, Tenant tenant, LocalDate startDate, LocalDate endDate) {
        // อัตราที่ล็อกไว้ไม่เกี่ยวกับการคำนวณสถานะห้อง ใส่ค่าตัวอย่างให้ constructor ครบพอ
        LeaseCharges charges = new LeaseCharges(new BigDecimal("7000.00"), new BigDecimal("8.00"),
                new BigDecimal("18.00"), new BigDecimal("300.00"), new BigDecimal("250.00"));
        Lease lease = new Lease(room, tenant, startDate, endDate, new BigDecimal("3500.00"),
                BillingCycle.MONTHLY, charges);
        ReflectionTestUtils.setField(lease, "id", id);
        return lease;
    }
}
