package com.sakurasoul.apartment.extracharge;

import com.sakurasoul.apartment.common.ConflictException;
import com.sakurasoul.apartment.common.NotFoundException;
import com.sakurasoul.apartment.extracharge.ExtraChargeDtos.ExtraChargeRequest;
import com.sakurasoul.apartment.extracharge.ExtraChargeDtos.ExtraChargeResponse;
import com.sakurasoul.apartment.lease.LeaseRepository;
import com.sakurasoul.apartment.room.Room;
import com.sakurasoul.apartment.room.RoomRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * ค่าใช้จ่ายพิเศษต่อห้อง (SSK-165) ตาม docs/api-contract-phase2-backend.md
 * <p>
 * ที่นี่ดูแลแค่ค่าตั้งของห้อง การคัดลอกลงสัญญาอยู่ที่ LeaseService.create และการเก็บเงินอยู่ที่ Receipt.issue
 * <p>
 * ทุกการเขียนล็อกแถวห้องก่อน ล็อกเดียวกับที่ LeaseService.create ใช้ การลบรายการกับการทำสัญญาของห้องเดียวกัน
 * จึงเข้าทำงานทีละคำขอ ถ้าสัญญาบันทึกก่อน การลบจะเห็นสำเนาแล้วตอบ 409 ถ้าการลบได้ก่อน สัญญาจะไม่เห็นรายการนั้นเลย
 * ลำดับการตรวจเหมือน backend จำลอง คือห้องไม่มี 404 → รายการไม่มี 404 → ค่าผิด 400 → ลบไม่ได้ 409
 */
@Service
public class ExtraChargeService {

    private final RoomExtraChargeRepository extraChargeRepository;
    private final RoomRepository roomRepository;
    private final LeaseRepository leaseRepository;

    public ExtraChargeService(RoomExtraChargeRepository extraChargeRepository, RoomRepository roomRepository,
            LeaseRepository leaseRepository) {
        this.extraChargeRepository = extraChargeRepository;
        this.roomRepository = roomRepository;
        this.leaseRepository = leaseRepository;
    }

    /** ทุกรายการของทุกห้อง เรียงตามผังตึก ใช้กับแท็บ Extra charges ของหน้า Units */
    @Transactional(readOnly = true)
    public List<ExtraChargeResponse> all() {
        return extraChargeRepository.findAllInLayoutOrder().stream()
                .map(ExtraChargeResponse::of)
                .toList();
    }

    @Transactional(readOnly = true)
    public List<ExtraChargeResponse> ofRoom(Long roomId) {
        if (!roomRepository.existsById(roomId)) {
            throw new NotFoundException("unit", roomId);
        }
        return extraChargeRepository.findByRoomIdOrderByIdAsc(roomId).stream()
                .map(ExtraChargeResponse::of)
                .toList();
    }

    @Transactional
    public ExtraChargeResponse add(Long roomId, ExtraChargeRequest request) {
        Room room = lockRoom(roomId);
        ExtraChargeTerms terms = ExtraChargeRules.parse(request);
        boolean active = request.active() == null || request.active();
        return ExtraChargeResponse.of(extraChargeRepository.saveAndFlush(new RoomExtraCharge(room, terms, active)));
    }

    /**
     * แก้ทั้งก้อน รวมถึงปิดหรือเปิดรายการ (active) สัญญาที่คัดลอกไปแล้วคงชื่อกับยอดตามวันเซ็น
     * มีแค่การปิดเปิดที่มีผลกับบิลใหม่ของทุกสัญญา ดู RoomExtraCharge
     */
    @Transactional
    public ExtraChargeResponse update(Long roomId, Long chargeId, ExtraChargeRequest request) {
        RoomExtraCharge charge = chargeOf(lockRoom(roomId), chargeId);
        ExtraChargeTerms terms = ExtraChargeRules.parse(request);
        charge.update(terms, request.active() == null ? charge.isActive() : request.active());
        return ExtraChargeResponse.of(extraChargeRepository.saveAndFlush(charge));
    }

    /**
     * ลบได้เฉพาะรายการที่ยังไม่เคยเข้าสัญญาใบไหน ถ้าเคยแล้วให้ปิดแทน สัญญาและบิลเก่าต้องอ้างถึงรายการเดิมได้
     * <p>
     * เช็คแค่สัญญาก็ครอบบิลด้วย เพราะบิลคัดลอกจากสำเนาในสัญญาเท่านั้น รายการที่มีบิลจึงมีสำเนาในสัญญาเสมอ
     * ตัวกันจริงคือ foreign key ของ lease_extra_charge กับ receipt_line การเช็คตรงนี้มีไว้ให้ข้อความบอกชื่อรายการได้
     * flush ในเมธอดนี้ให้ foreign key ดังก่อนออกจาก transaction เหตุผลเดียวกับ LeaseService.update
     */
    @Transactional
    public void delete(Long roomId, Long chargeId) {
        RoomExtraCharge charge = chargeOf(lockRoom(roomId), chargeId);
        if (leaseRepository.existsLeaseWithExtraCharge(chargeId)) {
            throw new ConflictException(
                    "\"" + charge.getLabel() + "\" is part of a contract or bill. Deactivate it instead.");
        }
        extraChargeRepository.delete(charge);
        extraChargeRepository.flush();
    }

    private Room lockRoom(Long roomId) {
        return roomRepository.findByIdForUpdate(roomId)
                .orElseThrow(() -> new NotFoundException("unit", roomId));
    }

    /** ข้อความ 404 บอกเลขห้องแบบ backend จำลอง id ของห้องไม่ได้ช่วยให้ผู้ใช้เข้าใจอะไร */
    private RoomExtraCharge chargeOf(Room room, Long chargeId) {
        return extraChargeRepository.findByIdAndRoomId(chargeId, room.getId())
                .orElseThrow(() -> new NotFoundException(
                        "No extra charge with id " + chargeId + " for unit " + room.getRoomNumber()));
    }
}
