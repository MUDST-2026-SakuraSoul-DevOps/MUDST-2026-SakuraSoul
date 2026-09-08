package com.sakurasoul.apartment.lease;

import com.sakurasoul.apartment.common.ConflictException;
import com.sakurasoul.apartment.common.NotFoundException;
import com.sakurasoul.apartment.lease.LeaseDtos.LeaseRequest;
import com.sakurasoul.apartment.lease.LeaseDtos.LeaseResponse;
import com.sakurasoul.apartment.room.Room;
import com.sakurasoul.apartment.room.RoomRepository;
import com.sakurasoul.apartment.tenant.Tenant;
import com.sakurasoul.apartment.tenant.TenantRepository;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
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
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * เทสของ US-04 "จับคู่ผู้เช่ากับห้องพัก + สร้างสัญญาเช่า" (SSK-10)
 * <p>
 * เทสชุดนี้ปลอม repository ทั้งหมด จึงพิสูจน์ได้แค่กฎที่เขียนไว้ใน service
 * ส่วนการกันปล่อยเช่าซ้อนของจริงอยู่ที่ constraint ใน PostgreSQL ซึ่งพิสูจน์ที่
 * LeaseOverlapIntegrationTest แทน เพราะปลอม repository ไม่มีทางจับ race condition ได้
 */
@ExtendWith(MockitoExtension.class)
class LeaseServiceTest {

    private static final LocalDate START = LocalDate.of(2026, 10, 1);
    private static final LocalDate END = LocalDate.of(2027, 9, 30);

    /** อัตราตัวอย่างชุดเดียวกับที่ backend จำลองฝั่งหน้าเว็บ seed ไว้ */
    private static final BigDecimal DEPOSIT = new BigDecimal("7000.00");
    private static final BigDecimal ELECTRIC = new BigDecimal("8.00");
    private static final BigDecimal WATER = new BigDecimal("18.00");
    private static final BigDecimal COMMON_AREA = new BigDecimal("300.00");
    private static final BigDecimal INTERNET = new BigDecimal("250.00");

    @Mock
    private LeaseRepository leaseRepository;

    @Mock
    private RoomRepository roomRepository;

    @Mock
    private TenantRepository tenantRepository;

    @InjectMocks
    private LeaseService leaseService;

    @Test
    @DisplayName("สร้างสัญญาสำเร็จต้องได้เลขห้องกับชื่อผู้เช่ากลับมาด้วย และสถานะเป็น ACTIVE")
    void createReturnsFullResponse() {
        Room room = room(2L, "102");
        Tenant tenant = tenant(1L, "ยูกิ ทานากะ");
        when(roomRepository.findById(2L)).thenReturn(Optional.of(room));
        when(tenantRepository.findById(1L)).thenReturn(Optional.of(tenant));
        when(leaseRepository.findByRoomIdAndStatus(2L, LeaseStatus.ACTIVE)).thenReturn(List.of());
        when(leaseRepository.save(any(Lease.class))).thenAnswer(invocation -> {
            Lease saved = invocation.getArgument(0);
            ReflectionTestUtils.setField(saved, "id", 11L);
            return saved;
        });

        LeaseResponse response = leaseService.create(request(2L, 1L, START, END));

        assertThat(response.id()).isEqualTo(11L);
        assertThat(response.roomId()).isEqualTo(2L);
        assertThat(response.roomNumber()).isEqualTo("102");
        assertThat(response.tenantId()).isEqualTo(1L);
        assertThat(response.tenantName()).isEqualTo("ยูกิ ทานากะ");
        assertThat(response.startDate()).isEqualTo(START);
        assertThat(response.endDate()).isEqualTo(END);
        assertThat(response.monthlyRent()).isEqualByComparingTo("3500.00");
        assertThat(response.billingCycle()).isEqualTo(BillingCycle.MONTHLY);
        assertThat(response.status()).isEqualTo(LeaseStatus.ACTIVE);
    }

    @Test
    @DisplayName("สัญญาที่ไม่กำหนดวันจบสร้างได้ endDate ต้องเป็น null ไม่ใช่วันมั่ว ๆ")
    void createAcceptsOpenEndedLease() {
        stubRoomAndTenant();
        when(leaseRepository.findByRoomIdAndStatus(2L, LeaseStatus.ACTIVE)).thenReturn(List.of());
        when(leaseRepository.save(any(Lease.class))).thenAnswer(invocation -> invocation.getArgument(0));

        LeaseResponse response = leaseService.create(request(2L, 1L, START, null));

        assertThat(response.endDate()).isNull();
    }

    @Test
    @DisplayName("อัตราที่ส่งมาต้องถูกล็อกติดไปกับสัญญาที่บันทึกจริง ไม่ใช่แค่สะท้อนกลับใน response")
    void createLocksChargesOntoTheSavedLease() {
        stubRoomAndTenant();
        when(leaseRepository.findByRoomIdAndStatus(2L, LeaseStatus.ACTIVE)).thenReturn(List.of());
        when(leaseRepository.save(any(Lease.class))).thenAnswer(invocation -> invocation.getArgument(0));

        LeaseResponse response = leaseService.create(request(2L, 1L, START, END));

        // ดักตัวที่ถูกส่งเข้า repository จริง ถ้าดูแค่ response จะแยกไม่ออกว่าค่าถูกเก็บลงไปหรือแค่ส่งกลับ
        ArgumentCaptor<Lease> saved = ArgumentCaptor.forClass(Lease.class);
        verify(leaseRepository).save(saved.capture());
        LeaseCharges stored = saved.getValue().getCharges();

        assertThat(stored.getSecurityDeposit()).isEqualByComparingTo(DEPOSIT);
        assertThat(stored.getElectricRatePerUnit()).isEqualByComparingTo(ELECTRIC);
        assertThat(stored.getWaterRatePerUnit()).isEqualByComparingTo(WATER);
        assertThat(stored.getCommonAreaFee()).isEqualByComparingTo(COMMON_AREA);
        assertThat(stored.getInternetFee()).isEqualByComparingTo(INTERNET);

        assertThat(response.securityDeposit()).isEqualByComparingTo(DEPOSIT);
        assertThat(response.electricRatePerUnit()).isEqualByComparingTo(ELECTRIC);
        assertThat(response.waterRatePerUnit()).isEqualByComparingTo(WATER);
        assertThat(response.commonAreaFee()).isEqualByComparingTo(COMMON_AREA);
        assertThat(response.internetFee()).isEqualByComparingTo(INTERNET);
    }

    @Test
    @DisplayName("สองสัญญาที่ทำคนละเวลาถืออัตราคนละชุดได้ ไม่ไปดึงจากที่เดียวกัน")
    void eachLeaseKeepsItsOwnRates() {
        Room room = room(3L, "103");
        when(roomRepository.findById(3L)).thenReturn(Optional.of(room));
        when(tenantRepository.findById(5L)).thenReturn(Optional.of(tenant(5L, "สมชาย ใจดี")));
        when(leaseRepository.findByRoomIdAndStatus(3L, LeaseStatus.ACTIVE)).thenReturn(List.of());
        when(leaseRepository.save(any(Lease.class))).thenAnswer(invocation -> invocation.getArgument(0));

        // สัญญาใบใหม่ทำตอนที่แอดมินขึ้นค่าไฟไปแล้ว
        BigDecimal raisedElectric = new BigDecimal("12.50");
        LeaseResponse later = leaseService.create(new LeaseRequest(3L, 5L, START, END,
                new BigDecimal("3500.00"), BillingCycle.MONTHLY, DEPOSIT,
                raisedElectric, WATER, COMMON_AREA, INTERNET));

        assertThat(later.electricRatePerUnit()).isEqualByComparingTo(raisedElectric);
        // ค่าที่เหลือไม่ได้ถูกดึงมาจากชุดเดียวกับใบก่อนหน้า แต่มาจากที่ส่งมาในคำขอนี้
        assertThat(later.waterRatePerUnit()).isEqualByComparingTo(WATER);
    }

    @Test
    @DisplayName("ห้องที่ไม่มีต้องได้ NotFoundException เพื่อให้กลายเป็น 404")
    void createThrowsWhenRoomMissing() {
        when(roomRepository.findById(999L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> leaseService.create(request(999L, 1L, START, END)))
                .isInstanceOf(NotFoundException.class)
                .hasMessageContaining("999");
    }

    @Test
    @DisplayName("ผู้เช่าที่ไม่มีต้องได้ NotFoundException เพื่อให้กลายเป็น 404")
    void createThrowsWhenTenantMissing() {
        when(roomRepository.findById(2L)).thenReturn(Optional.of(room(2L, "102")));
        when(tenantRepository.findById(999L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> leaseService.create(request(2L, 999L, START, END)))
                .isInstanceOf(NotFoundException.class)
                .hasMessageContaining("999");
    }

    @Test
    @DisplayName("วันสิ้นสุดมาก่อนวันเริ่มต้องได้ 400 พร้อมข้อความไทย และต้องไม่บันทึกอะไรลงไป")
    void createRejectsBackwardsRange() {
        stubRoomAndTenant();

        assertThatThrownBy(() -> leaseService.create(request(2L, 1L, END, START)))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("วันสิ้นสุดสัญญาต้องไม่มาก่อนวันเริ่มสัญญา");

        verify(leaseRepository, never()).save(any());
    }

    @Test
    @DisplayName("สร้างสัญญาทับช่วงสัญญาเดิมต้องได้ 409 ที่บอกเลขห้อง ช่วงวัน และชื่อผู้เช่าเดิม (US-05-S1)")
    void createRejectsOverlappingRange() {
        Room room = room(2L, "102");
        Lease existing = lease(room, tenant(1L, "ยูกิ ทานากะ"),
                LocalDate.of(2025, 10, 20), LocalDate.of(2026, 9, 16));
        when(roomRepository.findById(2L)).thenReturn(Optional.of(room));
        when(tenantRepository.findById(5L)).thenReturn(Optional.of(tenant(5L, "สมชาย ใจดี")));
        when(leaseRepository.findByRoomIdAndStatus(2L, LeaseStatus.ACTIVE)).thenReturn(List.of(existing));

        assertThatThrownBy(() -> leaseService.create(
                request(2L, 5L, LocalDate.of(2026, 1, 1), LocalDate.of(2026, 12, 31))))
                .isInstanceOf(ConflictException.class)
                .hasMessage("ห้อง 102 ไม่ว่างในช่วง 2025-10-20 ถึง 2026-09-16 "
                        + "เพราะมีสัญญาของ ยูกิ ทานากะ อยู่แล้ว");

        verify(leaseRepository, never()).save(any());
    }

    @Test
    @DisplayName("สัญญาเดิมจบวันไหน สัญญาใหม่เริ่มวันนั้นถือว่าทับกัน เพราะช่วงวันปิดสองด้าน")
    void createTreatsSharedBoundaryDayAsOverlap() {
        Room room = room(2L, "102");
        Lease existing = lease(room, tenant(1L, "ยูกิ ทานากะ"),
                LocalDate.of(2026, 1, 1), LocalDate.of(2026, 8, 31));
        when(roomRepository.findById(2L)).thenReturn(Optional.of(room));
        when(tenantRepository.findById(5L)).thenReturn(Optional.of(tenant(5L, "สมชาย ใจดี")));
        when(leaseRepository.findByRoomIdAndStatus(2L, LeaseStatus.ACTIVE)).thenReturn(List.of(existing));

        assertThatThrownBy(() -> leaseService.create(
                request(2L, 5L, LocalDate.of(2026, 8, 31), LocalDate.of(2027, 8, 30))))
                .isInstanceOf(ConflictException.class);
    }

    @Test
    @DisplayName("สัญญาเดิมที่ไม่กำหนดวันจบกันห้องไว้ตลอด ข้อความต้องบอกว่าตั้งแต่วันไหนเป็นต้นไป")
    void createReportsOpenEndedConflict() {
        Room room = room(2L, "102");
        Lease existing = lease(room, tenant(1L, "ยูกิ ทานากะ"), LocalDate.of(2026, 1, 1), null);
        when(roomRepository.findById(2L)).thenReturn(Optional.of(room));
        when(tenantRepository.findById(5L)).thenReturn(Optional.of(tenant(5L, "สมชาย ใจดี")));
        when(leaseRepository.findByRoomIdAndStatus(2L, LeaseStatus.ACTIVE)).thenReturn(List.of(existing));

        assertThatThrownBy(() -> leaseService.create(request(2L, 5L, LocalDate.of(2030, 1, 1), null)))
                .isInstanceOf(ConflictException.class)
                .hasMessage("ห้อง 102 ไม่ว่างตั้งแต่ 2026-01-01 เป็นต้นไป "
                        + "เพราะมีสัญญาของ ยูกิ ทานากะ อยู่แล้ว");
    }

    @Test
    @DisplayName("ห้องเดิมแต่ช่วงวันไม่ชนกันสร้างได้ปกติ")
    void createAllowsNonOverlappingRangeInSameRoom() {
        Room room = room(2L, "102");
        Lease existing = lease(room, tenant(1L, "ยูกิ ทานากะ"),
                LocalDate.of(2026, 1, 1), LocalDate.of(2026, 6, 30));
        when(roomRepository.findById(2L)).thenReturn(Optional.of(room));
        when(tenantRepository.findById(5L)).thenReturn(Optional.of(tenant(5L, "สมชาย ใจดี")));
        when(leaseRepository.findByRoomIdAndStatus(2L, LeaseStatus.ACTIVE)).thenReturn(List.of(existing));
        when(leaseRepository.save(any(Lease.class))).thenAnswer(invocation -> invocation.getArgument(0));

        LeaseResponse response = leaseService.create(
                request(2L, 5L, LocalDate.of(2026, 7, 1), LocalDate.of(2027, 6, 30)));

        assertThat(response.tenantName()).isEqualTo("สมชาย ใจดี");
    }

    @Test
    @DisplayName("ไม่ใส่ตัวกรองต้องได้สัญญาทั้งหมดตามลำดับที่ repository ส่งมา")
    void listWithoutFiltersReturnsEverything() {
        when(leaseRepository.findAllByOrderByStartDateDesc()).thenReturn(List.of(
                lease(room(2L, "102"), tenant(1L, "ยูกิ ทานากะ"), START, END),
                lease(room(3L, "103"), tenant(5L, "สมชาย ใจดี"), START, END)));

        assertThat(leaseService.list(null, null, null)).hasSize(2);
    }

    @Test
    @DisplayName("กรองด้วย roomId กับ status พร้อมกันต้องเหลือเฉพาะที่ตรงทั้งสองเงื่อนไข")
    void listAppliesEveryFilterGiven() {
        Lease wanted = lease(room(2L, "102"), tenant(1L, "ยูกิ ทานากะ"), START, END);
        Lease otherRoom = lease(room(3L, "103"), tenant(5L, "สมชาย ใจดี"), START, END);
        when(leaseRepository.findAllByOrderByStartDateDesc()).thenReturn(List.of(wanted, otherRoom));

        List<LeaseResponse> result = leaseService.list(LeaseStatus.ACTIVE, 2L, null);

        assertThat(result).hasSize(1);
        assertThat(result.getFirst().roomNumber()).isEqualTo("102");
    }

    private void stubRoomAndTenant() {
        when(roomRepository.findById(2L)).thenReturn(Optional.of(room(2L, "102")));
        when(tenantRepository.findById(1L)).thenReturn(Optional.of(tenant(1L, "ยูกิ ทานากะ")));
    }

    private static LeaseRequest request(Long roomId, Long tenantId, LocalDate startDate, LocalDate endDate) {
        return new LeaseRequest(roomId, tenantId, startDate, endDate, new BigDecimal("3500.00"),
                BillingCycle.MONTHLY, DEPOSIT, ELECTRIC, WATER, COMMON_AREA, INTERNET);
    }

    private static LeaseCharges charges() {
        return new LeaseCharges(DEPOSIT, ELECTRIC, WATER, COMMON_AREA, INTERNET);
    }

    private static Room room(Long id, String roomNumber) {
        Room room = new Room(roomNumber, (short) 1, new BigDecimal("3500.00"));
        // id ถูกกำหนดโดย database ตอน insert เทสเลยต้องยัดเอง
        ReflectionTestUtils.setField(room, "id", id);
        return room;
    }

    private static Tenant tenant(Long id, String fullName) {
        Tenant tenant = new Tenant(fullName, "081-000-0000", null);
        ReflectionTestUtils.setField(tenant, "id", id);
        return tenant;
    }

    private static Lease lease(Room room, Tenant tenant, LocalDate startDate, LocalDate endDate) {
        return new Lease(room, tenant, startDate, endDate, new BigDecimal("3500.00"),
                BillingCycle.MONTHLY, charges());
    }
}
