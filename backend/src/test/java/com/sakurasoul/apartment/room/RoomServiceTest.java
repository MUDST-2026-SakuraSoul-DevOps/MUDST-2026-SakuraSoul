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

    private static Room room(Long id, String roomNumber, short floor, String baseRent) {
        Room room = new Room(roomNumber, floor, new BigDecimal(baseRent));
        // id ถูกกำหนดโดย database ตอน insert เทสเลยต้องยัดเอง
        ReflectionTestUtils.setField(room, "id", id);
        return room;
    }

    private static Tenant tenant(Long id, String fullName) {
        Tenant tenant = new Tenant(fullName, "081-000-0000", null);
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
