package com.sakurasoul.apartment.buildingconfig;

import com.sakurasoul.apartment.room.Room;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * กฎผังตึกแบบ pure function (SSK-160) ฝาแฝดของ frontend/src/domain/buildingLayout.ts
 * <p>
 * เลขห้องคือเลขชั้นตามด้วยลำดับห้องสองหลัก แบบเดียวกับ V2__seed_rooms.sql (ชั้น 3 ห้องที่ 7 = 307)
 * แยกออกมาจาก service ให้เทสได้โดยไม่ต้องยก database และให้สองฝั่งคิดตรงกันว่าห้องไหนเพิ่มห้องไหนลบ
 */
final class BuildingLayout {

    /** ห้องหนึ่งห้องในผังที่ยังไม่มีอยู่จริง */
    record PlannedRoom(String roomNumber, short floor) {
    }

    /**
     * ผลการเทียบห้องที่มีอยู่กับผังใหม่ add คือห้องในผังที่ยังไม่มี remove คือห้องที่มีอยู่แต่อยู่นอกผัง
     * ห้องที่อยู่ทั้งสองฝั่งไม่ถูกแตะเลย (id ชนิดห้อง สถานะ สัญญาเดิม)
     */
    record LayoutPlan(List<PlannedRoom> add, List<Room> remove) {
    }

    private BuildingLayout() {
    }

    static String roomNumber(int floor, int index) {
        return String.valueOf(floor * 100 + index);
    }

    /** ห้องทั้งหมดของผัง เรียงชั้นแล้วตามลำดับห้อง */
    static List<PlannedRoom> layoutRooms(int floors, int roomsPerFloor) {
        List<PlannedRoom> rooms = new ArrayList<>(floors * roomsPerFloor);
        for (int floor = 1; floor <= floors; floor++) {
            for (int index = 1; index <= roomsPerFloor; index++) {
                rooms.add(new PlannedRoom(roomNumber(floor, index), (short) floor));
            }
        }
        return rooms;
    }

    /**
     * จับคู่ด้วยเลขห้องอย่างเดียวแบบเดียวกับ planLayoutChange ฝั่งหน้าเว็บ ห้องที่เลขไม่อยู่ในผัง (รวมเลขที่ไม่ใช่
     * ตัวเลขอย่าง A101) เป็นห้องที่ต้องลบ ลำดับของ remove ตามลำดับของ existing ที่ส่งมา (ลำดับผังตึก)
     */
    static LayoutPlan plan(List<Room> existing, int floors, int roomsPerFloor) {
        List<PlannedRoom> target = layoutRooms(floors, roomsPerFloor);
        Set<String> existingNumbers = existing.stream().map(Room::getRoomNumber).collect(Collectors.toSet());
        Set<String> wanted = target.stream().map(PlannedRoom::roomNumber).collect(Collectors.toSet());
        return new LayoutPlan(
                target.stream().filter(room -> !existingNumbers.contains(room.roomNumber())).toList(),
                existing.stream().filter(room -> !wanted.contains(room.getRoomNumber())).toList());
    }

    /** ข้อความ 409 เมื่อห้องที่ต้องลบยังมีประวัติ ตรงกับ blockedRemovalMessage ฝั่งหน้าเว็บ */
    static String blockedRemovalMessage(List<String> roomNumbers) {
        String units = roomNumbers.size() == 1
                ? "Unit " + roomNumbers.getFirst() + " has"
                : "Units " + String.join(", ", roomNumbers) + " have";
        return units + " lease, maintenance or meter reading history and cannot be removed. Nothing was changed.";
    }
}
