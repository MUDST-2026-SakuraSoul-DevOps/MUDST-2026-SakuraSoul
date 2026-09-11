package com.sakurasoul.apartment.maintenance;

import com.sakurasoul.apartment.common.NotFoundException;
import com.sakurasoul.apartment.maintenance.ReminderDtos.ReminderRequest;
import com.sakurasoul.apartment.maintenance.ReminderDtos.ReminderResponse;
import com.sakurasoul.apartment.room.Room;
import com.sakurasoul.apartment.room.RoomRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

/**
 * การแจ้งเตือนงานซ่อมบำรุงตามรอบ (US-14)
 * <p>
 * หัวใจของคลาสนี้คือ {@link #runDue(LocalDate)} ซึ่งเป็นหน่วยงานที่ทำจริงหนึ่งหน่วย
 * ทั้งงานที่ scheduler เรียกทุกเช้าและปุ่มที่แอดมินกดเองเรียกเมธอดเดียวกันตัวนี้
 * ไม่มีทางที่สองทางนี้จะทำงานต่างกันได้ และเทสยิงเมธอดนี้ตรง ๆ ได้โดยไม่ต้องรอเวลาจริง
 * <p>
 * "วันนี้" มาจาก Clock ที่ฉีดเข้ามา ไม่ได้เรียก LocalDate.now() ลอย ๆ เทสจึงตรึงวันได้
 * ส่วนของจริงได้ bean ที่เดินตามเวลาไทย (ดู MaintenanceSchedulingConfig)
 */
@Service
public class ReminderService {

    private final MaintenanceReminderRepository reminderRepository;
    private final MaintenanceTicketRepository ticketRepository;
    private final RoomRepository roomRepository;
    private final Clock clock;

    public ReminderService(MaintenanceReminderRepository reminderRepository,
            MaintenanceTicketRepository ticketRepository, RoomRepository roomRepository, Clock clock) {
        this.reminderRepository = reminderRepository;
        this.ticketRepository = ticketRepository;
        this.roomRepository = roomRepository;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public List<ReminderResponse> list() {
        LocalDate today = today();
        return reminderRepository.findAllByOrderByNextDueDateAscIdAsc().stream()
                .map(reminder -> ReminderResponse.of(reminder, today))
                .toList();
    }

    /** ใบใหม่เริ่มที่ครั้งถัดไปเท่ากับวันเริ่มเสมอ ดูเหตุผลใน MaintenanceReminder */
    @Transactional
    public ReminderResponse create(ReminderRequest request) {
        MaintenanceReminder reminder = new MaintenanceReminder(request.name().trim(),
                ReminderFrequency.parse(request.frequency()), request.startDate(),
                roomOf(request.roomId()), ReminderDtos.parseRemindTime(request.remindTime()),
                Priority.parseOrDefault(request.priority()), request.notes());

        return ReminderResponse.of(reminderRepository.saveAndFlush(reminder), today());
    }

    /**
     * แก้ใบทั้งก้อน แล้วคิดวันครบกำหนดครั้งถัดไปใหม่จากวันเริ่มกับรอบชุดใหม่เทียบกับวันนี้
     * สูตรเดียวกับ nextOccurrence ฝั่งหน้าเว็บ (ดู MaintenanceReminder.update)
     * <p>
     * ส่งโซนเวลาของนาฬิกาเข้าไปด้วย เพราะใบที่ระบบเพิ่งยิงไปเมื่อเช้าต้องไม่ถูกดึงวันครบ
     * กำหนดกลับมาเป็นวันนี้ตอนแอดมินแก้บันทึกตอนบ่าย ซึ่งต้องเทียบ lastTriggeredAt
     * (เป็น instant) กับวันตามเวลาไทย
     */
    @Transactional
    public ReminderResponse update(Long id, ReminderRequest request) {
        MaintenanceReminder reminder = findReminder(id);
        LocalDate today = today();

        reminder.update(request.name().trim(), ReminderFrequency.parse(request.frequency()),
                request.startDate(), roomOf(request.roomId()),
                ReminderDtos.parseRemindTime(request.remindTime()),
                Priority.parseOrDefault(request.priority()), request.notes(), today, clock.getZone());

        return ReminderResponse.of(reminderRepository.saveAndFlush(reminder), today);
    }

    /**
     * เปิดหรือปิดสวิตช์ใบแจ้งเตือน
     * <p>
     * ไม่มี endpoint ลบใบทิ้ง เพราะการปิดสวิตช์ให้ผลที่ผู้ใช้ต้องการอยู่แล้ว (ระบบเลิกยิงใบ)
     * โดยที่ประวัติว่าใบแจ้งซ่อมเดือนก่อนมาจากไหนยังตามกลับได้ ถ้าลบจริงใบแจ้งซ่อมเก่า
     * จะชี้ไปหาของที่ไม่มีอยู่แล้ว
     */
    @Transactional
    public ReminderResponse setActive(Long id, Boolean active) {
        if (active == null) {
            throw new IllegalArgumentException("ต้องระบุว่าจะเปิดหรือปิดการแจ้งเตือน");
        }

        MaintenanceReminder reminder = findReminder(id);
        reminder.setActive(active);
        return ReminderResponse.of(reminderRepository.saveAndFlush(reminder), today());
    }

    /**
     * หน่วยงานของ US-14-S2 ทั้งหมด ไล่ใบที่ถึงกำหนดแล้วสร้างใบแจ้งซ่อมให้ใบละหนึ่งใบ
     * <p>
     * สามอย่างที่ทำกับใบที่ยิงไปแล้วคือ จดเวลาที่ยิง เลื่อนครั้งถัดไปให้พ้นวันนี้ และปิดสวิตช์
     * ถ้าเป็นใบรอบเดียว ทั้งสามอย่างอยู่ใน MaintenanceReminder เพื่อให้กฎอยู่ที่เดียว
     * <p>
     * ดึงเฉพาะใบที่ถึงกำหนดและยังเปิดอยู่ พร้อมล็อกแถวไว้ ไม่ได้ดึงทุกใบมากรองในโค้ด
     * เพราะ k8s รัน backend สอง pod งานประจำวันจึงยิงพร้อมกันสองที่ และการอ่านแบบไม่ล็อก
     * ทำให้ทั้งคู่เห็นใบเดียวกันว่าถึงกำหนดแล้วสร้างใบแจ้งซ่อมซ้ำ เหตุผลเต็มอยู่ที่
     * MaintenanceReminderRepository.findDueForUpdate ส่วน isDueOn ยังถูกเรียกซ้ำตรงนี้
     * เพื่อให้ "เงื่อนไขที่ทำให้ใบถูกยิง" เขียนไว้ที่ MaintenanceReminder ที่เดียวเหมือนเดิม
     * <p>
     * การแจ้งเตือนที่ US-14 พูดถึงออกมาเป็น "ใบแจ้งซ่อมที่โผล่ในระบบ" ไม่ใช่อีเมลหรือ
     * push เพราะโจทย์ของวิชาห้ามพึ่ง external service และสิ่งที่แอดมินต้องทำต่อจริง ๆ
     * คือไปจัดการงานซ่อมใบนั้น ไม่ใช่แค่รับรู้ว่าถึงรอบแล้ว
     */
    @Transactional
    public int runDue(LocalDate today) {
        Instant firedAt = Instant.now(clock);
        int created = 0;

        for (MaintenanceReminder reminder : reminderRepository.findDueForUpdate(today)) {
            if (!reminder.isDueOn(today)) {
                continue;
            }

            // ใบของทั้งตึกยังไม่มีห้องให้ผูก ตอนนี้จึงยังไม่สร้างใบแจ้งซ่อมให้ เพราะ
            // maintenance_ticket บังคับว่าต้องมีห้อง (ดูเหตุผลใน V8) แต่ยังต้องเลื่อนรอบ
            // ให้พ้นวันนี้ ไม่งั้นใบจะค้างเป็นเลยกำหนดตลอดไปและถูกหยิบมาพิจารณาทุกวัน
            if (reminder.getRoom() != null) {
                ticketRepository.save(MaintenanceTicket.fromReminder(reminder, reminder.getRoom()));
                created++;
            }

            reminder.markTriggered(firedAt);
            reminder.advancePast(today);
            reminderRepository.save(reminder);
        }

        return created;
    }

    /** วันนี้ตามนาฬิกาที่ฉีดเข้ามา ของจริงคือเวลาไทยตาม AppTime */
    public LocalDate today() {
        return LocalDate.now(clock);
    }

    private MaintenanceReminder findReminder(Long id) {
        return reminderRepository.findWithRoomById(id)
                .orElseThrow(() -> new NotFoundException("การแจ้งเตือน", id));
    }

    /** ไม่ระบุห้องได้ แปลว่าเป็นงานของทั้งตึก ระบุมาแล้วต้องมีอยู่จริง */
    private Room roomOf(Long roomId) {
        if (roomId == null) {
            return null;
        }
        return roomRepository.findById(roomId)
                .orElseThrow(() -> new NotFoundException("ห้อง", roomId));
    }
}
