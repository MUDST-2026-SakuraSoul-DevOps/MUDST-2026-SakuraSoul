package com.sakurasoul.apartment.room;

import com.sakurasoul.apartment.maintenance.MaintenanceTicket;

import java.util.List;

/**
 * งานซ่อมที่ยังค้างของห้องหนึ่ง ย่อเหลือสองอย่างที่การ์ดห้องต้องใช้ (CR-05)
 * <p>
 * มีอยู่เพื่อไม่ให้ต้องส่งตัวเลขกับข้อความสองตัวลอย ๆ ผ่านหลายเมธอดจนสลับกันได้ง่าย
 * และเพื่อให้กฎว่า "ชื่อที่โชว์คือชื่อของใบที่ค้างนานที่สุด" อยู่ที่เดียว
 * <p>
 * ตัว null แปลว่าห้องนี้ไม่มีใบค้าง ซึ่งตอบเป็น 0 กับ null ตามสัญญา API
 */
public record OpenMaintenance(int count, String oldestTitle) {

    /**
     * ใบที่ค้างของห้องหนึ่ง โดยลิสต์ที่ส่งเข้ามาต้องเรียงจากเก่าไปใหม่แล้ว
     * (ดู MaintenanceTicketRepository ที่เรียงมาให้ตั้งแต่ในคิวรี)
     */
    public static OpenMaintenance of(List<MaintenanceTicket> openTickets) {
        if (openTickets.isEmpty()) {
            return null;
        }
        return new OpenMaintenance(openTickets.size(), openTickets.getFirst().getTitle());
    }

    static int countOf(OpenMaintenance openMaintenance) {
        return openMaintenance == null ? 0 : openMaintenance.count();
    }

    static String titleOf(OpenMaintenance openMaintenance) {
        return openMaintenance == null ? null : openMaintenance.oldestTitle();
    }
}
