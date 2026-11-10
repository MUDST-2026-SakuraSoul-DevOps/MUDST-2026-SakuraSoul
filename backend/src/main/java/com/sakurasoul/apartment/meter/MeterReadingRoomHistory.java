package com.sakurasoul.apartment.meter;

import com.sakurasoul.apartment.room.RoomHistorySource;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.util.Collection;
import java.util.HashSet;
import java.util.Set;

/**
 * ค่ามิเตอร์เป็นประวัติการใช้น้ำไฟของห้อง กราฟการใช้ (SSK-167) อ่านย้อนหลังได้หลายปี ห้องที่มีค่ามิเตอร์จึงลบไม่ได้
 * ดู RoomHistorySource
 */
@Component
@Order(3)
public class MeterReadingRoomHistory implements RoomHistorySource {

    private final MeterReadingRepository meterReadingRepository;

    public MeterReadingRoomHistory(MeterReadingRepository meterReadingRepository) {
        this.meterReadingRepository = meterReadingRepository;
    }

    @Override
    public String label() {
        return "meter reading history";
    }

    @Override
    public Set<Long> roomIdsAmong(Collection<Long> roomIds) {
        return new HashSet<>(meterReadingRepository.findRoomIdsAmong(roomIds));
    }
}
