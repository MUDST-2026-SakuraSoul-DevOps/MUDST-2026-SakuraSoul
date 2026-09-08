package com.sakurasoul.apartment.lease;

import com.sakurasoul.apartment.common.ConflictException;
import com.sakurasoul.apartment.common.NotFoundException;
import com.sakurasoul.apartment.lease.LeaseDtos.LeaseRequest;
import com.sakurasoul.apartment.lease.LeaseDtos.LeaseResponse;
import com.sakurasoul.apartment.room.Room;
import com.sakurasoul.apartment.room.RoomRepository;
import com.sakurasoul.apartment.tenant.Tenant;
import com.sakurasoul.apartment.tenant.TenantRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.List;

@Service
public class LeaseService {

    private final LeaseRepository leaseRepository;
    private final RoomRepository roomRepository;
    private final TenantRepository tenantRepository;

    public LeaseService(LeaseRepository leaseRepository, RoomRepository roomRepository,
            TenantRepository tenantRepository) {
        this.leaseRepository = leaseRepository;
        this.roomRepository = roomRepository;
        this.tenantRepository = tenantRepository;
    }

    /**
     * รายการสัญญา กรองด้วย status, roomId, tenantId ได้ ส่งมาไม่ครบก็ได้
     * <p>
     * กรองในหน่วยความจำเพราะสามตัวกรองนี้ใส่มาไม่ใส่มาก็ได้ รวมกันเป็นแปดแบบ
     * ถ้าทำเป็น derived query ต้องเขียนแปดเมธอด ส่วนหอนี้มี 24 ห้อง จำนวนสัญญา
     * ทั้งหมดจึงอยู่ในหลักสิบถึงร้อย การดึงมาแล้วกรองต่อจึงถูกกว่าความซับซ้อนที่จ่ายไป
     * ถ้าวันหนึ่งข้อมูลโตกว่านี้จริงค่อยเปลี่ยนไปใช้ Specification
     */
    @Transactional(readOnly = true)
    public List<LeaseResponse> list(LeaseStatus status, Long roomId, Long tenantId) {
        return leaseRepository.findAllByOrderByStartDateDesc().stream()
                .filter(lease -> status == null || lease.getStatus() == status)
                .filter(lease -> roomId == null || lease.getRoom().getId().equals(roomId))
                .filter(lease -> tenantId == null || lease.getTenant().getId().equals(tenantId))
                .map(LeaseResponse::of)
                .toList();
    }

    /**
     * สร้างสัญญาเช่าใหม่ตาม US-04-S1 พอสร้างเสร็จห้องจะกลายเป็น OCCUPIED เอง
     * เพราะสถานะห้องคำนวณจากสัญญาที่ active อยู่ ไม่ได้เก็บเป็นคอลัมน์แยก
     * (ดู RoomService.listRooms)
     */
    @Transactional
    public LeaseResponse create(LeaseRequest request) {
        Room room = roomRepository.findById(request.roomId())
                .orElseThrow(() -> new NotFoundException("ห้อง", request.roomId()));
        Tenant tenant = tenantRepository.findById(request.tenantId())
                .orElseThrow(() -> new NotFoundException("ผู้เช่า", request.tenantId()));

        if (request.endDate() != null && request.endDate().isBefore(request.startDate())) {
            throw new IllegalArgumentException("วันสิ้นสุดสัญญาต้องไม่มาก่อนวันเริ่มสัญญา");
        }

        guardAgainstOverlap(room, request.startDate(), request.endDate());

        Lease lease = new Lease(room, tenant, request.startDate(), request.endDate(),
                request.monthlyRent(), request.billingCycle(), request.toCharges());
        return LeaseResponse.of(leaseRepository.save(lease));
    }

    /**
     * เช็คว่าช่วงวันที่ที่ขอมาไปทับสัญญา active ใบไหนของห้องนี้หรือเปล่า
     * <p>
     * ตรงนี้ไม่ใช่ตัวกันปล่อยเช่าซ้อน ตัวกันจริงคือ constraint lease_no_overlap ใน V3
     * ที่มีขั้นนี้เพราะ US-05-S1 ขอให้ "แสดงข้อความบอกชัดเจนว่าห้องไม่ว่างในช่วงวันที่ใด"
     * ซึ่ง error ที่หลุดมาจาก database บอกไม่ได้ว่าไปชนกับสัญญาของใคร
     */
    private void guardAgainstOverlap(Room room, LocalDate startDate, LocalDate endDate) {
        leaseRepository.findByRoomIdAndStatus(room.getId(), LeaseStatus.ACTIVE).stream()
                .filter(existing -> existing.overlaps(startDate, endDate))
                .findFirst()
                .ifPresent(conflict -> {
                    throw new ConflictException(overlapMessage(room, conflict));
                });
    }

    /**
     * ข้อความ 409 ที่หน้าเว็บเอาไปโชว์ให้ผู้ใช้เห็นทั้งประโยค ต้องมีเลขห้อง ช่วงวันที่
     * ที่ไม่ว่าง และชื่อผู้เช่าเดิม ตามตัวอย่างใน docs/api-contract-lease.md
     */
    private static String overlapMessage(Room room, Lease conflict) {
        String period = conflict.getEndDate() == null
                ? "ตั้งแต่ " + conflict.getStartDate() + " เป็นต้นไป"
                : "ในช่วง " + conflict.getStartDate() + " ถึง " + conflict.getEndDate();
        return "ห้อง " + room.getRoomNumber() + " ไม่ว่าง" + period
                + " เพราะมีสัญญาของ " + conflict.getTenant().getFullName() + " อยู่แล้ว";
    }
}
