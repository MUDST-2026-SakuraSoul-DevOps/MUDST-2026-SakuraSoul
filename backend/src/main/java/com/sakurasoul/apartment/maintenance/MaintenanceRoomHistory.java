package com.sakurasoul.apartment.maintenance;

import com.sakurasoul.apartment.room.RoomHistorySource;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.util.Collection;
import java.util.HashSet;
import java.util.Set;

/**
 * ใบแจ้งซ่อมกับรอบแจ้งเตือนซ่อมเป็นประวัติงานซ่อมของห้อง ดู RoomHistorySource
 * <p>
 * รวมสองตารางไว้ใต้คำเดียวกัน เพราะผู้ใช้เห็นทั้งคู่เป็นเรื่องซ่อมห้อง ข้อความ 409 เดิมก็ใช้คำนี้กับทั้งคู่
 * รอบแจ้งเตือนนับทุกใบรวมที่ปิดใช้งานแล้ว ส่วนรอบของทั้งตึก (room เป็น null) ไม่ผูกกับห้องไหน
 */
@Component
@Order(2)
public class MaintenanceRoomHistory implements RoomHistorySource {

    private final MaintenanceTicketRepository ticketRepository;
    private final MaintenanceReminderRepository reminderRepository;

    public MaintenanceRoomHistory(MaintenanceTicketRepository ticketRepository,
            MaintenanceReminderRepository reminderRepository) {
        this.ticketRepository = ticketRepository;
        this.reminderRepository = reminderRepository;
    }

    @Override
    public String label() {
        return "maintenance history";
    }

    @Override
    public Set<Long> roomIdsAmong(Collection<Long> roomIds) {
        Set<Long> withHistory = new HashSet<>(ticketRepository.findRoomIdsAmong(roomIds));
        withHistory.addAll(reminderRepository.findRoomIdsAmong(roomIds));
        return withHistory;
    }
}
