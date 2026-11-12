package com.sakurasoul.apartment.buildingconfig;

import com.sakurasoul.apartment.buildingconfig.BuildingLayout.LayoutPlan;
import com.sakurasoul.apartment.buildingconfig.BuildingLayout.PlannedRoom;
import com.sakurasoul.apartment.room.Room;
import com.sakurasoul.apartment.room.RoomType;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * กฎผังตึกของ SSK-160 แบบไม่ยก database ผลต้องตรงกับ frontend/src/domain/buildingLayout.test.ts
 * เพราะหน้าเว็บสรุปให้แอดมินดูก่อนกดบันทึกว่าจะเพิ่มและลบห้องไหนด้วยกฎชุดเดียวกัน
 */
class BuildingLayoutTest {

    @Test
    @DisplayName("เลขห้องคือเลขชั้นตามด้วยลำดับห้องสองหลัก ชั้น 3 ห้องที่ 7 คือ 307 ชั้น 10 ห้องที่ 12 คือ 1012")
    void roomNumberIsTheFloorFollowedByTwoDigits() {
        assertThat(BuildingLayout.roomNumber(3, 7)).isEqualTo("307");
        assertThat(BuildingLayout.roomNumber(1, 12)).isEqualTo("112");
        assertThat(BuildingLayout.roomNumber(10, 12)).isEqualTo("1012");
    }

    @Test
    @DisplayName("ผัง 2 x 12 เปลี่ยนเป็น 3 x 10 ต้องเพิ่ม 301-310 และลบ 111 112 211 212 ตามลำดับผัง")
    void planAddsMissingRoomsAndRemovesRoomsOutsideTheLayout() {
        LayoutPlan plan = BuildingLayout.plan(seededRooms(), 3, 10);

        assertThat(plan.add()).extracting(PlannedRoom::roomNumber)
                .containsExactly("301", "302", "303", "304", "305", "306", "307", "308", "309", "310");
        assertThat(plan.add()).extracting(PlannedRoom::floor).containsOnly((short) 3);
        assertThat(plan.remove()).extracting(Room::getRoomNumber)
                .containsExactly("111", "112", "211", "212");
    }

    @Test
    @DisplayName("ผังเดิมกดบันทึกซ้ำ ไม่ต้องเพิ่มและไม่ต้องลบอะไรเลย")
    void theSameLayoutChangesNothing() {
        LayoutPlan plan = BuildingLayout.plan(seededRooms(), 2, 12);

        assertThat(plan.add()).isEmpty();
        assertThat(plan.remove()).isEmpty();
    }

    @Test
    @DisplayName("ห้องที่เลขไม่อยู่ในผัง รวมเลขที่ไม่ใช่ตัวเลขอย่าง A101 ต้องอยู่ในรายการที่ต้องลบ")
    void aRoomWithANumberOutsideTheLayoutIsRemoved() {
        List<Room> rooms = new ArrayList<>(seededRooms());
        rooms.add(new Room("A101", (short) 1, RoomType.SINGLE));

        LayoutPlan plan = BuildingLayout.plan(rooms, 2, 12);

        assertThat(plan.add()).isEmpty();
        assertThat(plan.remove()).extracting(Room::getRoomNumber).containsExactly("A101");
    }

    @Test
    @DisplayName("ข้อความ 409 ห้องเดียวใช้ Unit ... has หลายห้องใช้ Units ... have คั่นด้วยจุลภาค")
    void blockedRemovalMessageIsSingularOrPlural() {
        assertThat(BuildingLayout.blockedRemovalMessage(List.of("110")))
                .isEqualTo("Unit 110 has lease, maintenance or meter reading history and cannot be removed. Nothing was changed.");
        assertThat(BuildingLayout.blockedRemovalMessage(List.of("103", "110")))
                .isEqualTo("Units 103, 110 have lease, maintenance or meter reading history and cannot be removed. Nothing was changed.");
    }

    /** ห้อง 24 ห้องแบบที่ V2 ใส่ไว้ เรียงตามผังตึก */
    private static List<Room> seededRooms() {
        List<Room> rooms = new ArrayList<>();
        for (int floor = 1; floor <= 2; floor++) {
            for (int index = 1; index <= 12; index++) {
                rooms.add(new Room(String.valueOf(floor * 100 + index), (short) floor,
                        floor == 1 ? RoomType.SINGLE : RoomType.DOUBLE));
            }
        }
        return rooms;
    }
}
