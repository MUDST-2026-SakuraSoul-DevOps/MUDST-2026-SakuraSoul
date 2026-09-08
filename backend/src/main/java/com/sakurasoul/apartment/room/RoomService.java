package com.sakurasoul.apartment.room;

import com.sakurasoul.apartment.common.AppTime;
import com.sakurasoul.apartment.common.NotFoundException;
import com.sakurasoul.apartment.lease.Lease;
import com.sakurasoul.apartment.lease.LeaseRepository;
import com.sakurasoul.apartment.lease.LeaseStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
public class RoomService {

    private final RoomRepository roomRepository;
    private final LeaseRepository leaseRepository;

    public RoomService(RoomRepository roomRepository, LeaseRepository leaseRepository) {
        this.roomRepository = roomRepository;
        this.leaseRepository = leaseRepository;
    }

    /**
     * ห้องทั้ง 24 ห้องเรียงตามเลขห้อง ใช้เลี้ยงหน้าผังห้อง
     * <p>
     * ดึงสัญญา active มาทีเดียวแล้วจับคู่กับห้องในหน่วยความจำ ถ้าไล่ถามทีละห้อง
     * จะกลายเป็น 24 query ต่อการโหลดแดชบอร์ดหนึ่งครั้ง
     */
    @Transactional(readOnly = true)
    public List<RoomSummaryResponse> listRooms() {
        Map<Long, Lease> activeByRoom = activeLeasesToday();

        return roomRepository.findAllByOrderByRoomNumberAsc().stream()
                .map(room -> RoomSummaryResponse.of(room, activeByRoom.get(room.getId())))
                .toList();
    }

    @Transactional(readOnly = true)
    public RoomDetailResponse getRoom(Long id) {
        Room room = roomRepository.findById(id)
                .orElseThrow(() -> new NotFoundException("ห้อง", id));

        LocalDate today = AppTime.today();
        Lease activeLease = leaseRepository.findByRoomIdAndStatus(id, LeaseStatus.ACTIVE).stream()
                .filter(lease -> lease.coversDate(today))
                .findFirst()
                .orElse(null);

        return RoomDetailResponse.of(room, activeLease);
    }

    /**
     * สัญญาที่สถานะ ACTIVE และครอบวันนี้ จับเป็น map จาก roomId
     * <p>
     * ที่ต้องกรอง coversDate ซ้ำถึงจะกรอง ACTIVE มาแล้ว เพราะสัญญาที่เซ็นล่วงหน้า
     * ให้เดือนหน้าก็เป็น ACTIVE เหมือนกัน แต่ห้องยังว่างอยู่วันนี้
     * <p>
     * ห้องหนึ่งมีสัญญาที่ครอบวันเดียวกันได้ใบเดียวอยู่แล้วเพราะ constraint
     * lease_no_overlap กันไว้ ตัวรวมจึงหยิบใบแรกพอ
     */
    private Map<Long, Lease> activeLeasesToday() {
        LocalDate today = AppTime.today();
        return leaseRepository.findByStatus(LeaseStatus.ACTIVE).stream()
                .filter(lease -> lease.coversDate(today))
                .collect(Collectors.toMap(lease -> lease.getRoom().getId(),
                        Function.identity(), (first, ignored) -> first));
    }
}
