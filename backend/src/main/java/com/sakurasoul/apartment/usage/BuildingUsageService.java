package com.sakurasoul.apartment.usage;

import com.sakurasoul.apartment.room.RoomRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

/**
 * ภาพรวมการใช้น้ำไฟทั้งตึกหลายปี (SSK-181) ตาม docs/api-contract-phase2-backend.md
 * <p>
 * อ่านยอดรายเดือนคำสั่งเดียว (BuildingUsageReader) กับนับห้องในผังอีกคำสั่ง แบบ REPEATABLE_READ ให้สองคำสั่งเห็นข้อมูลจังหวะเดียวกัน
 */
@Service
public class BuildingUsageService {

    private final BuildingUsageReader buildingUsageReader;
    private final RoomRepository roomRepository;

    public BuildingUsageService(BuildingUsageReader buildingUsageReader, RoomRepository roomRepository) {
        this.buildingUsageReader = buildingUsageReader;
        this.roomRepository = roomRepository;
    }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public BuildingUsageReport report(BuildingUsageQuery query) {
        return BuildingUsageSeries.of(query, buildingUsageReader.monthly(query.readFrom(), query.to()),
                roomRepository.count());
    }
}
