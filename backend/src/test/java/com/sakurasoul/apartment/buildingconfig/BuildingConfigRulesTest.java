package com.sakurasoul.apartment.buildingconfig;

import com.sakurasoul.apartment.buildingconfig.BuildingConfigDtos.BuildingConfigRequest;
import com.sakurasoul.apartment.room.RoomType;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import java.math.BigDecimal;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * กฎตรวจผังตึกของ SSK-160 เขียนเป็นตารางเคส ข้อความต้องตรงกับ validateBuildingLayout ฝั่งหน้าเว็บทุกตัวอักษร
 * ช่องว่างในตาราง (ไม่ใส่ค่า) คือไม่ได้ส่งช่องนั้นมา
 */
class BuildingConfigRulesTest {

    private static final String FLOORS = "Number of floors must be a whole number from 1 to 50";
    private static final String ROOMS = "Rooms per floor must be a whole number from 1 to 99";
    private static final String TYPE = "Room type for new units must be SINGLE or DOUBLE";

    @ParameterizedTest(name = "floors={0} roomsPerFloor={1} type={2}")
    @CsvSource({
            "3, 10, SINGLE",
            "1, 1, DOUBLE",
            "50, 99, SINGLE",
            // 2.0 นับเป็นจำนวนเต็ม เหมือน Number.isInteger(2.0) ฝั่งหน้าเว็บ
            "2.0, 12, SINGLE",
    })
    @DisplayName("ค่าที่อยู่ในช่วงและเป็นจำนวนเต็ม ต้องผ่าน")
    void validLayoutsPass(String floors, String roomsPerFloor, String type) {
        assertThat(BuildingConfigRules.validate(request(floors, roomsPerFloor, type))).isNull();
    }

    @ParameterizedTest(name = "floors={0} roomsPerFloor={1} type={2} -> {3}")
    @CsvSource({
            "0, 10, SINGLE, " + FLOORS,
            "51, 10, SINGLE, " + FLOORS,
            "2.5, 10, SINGLE, " + FLOORS,
            "-1, 10, SINGLE, " + FLOORS,
            "1e10, 10, SINGLE, " + FLOORS,
            ", 10, SINGLE, " + FLOORS,
            "3, 0, SINGLE, " + ROOMS,
            "3, 100, SINGLE, " + ROOMS,
            "3, 1.5, SINGLE, " + ROOMS,
            "3, , SINGLE, " + ROOMS,
            "3, 10, TRIPLE, " + TYPE,
            "3, 10, single, " + TYPE,
            "3, 10, , " + TYPE,
            // ผิดหลายช่องได้ข้อความของช่องแรก ลำดับเดียวกับฟอร์ม
            "0, 0, TRIPLE, " + FLOORS,
            "3, 0, TRIPLE, " + ROOMS,
    })
    @DisplayName("ค่าที่ผิดต้องได้ข้อความของช่องแรกที่ผิด")
    void invalidLayoutsReportTheFirstProblem(String floors, String roomsPerFloor, String type, String message) {
        assertThat(BuildingConfigRules.validate(request(floors, roomsPerFloor, type))).isEqualTo(message);
    }

    @Test
    @DisplayName("ผ่านกฎแล้วแปลงเป็นจำนวนเต็มกับชนิดห้องได้ตรงค่า")
    void convertsAValidRequest() {
        BuildingConfigRequest request = request("3.0", "10", "DOUBLE");

        assertThat(BuildingConfigRules.floors(request)).isEqualTo(3);
        assertThat(BuildingConfigRules.roomsPerFloor(request)).isEqualTo(10);
        assertThat(BuildingConfigRules.newRoomType(request)).isEqualTo(RoomType.DOUBLE);
    }

    private static BuildingConfigRequest request(String floors, String roomsPerFloor, String type) {
        return new BuildingConfigRequest(floors == null ? null : new BigDecimal(floors),
                roomsPerFloor == null ? null : new BigDecimal(roomsPerFloor), type);
    }
}
