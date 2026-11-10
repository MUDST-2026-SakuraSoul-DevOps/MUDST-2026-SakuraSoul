package com.sakurasoul.apartment.usage;

import com.sakurasoul.apartment.common.NotFoundException;
import com.sakurasoul.apartment.room.RoomRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * กราฟการใช้น้ำไฟ (SSK-167) ตาม docs/api-contract-phase2-backend.md ภาพรวมหลายปีของ SSK-181 จะใช้ตัวอ่านกับตัวประกอบชุดนี้ต่อ
 * <p>
 * ห้องหรือชั้นที่ไม่มีอยู่ได้ 404 ก่อนอ่านยอด ไม่ใช่กราฟที่เป็นศูนย์ทั้งเส้น ซึ่งดูเหมือนห้องนั้นไม่ได้ใช้น้ำไฟเลย
 */
@Service
public class UsageService {

    private final UsageReader usageReader;
    private final RoomRepository roomRepository;

    public UsageService(UsageReader usageReader, RoomRepository roomRepository) {
        this.usageReader = usageReader;
        this.roomRepository = roomRepository;
    }

    @Transactional(readOnly = true)
    public List<UsagePoint> usage(UsageQuery query) {
        if (query.scope() == UsageQuery.Scope.ROOM && !roomRepository.existsById(query.roomId())) {
            throw new NotFoundException("unit", query.roomId());
        }
        if (query.scope() == UsageQuery.Scope.FLOOR && !roomRepository.existsByFloor(query.floor())) {
            throw new NotFoundException("No floor " + query.floor());
        }
        return UsageSeries.of(query, usageReader.monthlyTotals(query));
    }
}
