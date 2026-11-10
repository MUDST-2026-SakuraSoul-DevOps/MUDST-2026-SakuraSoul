package com.sakurasoul.apartment.buildingconfig;

import com.fasterxml.jackson.annotation.JsonFormat;

import java.math.BigDecimal;
import java.time.Instant;

/**
 * รูปร่าง request กับ response ของผังตึก (SSK-160) ตาม docs/api-contract-building-config.md
 * ตรงกับ BuildingConfig กับ BuildingConfigRequest ใน frontend/src/api/types.ts ของหน้าเว็บ (PR #175)
 */
public final class BuildingConfigDtos {

    private BuildingConfigDtos() {
    }

    /**
     * จำนวนชั้นกับจำนวนห้องต่อชั้นรับเป็น BigDecimal ไม่ใช่ int เพื่อให้ค่าอย่าง 2.5 มาถึง BuildingConfigRules
     * แล้วได้ข้อความ "must be a whole number" ตรงกับหน้าเว็บ ถ้าเป็น int Jackson จะปัดทิ้งหรือฟ้องเองก่อน
     * <p>
     * ชนิดห้องรับเป็นสตริงด้วยเหตุผลเดียวกับ RoomStatusRequest ค่าที่ไม่ใช่ SINGLE หรือ DOUBLE
     * (รวมตัวพิมพ์เล็กและค่าว่าง) จะได้ข้อความของกฎ ไม่ใช่ข้อความกลาง ๆ จากการแปลง enum ไม่ผ่าน
     * <p>
     * ไม่ใส่ bean validation เหตุผลเดียวกับ ApartmentConfigDtos หน้าเว็บอ่านข้อความจาก detail ตรง ๆ
     */
    public record BuildingConfigRequest(
            BigDecimal floors,
            BigDecimal roomsPerFloor,
            String newRoomType) {
    }

    /** totalRooms นับจากตาราง room จริง อาจน้อยกว่า floors x roomsPerFloor ถ้าเคยลบห้องทีละห้อง */
    public record BuildingConfigResponse(
            int floors,
            int roomsPerFloor,
            int totalRooms,

            /* รูปแบบเดียวกับ updatedAt ของ apartment-config ดูเหตุผลที่ ApartmentConfigDtos */
            @JsonFormat(shape = JsonFormat.Shape.STRING,
                    pattern = "yyyy-MM-dd'T'HH:mm:ss.SSSX", timezone = "UTC")
            Instant updatedAt) {

        public static BuildingConfigResponse of(BuildingConfig config, long totalRooms) {
            return new BuildingConfigResponse(config.getFloors(), config.getRoomsPerFloor(),
                    Math.toIntExact(totalRooms), config.getUpdatedAt());
        }
    }
}
