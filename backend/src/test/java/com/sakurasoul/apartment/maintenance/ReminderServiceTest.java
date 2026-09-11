package com.sakurasoul.apartment.maintenance;

import com.sakurasoul.apartment.maintenance.ReminderDtos.ReminderRequest;
import com.sakurasoul.apartment.maintenance.ReminderDtos.ReminderResponse;
import com.sakurasoul.apartment.room.Room;
import com.sakurasoul.apartment.room.RoomRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
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
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * เทสระดับ service ของ US-14 การแจ้งเตือนซ่อมบำรุงตามรอบ
 * <p>
 * เรื่องที่ชุดนี้คุมคือการนับวันครบกำหนดครั้งถัดไป ซึ่งเป็นจุดที่พังเงียบที่สุดของฟีเจอร์นี้
 * โดยเฉพาะการบวกเดือนข้ามสิ้นเดือน (31 ม.ค. บวกหนึ่งเดือนต้องได้ 28 ก.พ. ไม่ใช่ 3 มี.ค.)
 * ซึ่งถ้าผิดจะไม่มีใครเห็นจนกว่าจะถึงเดือนกุมภาพันธ์จริง ๆ
 * <p>
 * "วันนี้" ถูกตรึงด้วย Clock.fixed เทสจึงยืนยันเรื่องพวกนี้ได้โดยไม่ต้องรอวันจริง
 * ค่าที่ตรึงไว้คือ 15 ก.พ. 2569 ซึ่งเลือกมาเพราะอยู่หลัง 31 ม.ค. และอยู่ในเดือนที่สั้นที่สุด
 */
@ExtendWith(MockitoExtension.class)
class ReminderServiceTest {

    private static final ZoneId BANGKOK = ZoneId.of("Asia/Bangkok");
    private static final LocalDate TODAY = LocalDate.of(2026, 2, 15);
    private static final Instant NOW = TODAY.atTime(8, 0).atZone(BANGKOK).toInstant();

    @Mock
    private MaintenanceReminderRepository reminderRepository;

    @Mock
    private MaintenanceTicketRepository ticketRepository;

    @Mock
    private RoomRepository roomRepository;

    private ReminderService reminderService;

    private Room room101;

    @BeforeEach
    void setUp() {
        reminderService = new ReminderService(reminderRepository, ticketRepository, roomRepository,
                Clock.fixed(NOW, BANGKOK));
        room101 = room(1L, "101");

        lenient().when(reminderRepository.saveAndFlush(any())).thenAnswer(call -> call.getArgument(0));
        lenient().when(reminderRepository.save(any())).thenAnswer(call -> call.getArgument(0));
        lenient().when(ticketRepository.save(any())).thenAnswer(call -> call.getArgument(0));
    }

    @Test
    @DisplayName("US-14-S1 ใบที่เพิ่งสร้างต้องมีครั้งถัดไปเท่ากับวันเริ่มตรง ๆ ไม่ถูกเลื่อนให้เอง")
    void newReminderStartsAtItsStartDate() {
        when(roomRepository.findById(1L)).thenReturn(Optional.of(room101));

        ReminderResponse response = reminderService.create(new ReminderRequest("ล้างแอร์",
                "QUARTERLY", LocalDate.of(2026, 1, 31), 1L, "09:00", "HIGH", "ล้างทุกไตรมาส"));

        assertThat(response.startDate()).isEqualTo(LocalDate.of(2026, 1, 31));
        assertThat(response.nextDueDate()).isEqualTo(LocalDate.of(2026, 1, 31));
        // วันเริ่มอยู่ก่อนวันนี้ ใบจึงต้องขึ้นเป็นเลยกำหนดทันที ไม่ใช่เงียบไปจนถึงรอบหน้า
        assertThat(response.overdue()).isTrue();
        assertThat(response.remindTime()).isEqualTo("09:00");
        assertThat(response.active()).isTrue();
    }

    /**
     * หัวใจของการนับรอบ 31 ม.ค. บวกหนึ่งเดือนต้องหนีบเหลือ 28 ก.พ. (2569 ไม่ใช่ปีอธิกสุรทิน)
     * ไม่ใช่ล้นไปเป็น 3 มี.ค. กฎเดียวกับ addMonths ใน frontend/src/domain/maintenanceBoard.ts
     */
    @Test
    @DisplayName("US-14 แก้ใบรายเดือนที่เริ่ม 31 ม.ค. ต้องได้ครั้งถัดไปเป็น 28 ก.พ. ไม่ใช่ 3 มี.ค.")
    void updateClampsTheEndOfMonth() {
        MaintenanceReminder reminder = reminder(5L, "ตรวจเครื่องสูบน้ำ", ReminderFrequency.MONTHLY,
                LocalDate.of(2026, 1, 31));
        when(reminderRepository.findWithRoomById(5L)).thenReturn(Optional.of(reminder));

        ReminderResponse response = reminderService.update(5L, new ReminderRequest("ตรวจเครื่องสูบน้ำ",
                "MONTHLY", LocalDate.of(2026, 1, 31), null, null, null, null));

        assertThat(response.nextDueDate()).isEqualTo(LocalDate.of(2026, 2, 28));
        assertThat(response.overdue()).isFalse();
    }

    @Test
    @DisplayName("US-14-S2 รันงานประจำวันแล้วต้องสร้างใบแจ้งซ่อมเฉพาะใบที่ถึงกำหนดและยังเปิดอยู่")
    void runDueCreatesTicketsOnlyForDueAndActiveReminders() {
        MaintenanceReminder due = reminder(1L, "ล้างแอร์", ReminderFrequency.MONTHLY, LocalDate.of(2026, 1, 31));
        MaintenanceReminder notYet = reminder(2L, "ตรวจดาดฟ้า", ReminderFrequency.ANNUAL, LocalDate.of(2026, 6, 1));
        MaintenanceReminder switchedOff = reminder(3L, "เปลี่ยนไส้กรอง", ReminderFrequency.MONTHLY,
                LocalDate.of(2026, 1, 1));
        switchedOff.setActive(false);

        // จงใจคืนใบที่ไม่ควรถูกยิงมาด้วย เพื่อยืนยันว่ากฎ "ถึงกำหนดและยังเปิดอยู่" อยู่ที่
        // MaintenanceReminder.isDueOn จริง ไม่ได้พึ่งเงื่อนไขในคิวรีอย่างเดียว
        when(reminderRepository.findDueForUpdate(TODAY))
                .thenReturn(List.of(due, notYet, switchedOff));

        int created = reminderService.runDue(TODAY);

        assertThat(created).isEqualTo(1);
        verify(ticketRepository, times(1)).save(any(MaintenanceTicket.class));

        // ใบที่ยิงไปแล้วต้องจดเวลาและเลื่อนรอบให้พ้นวันนี้ ไม่งั้นพรุ่งนี้จะยิงซ้ำ
        assertThat(due.getLastTriggeredAt()).isEqualTo(NOW);
        assertThat(due.getNextDueDate()).isEqualTo(LocalDate.of(2026, 2, 28));

        // สองใบที่ถูกข้ามต้องไม่ถูกแตะเลยสักช่อง
        assertThat(notYet.getLastTriggeredAt()).isNull();
        assertThat(notYet.getNextDueDate()).isEqualTo(LocalDate.of(2026, 6, 1));
        assertThat(switchedOff.getLastTriggeredAt()).isNull();
        assertThat(switchedOff.getNextDueDate()).isEqualTo(LocalDate.of(2026, 1, 1));
    }

    @Test
    @DisplayName("US-14 ใบแจ้งซ่อมที่ระบบสร้างเองต้องเป็น RECURRING และคัดลอกชื่อกับรอบมาจากใบแจ้งเตือน")
    void generatedTicketCarriesTheReminderDetails() {
        MaintenanceReminder due = reminder(1L, "ล้างแอร์", ReminderFrequency.MONTHLY, LocalDate.of(2026, 2, 10));
        when(reminderRepository.findDueForUpdate(TODAY)).thenReturn(List.of(due));

        reminderService.runDue(TODAY);

        // ดึงใบที่ถูกบันทึกออกมาดูของจริง ไม่ใช่เชื่อว่า service ทำถูก
        ArgumentCaptor<MaintenanceTicket> saved = ArgumentCaptor.forClass(MaintenanceTicket.class);
        verify(ticketRepository).save(saved.capture());

        MaintenanceTicket ticket = saved.getValue();
        assertThat(ticket.getTitle()).isEqualTo("ล้างแอร์");
        assertThat(ticket.getSource()).isEqualTo(TicketSource.RECURRING);
        assertThat(ticket.getStatus()).isEqualTo(TicketStatus.OPEN);
        assertThat(ticket.getScheduledDate()).isEqualTo(LocalDate.of(2026, 2, 10));
        assertThat(ticket.getRoom().getRoomNumber()).isEqualTo("101");
        assertThat(ticket.getReminder()).isSameAs(due);
    }

    @Test
    @DisplayName("US-14 ใบรอบเดียวที่ยิงไปแล้วต้องถูกปิดสวิตช์ ไม่ใช่เลื่อนไปรอบหน้า")
    void oneTimeReminderIsSwitchedOffAfterFiring() {
        MaintenanceReminder oneTime = reminder(9L, "ซ่อมประตูรั้ว", ReminderFrequency.ONE_TIME,
                LocalDate.of(2026, 2, 1));
        when(reminderRepository.findDueForUpdate(TODAY)).thenReturn(List.of(oneTime));

        assertThat(reminderService.runDue(TODAY)).isEqualTo(1);

        assertThat(oneTime.isActive()).isFalse();
        assertThat(oneTime.getNextDueDate()).isEqualTo(LocalDate.of(2026, 2, 1));

        // รันซ้ำอีกรอบต้องไม่สร้างใบเพิ่ม เพราะใบถูกปิดสวิตช์ไปแล้ว
        assertThat(reminderService.runDue(TODAY)).isZero();
        verify(ticketRepository, times(1)).save(any(MaintenanceTicket.class));
    }

    @Test
    @DisplayName("US-14 รันซ้ำในวันเดียวกันต้องไม่สร้างใบซ้ำ เพราะรอบถูกเลื่อนพ้นวันนี้ไปแล้ว")
    void runningTwiceInTheSameDayCreatesOneTicket() {
        MaintenanceReminder due = reminder(1L, "ล้างแอร์", ReminderFrequency.MONTHLY, LocalDate.of(2026, 2, 15));
        when(reminderRepository.findDueForUpdate(TODAY)).thenReturn(List.of(due));

        assertThat(reminderService.runDue(TODAY)).isEqualTo(1);
        assertThat(due.getNextDueDate()).isEqualTo(LocalDate.of(2026, 3, 15));
        assertThat(reminderService.runDue(TODAY)).isZero();

        verify(ticketRepository, times(1)).save(any(MaintenanceTicket.class));
    }

    /**
     * เคสที่เคยทำให้เกิดใบซ้ำ แอดมินแก้บันทึกของใบที่ระบบเพิ่งยิงไปเมื่อเช้าในวันเดียวกัน
     * <p>
     * update คิดวันครบกำหนดใหม่จากวันเริ่มทุกครั้ง ซึ่งวันที่ตรงกับรอบพอดีจะได้ "วันนี้"
     * กลับมา ถ้าปล่อยไว้ ใบที่ยิงไปแล้วเมื่อเช้าจะถูกดึงกลับมาถึงกำหนดอีกครั้งแล้วสร้าง
     * ใบแจ้งซ่อมซ้ำให้รอบเดิม ซึ่งขัดกับที่สัญญา API บอกว่ารันซ้ำในวันเดียวกันได้ 0 ใบ
     */
    @Test
    @DisplayName("US-14 แก้ใบในวันเดียวกับที่เพิ่งยิงไป ต้องไม่ดึงวันครบกำหนดกลับมาเป็นวันนี้")
    void updateDoesNotRewindPastTheDayTheReminderFired() {
        MaintenanceReminder due = reminder(7L, "ล้างแอร์", ReminderFrequency.MONTHLY, TODAY);
        when(reminderRepository.findDueForUpdate(TODAY)).thenReturn(List.of(due));
        when(reminderRepository.findWithRoomById(7L)).thenReturn(Optional.of(due));
        when(roomRepository.findById(1L)).thenReturn(Optional.of(room101));

        assertThat(reminderService.runDue(TODAY)).isEqualTo(1);
        assertThat(due.getNextDueDate()).isEqualTo(LocalDate.of(2026, 3, 15));

        // แก้แค่บันทึก ฟิลด์ที่เหลือเหมือนเดิมทุกช่อง
        ReminderResponse response = reminderService.update(7L, new ReminderRequest("ล้างแอร์",
                "MONTHLY", TODAY, 1L, null, null, "ล้างคอยล์ด้วย"));

        assertThat(response.nextDueDate()).isEqualTo(LocalDate.of(2026, 3, 15));
        assertThat(reminderService.runDue(TODAY)).isZero();
        verify(ticketRepository, times(1)).save(any(MaintenanceTicket.class));
    }

    /**
     * ใบของทั้งตึกยังไม่มีห้องให้ผูก จึงยังสร้างใบแจ้งซ่อมให้ไม่ได้ (maintenance_ticket
     * บังคับว่าต้องมีห้อง) แต่ต้องเลื่อนรอบให้พ้นวันนี้อยู่ดี ไม่งั้นใบจะค้างเป็นเลยกำหนด
     * ตลอดไปและถูกหยิบมาพิจารณาใหม่ทุกวัน
     */
    @Test
    @DisplayName("US-14 ใบที่ไม่ได้ระบุห้องยังไม่สร้างใบแจ้งซ่อม แต่ต้องเลื่อนรอบให้พ้นวันนี้")
    void buildingWideReminderAdvancesWithoutCreatingATicket() {
        MaintenanceReminder wholeBuilding = reminder(4L, "ล้างถังเก็บน้ำ", ReminderFrequency.MONTHLY,
                LocalDate.of(2026, 2, 1));
        ReflectionTestUtils.setField(wholeBuilding, "room", null);
        when(reminderRepository.findDueForUpdate(TODAY)).thenReturn(List.of(wholeBuilding));

        assertThat(reminderService.runDue(TODAY)).isZero();

        verify(ticketRepository, never()).save(any());
        assertThat(wholeBuilding.getNextDueDate()).isEqualTo(LocalDate.of(2026, 3, 1));
    }

    @Test
    @DisplayName("รอบที่ไม่รู้จักต้องถูกปฏิเสธพร้อมบอกค่าที่ใช้ได้ครบทั้งสี่ค่า")
    void unknownFrequencyIsRejected() {
        assertThatThrownBy(() -> reminderService.create(new ReminderRequest("ล้างแอร์", "WEEKLY",
                LocalDate.of(2026, 2, 1), null, null, null, null)))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("รอบต้องเป็น ONE_TIME, MONTHLY, QUARTERLY หรือ ANNUAL");
    }

    private MaintenanceReminder reminder(Long id, String name, ReminderFrequency frequency, LocalDate start) {
        MaintenanceReminder reminder = new MaintenanceReminder(name, frequency, start, room101,
                null, Priority.MEDIUM, null);
        ReflectionTestUtils.setField(reminder, "id", id);
        return reminder;
    }

    private static Room room(Long id, String roomNumber) {
        Room room = new Room(roomNumber, (short) 1, new BigDecimal("3500.00"));
        ReflectionTestUtils.setField(room, "id", id);
        return room;
    }
}
