package com.sakurasoul.apartment.maintenance;

import com.sakurasoul.apartment.common.ConflictException;
import com.sakurasoul.apartment.common.NotFoundException;
import com.sakurasoul.apartment.maintenance.MaintenanceDtos.CreateTicketRequest;
import com.sakurasoul.apartment.maintenance.MaintenanceDtos.SupplyUsageRequest;
import com.sakurasoul.apartment.maintenance.MaintenanceDtos.TicketResponse;
import com.sakurasoul.apartment.maintenance.MaintenanceDtos.UpdateTicketRequest;
import com.sakurasoul.apartment.room.Room;
import com.sakurasoul.apartment.room.RoomType;
import com.sakurasoul.apartment.room.RoomRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * เทสระดับ service ของ US-12 ไม่แตะ database ไม่ยก Spring context
 * <p>
 * สองเรื่องที่เทสชุดนี้คุมคือการตัดสต็อกตอนบันทึกงานซ่อม (US-12-S1 ตอนท้ายที่บอกว่า
 * "ของที่ใช้ถูกตัดออกจากสต็อกอัตโนมัติ") และเรื่องของไม่พอซึ่งต้องเป็นคำขอที่ถูกปฏิเสธ
 * ไม่ใช่สต็อกติดลบ
 * <p>
 * นาฬิกาถูกตรึงไว้ที่ Clock.fixed เพื่อยืนยันได้ตรง ๆ ว่าเวลาปิดงานที่บันทึกลงไปคือเวลาไหน
 * ถ้าโค้ดเรียก Instant.now() ลอย ๆ เทสข้อนั้นจะเขียนไม่ได้เลย
 */
@ExtendWith(MockitoExtension.class)
class MaintenanceServiceTest {

    private static final ZoneId BANGKOK = ZoneId.of("Asia/Bangkok");

    /** 8 ต.ค. 2569 เวลา 10:00 ตามเวลาไทย ตัวเลขไม่มีความหมายพิเศษ ขอแค่นิ่ง */
    private static final Instant NOW = LocalDate.of(2026, 10, 8).atTime(10, 0).atZone(BANGKOK).toInstant();

    @Mock
    private MaintenanceTicketRepository ticketRepository;

    @Mock
    private MaintenanceSupplyUsageRepository usageRepository;

    @Mock
    private SupplyItemRepository supplyRepository;

    @Mock
    private RoomRepository roomRepository;

    private MaintenanceService maintenanceService;

    private Room room101;

    @BeforeEach
    void setUp() {
        maintenanceService = new MaintenanceService(ticketRepository, usageRepository, supplyRepository,
                roomRepository, Clock.fixed(NOW, BANGKOK));

        room101 = room(1L, "101");

        // save คืนตัวเดิมที่ส่งเข้าไป เพราะสิ่งที่เทสสนใจคือสิ่งที่ service ประกอบขึ้นมา
        // ไม่ใช่สิ่งที่ database จะเติมให้ทีหลัง
        lenient().when(ticketRepository.save(any())).thenAnswer(call -> call.getArgument(0));
        lenient().when(ticketRepository.saveAndFlush(any())).thenAnswer(call -> call.getArgument(0));
        lenient().when(usageRepository.save(any())).thenAnswer(call -> call.getArgument(0));
        lenient().when(supplyRepository.save(any())).thenAnswer(call -> call.getArgument(0));
        lenient().when(usageRepository.findByTicketIdInOrderByIdAsc(any())).thenReturn(List.of());
    }

    @Test
    @DisplayName("US-12-S1 เบิกของ 2 ชิ้นจากที่มี 5 ต้องเหลือ 3 และบันทึกว่าใบนี้ใช้อะไรไป")
    void creatingATicketWithSuppliesDeductsTheStock() {
        SupplyItem bulb = supply(7L, "หลอดไฟ LED", 5);
        when(roomRepository.findById(1L)).thenReturn(Optional.of(room101));
        when(supplyRepository.findForUpdateById(7L)).thenReturn(Optional.of(bulb));

        TicketResponse response = maintenanceService.create(request(new SupplyUsageRequest(7L, 2)));

        assertThat(bulb.getStock()).isEqualTo(3);
        assertThat(response.suppliesUsed()).hasSize(1);
        assertThat(response.suppliesUsed().getFirst().name()).isEqualTo("หลอดไฟ LED");
        assertThat(response.suppliesUsed().getFirst().quantity()).isEqualTo(2);
        verify(usageRepository).save(any(MaintenanceSupplyUsage.class));
    }

    /**
     * ของไม่พอคือคำขอที่ทำตามไม่ได้ ไม่ใช่ระบบพัง จึงต้องเป็น IllegalArgumentException
     * ที่ ApiExceptionHandler แปลงเป็น 400 และข้อความต้องบอกจำนวนที่เหลือจริงด้วย
     * เพื่อให้แอดมินตัดสินใจต่อได้ว่าจะเบิกเท่าที่มีหรือไปเติมของก่อน
     */
    @Test
    @DisplayName("US-12 เบิกของเกินที่มีในคลังต้องถูกปฏิเสธพร้อมบอกจำนวนที่เหลือ และสต็อกต้องไม่ถูกแตะ")
    void creatingATicketWithTooManySuppliesIsRejected() {
        SupplyItem bulb = supply(7L, "หลอดไฟ LED", 5);
        when(roomRepository.findById(1L)).thenReturn(Optional.of(room101));
        when(supplyRepository.findForUpdateById(7L)).thenReturn(Optional.of(bulb));

        assertThatThrownBy(() -> maintenanceService.create(request(new SupplyUsageRequest(7L, 10))))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("Not enough หลอดไฟ LED in stock (only 5 left)");

        assertThat(bulb.getStock()).isEqualTo(5);
        verify(usageRepository, never()).save(any());
    }

    @Test
    @DisplayName("US-12 เบิกของที่ไม่มีในคลังต้องเป็น 404 ที่บอกว่าไม่พบอะไร id ไหน")
    void creatingATicketWithAnUnknownSupplyIsNotFound() {
        when(roomRepository.findById(1L)).thenReturn(Optional.of(room101));
        when(supplyRepository.findForUpdateById(99L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> maintenanceService.create(request(new SupplyUsageRequest(99L, 1))))
                .isInstanceOf(NotFoundException.class)
                .hasMessage("No supply with id 99");
    }

    @Test
    @DisplayName("ปิดงานต้องตั้งเวลาปิดตามนาฬิกาของระบบ และเปิดใบกลับมาใหม่ต้องล้างทิ้ง")
    void closingSetsClosedAtAndReopeningClearsIt() {
        MaintenanceTicket ticket = ticket(1L, "แอร์ไม่เย็น");
        when(ticketRepository.findById(1L)).thenReturn(Optional.of(ticket));

        TicketResponse closed = maintenanceService.update(1L,
                new UpdateTicketRequest("DONE", null, null, null, null, null, null, null, null));

        assertThat(closed.status()).isEqualTo(TicketStatus.DONE);
        assertThat(closed.closedAt()).isEqualTo(NOW);

        TicketResponse reopened = maintenanceService.update(1L,
                new UpdateTicketRequest("IN_PROGRESS", null, null, null, null, null, null, null, null));

        assertThat(reopened.status()).isEqualTo(TicketStatus.IN_PROGRESS);
        assertThat(reopened.closedAt()).isNull();
    }

    @Test
    @DisplayName("สถานะที่ไม่รู้จักต้องถูกปฏิเสธพร้อมบอกค่าที่ใช้ได้ครบทั้งสามค่า")
    void unknownStatusIsRejected() {
        MaintenanceTicket ticket = ticket(1L, "แอร์ไม่เย็น");
        when(ticketRepository.findById(1L)).thenReturn(Optional.of(ticket));

        assertThatThrownBy(() -> maintenanceService.update(1L,
                new UpdateTicketRequest("CLOSED", null, null, null, null, null, null, null, null)))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("Status must be OPEN, IN_PROGRESS or DONE");
    }

    @Test
    @DisplayName("SSK-131 ใบ OPEN ที่แอดมินสร้างเองและยังไม่เบิกของลบได้")
    void deletingAnOpenManualTicketWithoutSuppliesDeletesIt() {
        MaintenanceTicket ticket = ticket(1L, "แอร์ไม่เย็น");
        when(ticketRepository.findById(1L)).thenReturn(Optional.of(ticket));
        when(usageRepository.existsByTicketId(1L)).thenReturn(false);

        maintenanceService.delete(1L);

        verify(ticketRepository).delete(ticket);
        verify(ticketRepository).flush();
    }

    @Test
    @DisplayName("SSK-131 ใบที่กำลังทำลบไม่ได้ ต้องบอกว่าลบได้เฉพาะใบที่ยังเปิดอยู่")
    void deletingAnInProgressTicketIsAConflict() {
        MaintenanceTicket ticket = ticket(1L, "แอร์ไม่เย็น");
        ticket.changeStatus(TicketStatus.IN_PROGRESS, NOW);
        when(ticketRepository.findById(1L)).thenReturn(Optional.of(ticket));

        assertThatThrownBy(() -> maintenanceService.delete(1L))
                .isInstanceOf(ConflictException.class)
                .hasMessage("This ticket is in progress and cannot be deleted. Only open tickets can be deleted.");
        verify(ticketRepository, never()).delete(any());
    }

    @Test
    @DisplayName("SSK-131 ใบที่ปิดแล้วเป็นประวัติซ่อม ลบไม่ได้")
    void deletingADoneTicketIsAConflict() {
        MaintenanceTicket ticket = ticket(1L, "แอร์ไม่เย็น");
        ticket.changeStatus(TicketStatus.DONE, NOW);
        when(ticketRepository.findById(1L)).thenReturn(Optional.of(ticket));

        assertThatThrownBy(() -> maintenanceService.delete(1L))
                .isInstanceOf(ConflictException.class)
                .hasMessage("This ticket is done and is kept as maintenance history. It cannot be deleted.");
        verify(ticketRepository, never()).delete(any());
    }

    /**
     * ใบจากรอบแจ้งเตือนเป็นหลักฐานว่ารอบนั้นทำงานแล้ว ลบทิ้งแล้ว run-due ไม่สร้างใหม่
     * เพราะเลื่อนวันครบกำหนดไปรอบถัดไปแล้ว งานตามรอบจะหายไปเงียบ ๆ แม้ใบยัง OPEN
     */
    @Test
    @DisplayName("SSK-131 ใบที่มาจากรอบแจ้งเตือนลบไม่ได้แม้ยังเปิดอยู่ ให้ปิดเป็น Done แทน")
    void deletingARecurringTicketIsAConflict() {
        MaintenanceReminder reminder = new MaintenanceReminder("ล้างแอร์", ReminderFrequency.QUARTERLY,
                LocalDate.of(2026, 10, 1), room101, null, Priority.LOW, null);
        MaintenanceTicket ticket = MaintenanceTicket.fromReminder(reminder, room101);
        ReflectionTestUtils.setField(ticket, "id", 1L);
        when(ticketRepository.findById(1L)).thenReturn(Optional.of(ticket));

        assertThatThrownBy(() -> maintenanceService.delete(1L))
                .isInstanceOf(ConflictException.class)
                .hasMessage("This ticket was created by a recurring reminder and cannot be deleted. Mark it as Done instead.");
        verify(ticketRepository, never()).delete(any());
    }

    @Test
    @DisplayName("SSK-131 ใบที่เบิกของไปแล้วลบไม่ได้ เพราะสต็อกถูกตัดไปแล้ว")
    void deletingATicketWithSuppliesIsAConflict() {
        MaintenanceTicket ticket = ticket(1L, "เปลี่ยนหลอดไฟ");
        when(ticketRepository.findById(1L)).thenReturn(Optional.of(ticket));
        when(usageRepository.existsByTicketId(1L)).thenReturn(true);

        assertThatThrownBy(() -> maintenanceService.delete(1L))
                .isInstanceOf(ConflictException.class)
                .hasMessage("This ticket has supplies recorded against it and cannot be deleted. Mark it as Done instead.");
        verify(ticketRepository, never()).delete(any());
    }

    @Test
    @DisplayName("SSK-131 PATCH แก้ชื่องานได้ ชื่อว่างล้วนต้องถูกปฏิเสธด้วยข้อความเดียวกับตอนสร้าง")
    void patchRenamesButRejectsABlankTitle() {
        MaintenanceTicket ticket = ticket(1L, "แอร์ไม่เย็น");
        when(ticketRepository.findById(1L)).thenReturn(Optional.of(ticket));

        TicketResponse renamed = maintenanceService.update(1L,
                new UpdateTicketRequest(null, null, null, null, null, null, "  แอร์ไม่เย็น ห้องนอน  ", null, null));
        assertThat(renamed.title()).isEqualTo("แอร์ไม่เย็น ห้องนอน");

        assertThatThrownBy(() -> maintenanceService.update(1L,
                new UpdateTicketRequest(null, null, null, null, null, null, "   ", null, null)))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("Please enter the task title");
        assertThat(ticket.getTitle()).isEqualTo("แอร์ไม่เย็น ห้องนอน");
    }

    @Test
    @DisplayName("SSK-131 PATCH ส่งประเภทงานกับผู้แจ้งเป็นช่องว่างมาแปลว่าล้างค่า ไม่ส่งมาแปลว่าไม่แก้")
    void patchClearsTypeAndReporterOnlyWhenSentBlank() {
        MaintenanceTicket ticket = new MaintenanceTicket(room101, "แอร์ไม่เย็น", null, "Air Conditioning",
                Priority.MEDIUM, null, "Sarah J.", null, null);
        ReflectionTestUtils.setField(ticket, "id", 1L);
        when(ticketRepository.findById(1L)).thenReturn(Optional.of(ticket));

        TicketResponse untouched = maintenanceService.update(1L,
                new UpdateTicketRequest(null, null, "HIGH", null, null, null, null, null, null));
        assertThat(untouched.maintenanceType()).isEqualTo("Air Conditioning");
        assertThat(untouched.reportedBy()).isEqualTo("Sarah J.");

        TicketResponse cleared = maintenanceService.update(1L,
                new UpdateTicketRequest(null, null, null, null, null, null, null, "", "  "));
        assertThat(cleared.maintenanceType()).isNull();
        assertThat(cleared.reportedBy()).isNull();
    }

    private static CreateTicketRequest request(SupplyUsageRequest... supplies) {
        return new CreateTicketRequest(1L, "เปลี่ยนหลอดไฟ", null, "ไฟฟ้า", null, null, null, null,
                new BigDecimal("120"), List.of(supplies));
    }

    private MaintenanceTicket ticket(Long id, String title) {
        MaintenanceTicket ticket = new MaintenanceTicket(room101, title, null, null, Priority.MEDIUM,
                null, null, null, null);
        // id ถูกกำหนดโดย database ตอน insert เทสเลยต้องยัดเอง
        ReflectionTestUtils.setField(ticket, "id", id);
        return ticket;
    }

    private static Room room(Long id, String roomNumber) {
        Room room = new Room(roomNumber, (short) 1, RoomType.SINGLE);
        ReflectionTestUtils.setField(room, "id", id);
        return room;
    }

    private static SupplyItem supply(Long id, String name, int stock) {
        SupplyItem item = new SupplyItem(name, null, "ไฟฟ้า", stock, 2);
        ReflectionTestUtils.setField(item, "id", id);
        return item;
    }
}
