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
     * <p>
     * ตัวสัญญาพร้อมห้องกับผู้เช่าของมันมาในคิวรีเดียวกันหมด เพราะ LeaseRepository
     * ติด @EntityGraph ไว้ ถ้าไม่มี การ์ดแต่ละใบที่โชว์ชื่อผู้เช่าจะลากคิวรีตามมาอีกใบละสอง
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
        return detailOf(findRoom(id));
    }

    /**
     * ล็อกห้องเป็นซ่อมบำรุงหรือปลดล็อกกลับ (US-15) รับได้แค่ MAINTENANCE กับ AVAILABLE
     * <p>
     * ตั้งแค่ธงใบเดียว ไม่ไปแตะตาราง lease เลย ตามที่สัญญา API กำหนดว่าการล็อกห้อง
     * ต้องไม่ยกเลิกสัญญาที่มีอยู่ ผลคือห้องที่ยังมีผู้เช่าจะตอบ OCCUPIED กลับมาเองทันที
     * ที่ปลดล็อก โดยไม่ต้องจำว่าก่อนล็อกห้องเป็นอะไร
     * <p>
     * หาห้องก่อนตรวจค่าสถานะ ให้ลำดับเดียวกับ backend จำลองฝั่งหน้าเว็บ
     * (frontend/src/api/mockApi.ts) ยิง id ที่ไม่มีพร้อมสถานะที่ผิดจะได้ 404 เหมือนกัน
     * ทั้งสองฝั่ง เทสของหน้าเว็บจึงใช้ชุดเดียวกันได้ไม่ว่าจะต่อกับตัวไหน
     */
    @Transactional
    public RoomDetailResponse updateStatus(Long id, String status) {
        Room room = findRoom(id);

        if (parseMaintenanceLock(status)) {
            room.lockForMaintenance();
        } else {
            room.releaseFromMaintenance();
        }

        // flush ทันทีเพื่อให้ค่าลงฐานจริงก่อนจะประกอบ response ที่คิดสถานะใหม่จากห้องใบนี้
        return detailOf(roomRepository.saveAndFlush(room));
    }

    /**
     * สถานะที่แอดมินตั้งเองได้มีแค่สองค่า แปลงเป็นธงว่า "ต้องล็อกไหม"
     * <p>
     * OCCUPIED ตกที่นี่ด้วยทั้งที่เป็นค่าที่ระบบใช้จริง เพราะห้องจะมีผู้เช่าได้ก็ต่อเมื่อมีสัญญา
     * ที่ครอบวันนี้เท่านั้น การตั้งมือจะทำให้สถานะที่หน้าเว็บเห็นไม่ตรงกับสัญญาในฐานข้อมูล
     * <p>
     * ข้อความตรงกับที่ backend จำลองฝั่งหน้าเว็บตอบ (frontend/src/api/mockApi.ts)
     * และหน้าเว็บเอาไปโชว์ตรง ๆ เปลี่ยนที่นี่ต้องเปลี่ยนที่นั่นด้วย
     */
    private static boolean parseMaintenanceLock(String status) {
        if ("MAINTENANCE".equals(status)) {
            return true;
        }
        if ("AVAILABLE".equals(status)) {
            return false;
        }
        throw new IllegalArgumentException("Only MAINTENANCE and AVAILABLE can be set directly");
    }

    private Room findRoom(Long id) {
        return roomRepository.findById(id)
                .orElseThrow(() -> new NotFoundException("unit", id));
    }

    /** ก้อน response ของห้องเดี่ยว ใช้ร่วมกันทั้ง GET และ PATCH สถานะจะได้คิดด้วยกฎเดียวกัน */
    private RoomDetailResponse detailOf(Room room) {
        LocalDate today = AppTime.today();
        Lease activeLease = leaseRepository.findByRoomIdAndStatus(room.getId(), LeaseStatus.ACTIVE)
                .stream()
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
