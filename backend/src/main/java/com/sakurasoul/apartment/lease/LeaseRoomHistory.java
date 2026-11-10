package com.sakurasoul.apartment.lease;

import com.sakurasoul.apartment.room.RoomHistorySource;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.util.Collection;
import java.util.HashSet;
import java.util.Set;

/** สัญญาทุกสถานะรวมที่ปิดไปแล้วเป็นประวัติของห้อง ดู RoomHistorySource */
@Component
@Order(1)
public class LeaseRoomHistory implements RoomHistorySource {

    private final LeaseRepository leaseRepository;

    public LeaseRoomHistory(LeaseRepository leaseRepository) {
        this.leaseRepository = leaseRepository;
    }

    @Override
    public String label() {
        return "lease history";
    }

    @Override
    public Set<Long> roomIdsAmong(Collection<Long> roomIds) {
        return new HashSet<>(leaseRepository.findRoomIdsAmong(roomIds));
    }
}
