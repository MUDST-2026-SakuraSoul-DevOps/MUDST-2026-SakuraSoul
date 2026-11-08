package com.sakurasoul.apartment.buildingconfig;

import com.sakurasoul.apartment.buildingconfig.BuildingConfigDtos.BuildingConfigRequest;
import com.sakurasoul.apartment.buildingconfig.BuildingConfigDtos.BuildingConfigResponse;
import com.sakurasoul.apartment.buildingconfig.BuildingLayout.LayoutPlan;
import com.sakurasoul.apartment.common.ConflictException;
import com.sakurasoul.apartment.common.NotFoundException;
import com.sakurasoul.apartment.lease.LeaseRepository;
import com.sakurasoul.apartment.maintenance.MaintenanceReminderRepository;
import com.sakurasoul.apartment.maintenance.MaintenanceTicketRepository;
import com.sakurasoul.apartment.room.Room;
import com.sakurasoul.apartment.room.RoomRepository;
import com.sakurasoul.apartment.room.RoomType;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;

/**
 * ผังตึกตั้งค่าได้ (SSK-160) อาจารย์ให้ "Room count and floor count must be configurable"
 * <p>
 * ทีมเลือกแบบจำนวนชั้น x จำนวนห้องต่อชั้น ไม่ใช่เพิ่มลบทีละห้อง ตามดีไซน์ Apartment settings ใน SSK-177
 * กติกาทั้งหมดอยู่ใน docs/api-contract-building-config.md
 */
@Service
public class BuildingConfigService {

    /** ตารางนี้มีแถวเดียวเสมอ id ถูกล็อกไว้ด้วย CHECK constraint ใน V16 */
    private static final short SINGLETON_ID = 1;

    private final BuildingConfigRepository buildingConfigRepository;
    private final RoomRepository roomRepository;
    private final LeaseRepository leaseRepository;
    private final MaintenanceTicketRepository ticketRepository;
    private final MaintenanceReminderRepository reminderRepository;

    public BuildingConfigService(BuildingConfigRepository buildingConfigRepository, RoomRepository roomRepository,
            LeaseRepository leaseRepository, MaintenanceTicketRepository ticketRepository,
            MaintenanceReminderRepository reminderRepository) {
        this.buildingConfigRepository = buildingConfigRepository;
        this.roomRepository = roomRepository;
        this.leaseRepository = leaseRepository;
        this.ticketRepository = ticketRepository;
        this.reminderRepository = reminderRepository;
    }

    @Transactional(readOnly = true)
    public BuildingConfigResponse get() {
        BuildingConfig config = buildingConfigRepository.findById(SINGLETON_ID)
                .orElseThrow(BuildingConfigService::missingRow);
        return BuildingConfigResponse.of(config, roomRepository.count());
    }

    /**
     * ปรับผังตึกทั้งก้อนใน transaction เดียว
     * <ol>
     *   <li>ตรวจค่า ผิดได้ 400 ข้อความเดียวกับหน้าเว็บ</li>
     *   <li>ล็อกแถวผังตึก สองคำขอที่ปรับผังพร้อมกันจึงเข้าทำงานทีละคำขอ (ดู BuildingConfigRepository)</li>
     *   <li>เทียบห้องที่มีอยู่กับผังใหม่ ได้ห้องที่ต้องเพิ่มกับห้องที่ต้องลบ</li>
     *   <li>ล็อกห้องที่ต้องลบ แล้วถ้าห้องไหนมีสัญญา (ทุกสถานะรวม ENDED) ใบแจ้งซ่อม หรือรอบแจ้งเตือนซ่อม
     *       ตอบ 409 ทั้งก้อนโดยยังไม่เขียนอะไรเลย ห้องใหม่ไม่ถูกเพิ่มค้างไว้ครึ่งทาง</li>
     *   <li>ลบห้องนอกผัง เพิ่มห้องที่ขาดด้วยชนิดที่ส่งมา บันทึกผัง แล้วตอบแบบเดียวกับ GET</li>
     * </ol>
     * ใบเสร็จไม่ต้องเช็คแยก เพราะใบเสร็จผูกกับสัญญา ห้องที่มีใบเสร็จจึงมีสัญญาเสมอ
     * <p>
     * การล็อกห้องที่ต้องลบใช้ล็อกตัวเดียวกับที่ LeaseService ใช้ตอนสร้างสัญญา ถ้าสร้างสัญญาห้องนั้น commit ก่อน
     * ขั้นที่ 4 จะเห็นสัญญาแล้วตอบ 409 ถ้าปรับผังได้ล็อกก่อน คำขอสร้างสัญญาจะรอแล้วเจอว่าห้องหายไปแล้ว (404)
     * foreign key ของสัญญา ใบแจ้งซ่อม และรอบแจ้งเตือนยังเป็นด่านสุดท้ายเหมือนเดิม
     */
    @Transactional
    public BuildingConfigResponse update(BuildingConfigRequest request) {
        String invalid = BuildingConfigRules.validate(request);
        if (invalid != null) {
            throw new IllegalArgumentException(invalid);
        }
        int floors = BuildingConfigRules.floors(request);
        int roomsPerFloor = BuildingConfigRules.roomsPerFloor(request);
        RoomType newRoomType = BuildingConfigRules.newRoomType(request);

        BuildingConfig config = buildingConfigRepository.findByIdForUpdate(SINGLETON_ID)
                .orElseThrow(BuildingConfigService::missingRow);

        LayoutPlan plan = BuildingLayout.plan(roomRepository.findAllInLayoutOrder(), floors, roomsPerFloor);

        if (!plan.remove().isEmpty()) {
            List<Room> locked = roomRepository.findAllByIdInForUpdate(
                    plan.remove().stream().map(Room::getId).toList());
            // ข้อความไล่เลขห้องตามลำดับผังตึก ไม่ใช่ตามลำดับที่ล็อก (ล็อกเรียงตาม id)
            List<String> blocked = plan.remove().stream()
                    .filter(room -> hasHistory(room.getId()))
                    .map(Room::getRoomNumber)
                    .toList();
            if (!blocked.isEmpty()) {
                throw new ConflictException(BuildingLayout.blockedRemovalMessage(blocked));
            }
            roomRepository.deleteAll(locked);
        }

        roomRepository.saveAll(plan.add().stream()
                .map(room -> new Room(room.roomNumber(), room.floor(), newRoomType))
                .toList());

        // ตัดทศนิยมของ Instant ให้เหลือมิลลิวินาทีเหมือน apartment-config ค่าที่ตอบกับค่าที่อ่านทีหลังจะได้ตรงกัน
        config.apply((short) floors, (short) roomsPerFloor, Instant.now().truncatedTo(ChronoUnit.MILLIS));

        // flush ทั้งห้องที่ลบ ห้องที่เพิ่ม และผัง ก่อนประกอบ response ให้ constraint ดังตรงนี้
        // ไม่ใช่ไปดังตอน commit หลัง controller ตอบ 200 ไปแล้ว
        buildingConfigRepository.saveAndFlush(config);

        return BuildingConfigResponse.of(config, roomRepository.count());
    }

    /** กฎเดียวกับ RoomService.delete สัญญาทุกสถานะ ใบแจ้งซ่อม และรอบแจ้งเตือน นับเป็นประวัติที่ต้องเก็บ */
    private boolean hasHistory(Long roomId) {
        return leaseRepository.existsByRoomId(roomId)
                || ticketRepository.existsByRoomId(roomId)
                || reminderRepository.existsByRoomId(roomId);
    }

    /**
     * แถวเดียวของตารางนี้ถูกใส่ไว้ตั้งแต่ V16 หาไม่เจอแปลว่า migration ไม่ได้รันหรือมีคนลบทิ้ง
     * ควรดังเป็น 404 ให้เห็น ไม่ใช่สร้างใหม่เงียบ ๆ เหตุผลเดียวกับ ApartmentConfigService
     */
    private static NotFoundException missingRow() {
        return new NotFoundException("No building config in the database. Check that migration V16 has run");
    }
}
