package com.sakurasoul.apartment.buildingconfig;

import com.sakurasoul.apartment.buildingconfig.BuildingConfigDtos.BuildingConfigRequest;
import com.sakurasoul.apartment.room.RoomType;

import java.math.BigDecimal;

/**
 * ตรวจผังตึกก่อนบันทึก (SSK-160)
 * <p>
 * เป็นฝาแฝดของ validateBuildingLayout ใน frontend/src/domain/buildingLayout.ts ทั้งลำดับการตรวจ เพดาน
 * และข้อความต้องตรงกันเป๊ะ หน้าเว็บเตือนก่อนกดส่งด้วยกฎฝั่งโน้น ฝั่งนี้เป็นตาข่ายชั้นสุดท้าย
 * แก้ที่นี่แล้วต้องไปแก้อีกฝั่งด้วยเสมอ
 */
final class BuildingConfigRules {

    /** กันพิมพ์ผิด ไม่ใช่กฎธุรกิจ ค่าเดียวกับ MAX_FLOORS ฝั่งหน้าเว็บและ building_config_floors_ck ใน V16 */
    static final int MAX_FLOORS = 50;

    /** ลำดับห้องในชั้นมีสองหลัก ห้องที่ 100 ของชั้น 1 จะได้เลข 200 ชนกับห้องแรกของชั้น 2 */
    static final int MAX_ROOMS_PER_FLOOR = 99;

    private BuildingConfigRules() {
    }

    /** คืนข้อความเตือนช่องแรกที่ผิด หรือ null เมื่อถูกทุกช่อง */
    static String validate(BuildingConfigRequest request) {
        if (!isWholeNumberWithin(request.floors(), MAX_FLOORS)) {
            return "Number of floors must be a whole number from 1 to " + MAX_FLOORS;
        }
        if (!isWholeNumberWithin(request.roomsPerFloor(), MAX_ROOMS_PER_FLOOR)) {
            return "Rooms per floor must be a whole number from 1 to " + MAX_ROOMS_PER_FLOOR;
        }
        if (newRoomTypeOrNull(request) == null) {
            return "Room type for new units must be SINGLE or DOUBLE";
        }
        return null;
    }

    /** เรียกหลัง validate ผ่านแล้วเท่านั้น */
    static int floors(BuildingConfigRequest request) {
        return request.floors().intValueExact();
    }

    /** เรียกหลัง validate ผ่านแล้วเท่านั้น */
    static int roomsPerFloor(BuildingConfigRequest request) {
        return request.roomsPerFloor().intValueExact();
    }

    /** เรียกหลัง validate ผ่านแล้วเท่านั้น */
    static RoomType newRoomType(BuildingConfigRequest request) {
        return newRoomTypeOrNull(request);
    }

    /**
     * 2.0 นับเป็นจำนวนเต็ม (stripTrailingZeros ตัดศูนย์ท้ายทิ้ง) ส่วน 2.5 ไม่นับ เทียบช่วงก่อนแปลงเป็น int
     * ค่าใหญ่อย่าง 1e10 จะได้ตกช่วงแทนที่จะพังตอนแปลง
     */
    private static boolean isWholeNumberWithin(BigDecimal value, int max) {
        return value != null
                && value.stripTrailingZeros().scale() <= 0
                && value.compareTo(BigDecimal.ONE) >= 0
                && value.compareTo(BigDecimal.valueOf(max)) <= 0;
    }

    /** รับเฉพาะตัวพิมพ์ใหญ่ตรงตัว ตรงกับฝั่งหน้าเว็บที่เทียบกับ ['SINGLE', 'DOUBLE'] */
    private static RoomType newRoomTypeOrNull(BuildingConfigRequest request) {
        for (RoomType type : RoomType.values()) {
            if (type.name().equals(request.newRoomType())) {
                return type;
            }
        }
        return null;
    }
}
