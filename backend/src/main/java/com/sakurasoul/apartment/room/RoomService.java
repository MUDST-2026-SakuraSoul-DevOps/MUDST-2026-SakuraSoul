package com.sakurasoul.apartment.room;

import com.sakurasoul.apartment.common.AppTime;
import com.sakurasoul.apartment.common.NotFoundException;
import com.sakurasoul.apartment.lease.Lease;
import com.sakurasoul.apartment.lease.LeaseRepository;
import com.sakurasoul.apartment.lease.LeaseStatus;
import com.sakurasoul.apartment.maintenance.MaintenanceTicketRepository;
import com.sakurasoul.apartment.maintenance.TicketStatus;
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
    private final MaintenanceTicketRepository ticketRepository;

    public RoomService(RoomRepository roomRepository, LeaseRepository leaseRepository,
            MaintenanceTicketRepository ticketRepository) {
        this.roomRepository = roomRepository;
        this.leaseRepository = leaseRepository;
        this.ticketRepository = ticketRepository;
    }

    /**
     * ห้องทั้ง 24 ห้องเรียงตามเลขห้อง ใช้เลี้ยงหน้าผังห้อง
     * <p>
     * ดึงสัญญา active มาทีเดียวแล้วจับคู่กับห้องในหน่วยความจำ ถ้าไล่ถามทีละห้อง
     * จะกลายเป็น 24 query ต่อการโหลดแดชบอร์ดหนึ่งครั้ง
     * <p>
     * ตัวสัญญาพร้อมห้องกับผู้เช่าของมันมาในคิวรีเดียวกันหมด เพราะ LeaseRepository
     * ติด @EntityGraph ไว้ ถ้าไม่มี การ์ดแต่ละใบที่โชว์ชื่อผู้เช่าจะลากคิวรีตามมาอีกใบละสอง
     * <p>
     * ใบแจ้งซ่อมที่ยังค้างก็ดึงมาทีเดียวด้วยหลักการเดียวกัน (CR-05) ไม่ใช่ถามทีละห้อง
     * ว่ามีงานค้างกี่ใบ ซึ่งจะเป็นคิวรีที่สามที่โตตามจำนวนห้อง
     */
    @Transactional(readOnly = true)
    public List<RoomSummaryResponse> listRooms() {
        Map<Long, Lease> activeByRoom = activeLeasesToday();
        Map<Long, OpenMaintenance> openByRoom = openMaintenanceByRoom();

        return roomRepository.findAllByOrderByRoomNumberAsc().stream()
                .map(room -> RoomSummaryResponse.of(room, activeByRoom.get(room.getId()),
                        openByRoom.get(room.getId())))
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
     * และไม่ไปแตะใบแจ้งซ่อมของห้องนี้ด้วย การปลดล็อกห้องไม่ได้แปลว่างานซ่อมเสร็จแล้ว
     * (งานของ CR-05 ปิดที่ PATCH /api/maintenance/{id} ต่างหาก) สองเรื่องนี้แยกกัน
     * เหมือนที่แยกกันในทางกลับ คือปิดใบแจ้งซ่อมแล้วห้องไม่ได้ถูกปลดล็อกให้เอง
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
        throw new IllegalArgumentException("สถานะที่ตั้งเองได้มีแค่ MAINTENANCE กับ AVAILABLE");
    }

    private Room findRoom(Long id) {
        return roomRepository.findById(id)
                .orElseThrow(() -> new NotFoundException("ห้อง", id));
    }

    /** ก้อน response ของห้องเดี่ยว ใช้ร่วมกันทั้ง GET และ PATCH สถานะจะได้คิดด้วยกฎเดียวกัน */
    private RoomDetailResponse detailOf(Room room) {
        LocalDate today = AppTime.today();
        Lease activeLease = leaseRepository.findByRoomIdAndStatus(room.getId(), LeaseStatus.ACTIVE)
                .stream()
                .filter(lease -> lease.coversDate(today))
                .findFirst()
                .orElse(null);

        // คิวรีเดียวของห้องใบนี้ ได้ทั้งจำนวนใบค้างและชื่อใบที่ค้างนานที่สุดในทีเดียว
        OpenMaintenance openMaintenance = OpenMaintenance.of(
                ticketRepository.findByRoomIdAndStatusNotOrderByReportedAtAscIdAsc(
                        room.getId(), TicketStatus.DONE));

        return RoomDetailResponse.of(room, activeLease, openMaintenance);
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

    /**
     * ใบแจ้งซ่อมที่ยังไม่ปิดของทั้งตึก จับกลุ่มตามห้องในหน่วยความจำ (CR-05)
     * <p>
     * คิวรีเดียวสำหรับทั้งแดชบอร์ด ไม่ใช่ห้องละคิวรี เหตุผลเดียวกับสัญญาข้างบน
     * <p>
     * คิวรีเรียงจากเก่าไปใหม่มาให้แล้ว และ groupingBy รักษาลำดับเดิมของ stream ไว้
     * ใบแรกของแต่ละกลุ่มจึงเป็นใบที่ค้างนานที่สุด ซึ่งเป็นชื่อที่ต้องเอาไปโชว์บนการ์ด
     */
    private Map<Long, OpenMaintenance> openMaintenanceByRoom() {
        return ticketRepository.findByStatusNotOrderByReportedAtAscIdAsc(TicketStatus.DONE).stream()
                .collect(Collectors.groupingBy(ticket -> ticket.getRoom().getId()))
                .entrySet().stream()
                .collect(Collectors.toMap(Map.Entry::getKey, entry -> OpenMaintenance.of(entry.getValue())));
    }
}
