package com.sakurasoul.apartment.lease;

import com.sakurasoul.apartment.apartmentconfig.ApartmentConfig;
import com.sakurasoul.apartment.apartmentconfig.ApartmentConfigRepository;
import com.sakurasoul.apartment.common.ConflictException;
import com.sakurasoul.apartment.common.Money;
import com.sakurasoul.apartment.common.NotFoundException;
import com.sakurasoul.apartment.extracharge.RoomExtraChargeRepository;
import com.sakurasoul.apartment.lease.LeaseDtos.LeaseRequest;
import com.sakurasoul.apartment.lease.LeaseDtos.LeaseResponse;
import com.sakurasoul.apartment.room.Room;
import com.sakurasoul.apartment.room.RoomRepository;
import com.sakurasoul.apartment.room.RoomTypeRate;
import com.sakurasoul.apartment.room.RoomTypeRateRepository;
import com.sakurasoul.apartment.roomrate.RoomRateRepository;
import com.sakurasoul.apartment.tenant.Tenant;
import com.sakurasoul.apartment.tenant.TenantRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.List;
import java.util.function.Function;

@Service
public class LeaseService {

    /** apartment_config มีแถวเดียวเสมอ id ถูกล็อกไว้ด้วย CHECK constraint ใน V3 */
    private static final short CONFIG_ID = 1;

    /**
     * ท้ายข้อความ 409 ของเงื่อนไขการเงินที่ล็อกไว้ (SSK-180) หน้าเว็บเอา detail ไปโชว์ทั้งประโยค
     * ชื่อช่องข้างหน้าใช้คำเดียวกับข้อความ @PositiveOrZero ใน LeaseDtos
     */
    private static final String LOCKED_TERM =
            " is locked into this lease and cannot be changed. End this lease and create a new one with the new terms";

    private final LeaseRepository leaseRepository;
    private final RoomRepository roomRepository;
    private final RoomTypeRateRepository roomTypeRateRepository;
    private final RoomRateRepository roomRateRepository;
    private final RoomExtraChargeRepository extraChargeRepository;
    private final TenantRepository tenantRepository;
    private final ApartmentConfigRepository apartmentConfigRepository;

    public LeaseService(LeaseRepository leaseRepository, RoomRepository roomRepository,
            RoomTypeRateRepository roomTypeRateRepository, RoomRateRepository roomRateRepository,
            RoomExtraChargeRepository extraChargeRepository, TenantRepository tenantRepository,
            ApartmentConfigRepository apartmentConfigRepository) {
        this.leaseRepository = leaseRepository;
        this.roomRepository = roomRepository;
        this.roomTypeRateRepository = roomTypeRateRepository;
        this.roomRateRepository = roomRateRepository;
        this.extraChargeRepository = extraChargeRepository;
        this.tenantRepository = tenantRepository;
        this.apartmentConfigRepository = apartmentConfigRepository;
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
        // ล็อกแถวห้องก่อนตรวจทับซ้อน ให้คำขอที่แตะห้องเดียวกันเข้าทำงานทีละคำขอ (ดูเหตุผลที่ RoomRepository.findByIdForUpdate)
        // ไม่ล็อกแล้วสองคำขอพร้อมกันอาจชนกันที่ exclusion constraint จนเป็น deadlock แล้วได้ 500 แทน 409
        Room room = roomRepository.findByIdForUpdate(request.roomId())
                .orElseThrow(() -> new NotFoundException("unit", request.roomId()));
        Tenant tenant = tenantRepository.findById(request.tenantId())
                .orElseThrow(() -> new NotFoundException("tenant", request.tenantId()));

        if (request.endDate() != null && request.endDate().isBefore(request.startDate())) {
            throw new IllegalArgumentException("The end date cannot be before the start date");
        }

        guardAgainstOverlap(room, request.startDate(), request.endDate(), null);

        // อ่านทุกครั้ง ถึงห้องจะมีอัตราเฉพาะก็ตาม เพราะดอกเบี้ยค้างชำระกับวันผ่อนผันมาจากแถวนี้ที่เดียว (SSK-164)
        ApartmentConfig config = loadConfig();
        // ค่าที่ได้จะถูกล็อกไว้ในสัญญาใบนี้ตลอดไป แก้อัตราทีหลังไม่กระทบใบที่เซ็นแล้ว ดู termsFor
        SignedTerms terms = termsFor(room, request, config);
        Lease lease = new Lease(room, tenant, request.startDate(), request.endDate(),
                terms.monthlyRent(), request.billingCycle(), terms.charges());
        // ค่าใช้จ่ายพิเศษที่ห้องเปิดใช้อยู่เข้าสัญญาด้วย (SSK-165) ห้องถูกล็อกไว้ข้างบนแล้ว
        // การเพิ่ม แก้ หรือลบรายการของห้องนี้จึงรอจนสัญญาใบนี้บันทึกเสร็จ ดู ExtraChargeService
        lease.agreeExtraCharges(extraChargeRepository.findByRoomIdOrderByIdAsc(room.getId()));
        // ล็อกไว้เหมือนอัตราน้ำไฟ ตั้งดอกเบี้ยใหม่ทีหลังไม่กระทบสัญญาใบนี้ และสัญญาไม่มีช่องให้ส่งสองค่านี้มาเอง
        lease.agreeLateTerms(LeaseLateTerms.of(config.getLateInterestPercentPerMonth(), config.getGraceDays()));
        return LeaseResponse.of(leaseRepository.save(lease));
    }

    /** ค่าเช่ากับเงินมัดจำและอัตราสี่ตัวที่สัญญาใบใหม่จะล็อกไว้ */
    private record SignedTerms(BigDecimal monthlyRent, LeaseCharges charges) {
    }

    /**
     * ค่าเงินของสัญญาใบใหม่ ไม่มีช่องไหนที่แอดมินตั้งเองได้ยกเว้นเงินมัดจำ
     * <ul>
     *   <li><b>ห้องมีอัตราเฉพาะที่มีผลในเดือนเริ่มสัญญา (SSK-162)</b> ค่าเช่ากับอัตราสี่ตัวมาจากแถวนั้นทั้งห้าตัว
     *       ค่าที่ส่งมาในคำขอถูกเมิน ทีมตัดสินวันที่ 10 พ.ย. 2569 เพราะฟอร์มสร้างสัญญาส่งอัตราของ Apartment Config
     *       มาทุกครั้ง ถ้าให้คำขอชนะ อัตราน้ำไฟของห้องจะไม่เคยถูกใช้เลย</li>
     *   <li><b>ไม่มี</b> ค่าเช่าตามชนิดห้อง (V12 / SSK-127 ตาม feedback อาจารย์ ข้อ 5) ส่วนอัตราสี่ตัวใช้ที่ส่งมา
     *       ช่องที่ไม่ส่งมาใช้ของ apartment_config ดู chargesFor</li>
     * </ul>
     * ใช้เดือนของ startDate ไม่ใช่เดือนที่กดสร้าง สัญญาที่เซ็นล่วงหน้าให้เดือนหน้าจึงได้อัตราของเดือนหน้า
     * monthlyRent ในคำขอไม่เคยถูกใช้ทั้งสองทาง
     */
    private SignedTerms termsFor(Room room, LeaseRequest request, ApartmentConfig config) {
        BigDecimal deposit = round(request.securityDeposit() != null ? request.securityDeposit() : BigDecimal.ZERO);
        return roomRateRepository.inEffect(room.getId(), YearMonth.from(request.startDate()))
                .map(rate -> new SignedTerms(rate.getMonthlyRent(), new LeaseCharges(deposit,
                        rate.getElectricRatePerUnit(), rate.getWaterRatePerUnit(),
                        rate.getCommonAreaFee(), rate.getInternetFee())))
                .orElseGet(() -> new SignedTerms(rentForRoomType(room), chargesFor(request, deposit, config)));
    }

    /**
     * แก้สัญญาทั้งก้อนตาม US-06 body เดียวกับตอนสร้างเป๊ะ ๆ เพราะฟอร์มฝั่งหน้าเว็บ
     * ใช้ตัวเดียวกันทั้งสร้างและแก้ (frontend/src/dialogs/LeaseFormDialog.tsx)
     * <p>
     * ลำดับการตรวจตั้งใจให้เหมือน backend จำลองฝั่งหน้าเว็บ (mockApi.ts) คือหาสัญญาก่อน
     * แล้วค่อยตรวจเนื้อใน เพื่อให้ id มั่วได้ 404 ไม่ใช่ 400 ที่บอกคนละเรื่อง
     * <p>
     * ใช้ saveAndFlush ไม่ใช่ save เพื่อให้ exclusion constraint ดังตั้งแต่ยังอยู่ในเมธอดนี้
     * ถ้าปล่อยให้ไป flush ตอน commit ข้างนอก transaction แล้ว DataIntegrityViolationException
     * จะโผล่หลังจาก handler ทำงานไปแล้ว คนเรียกจะได้ 500 แทนที่จะเป็น 409 ที่ตกลงกันไว้
     * <p>
     * ตั้งแต่ SSK-180 แก้เงื่อนไขการเงินของสัญญาไม่ได้แล้ว (เงินมัดจำ อัตราสี่ตัว รอบบิล) ส่งค่าใหม่มาได้ 409
     * ดู assertFinancialTermsUnchanged ส่วนผู้เช่ากับช่วงวันที่ยังแก้ได้ตาม US-06
     */
    @Transactional
    public LeaseResponse update(Long id, LeaseRequest request) {
        Lease lease = leaseRepository.findById(id)
                .orElseThrow(() -> new NotFoundException("lease", id));

        // mock ฝั่งหน้าเว็บไม่ได้เขียนกฎข้อนี้ไว้ แต่ปล่อยให้แก้สัญญาที่ปิดไปแล้วไม่ได้
        // เพราะการแก้จะดึงช่วงวันที่ของสัญญาที่ปิดแล้วกลับมากันห้องใหม่ ซึ่งขัดกับ US-06-S1
        // ที่เพิ่งบอกว่าปิดแล้วห้องต้องว่าง ถ้าจะต่อสัญญาให้สร้างใบใหม่แทน
        if (lease.isEnded()) {
            throw new ConflictException("This lease has already ended and can no longer be edited");
        }

        Room room = lease.getRoom();
        if (!room.getId().equals(request.roomId())) {
            // ตามข้อตกลงใน docs/api-contract-lease.md หัวข้อ "ของที่ยังไม่ได้ตกลง"
            // ยังไม่ได้สรุปว่าการย้ายห้องนับเป็นสัญญาใหม่หรือแก้ของเดิม จึงยังไม่รับไว้ก่อน
            throw new IllegalArgumentException(
                    "A lease cannot be moved to another unit yet. End this lease and create a new one for the new unit");
        }

        // เปลี่ยนผู้เช่าได้ ทำตาม mock ที่ประกอบสัญญาใหม่จาก tenantId ที่ส่งมาทุกครั้ง
        // เคสจริงคือกรอกผิดคนตอนเซ็น แล้วมาแก้ทีหลังโดยไม่อยากเสียเลขสัญญาเดิม
        Tenant tenant = tenantRepository.findById(request.tenantId())
                .orElseThrow(() -> new NotFoundException("tenant", request.tenantId()));

        if (request.endDate() != null && request.endDate().isBefore(request.startDate())) {
            throw new IllegalArgumentException("The end date cannot be before the start date");
        }

        assertFinancialTermsUnchanged(lease, request);

        // แก้สัญญาก็ล็อกห้องเหมือนตอนสร้าง ไม่งั้นการแก้ช่วงวันที่ชนกับการสร้างสัญญาใหม่ของห้องเดียวกันได้
        roomRepository.findByIdForUpdate(room.getId());
        guardAgainstOverlap(room, request.startDate(), request.endDate(), lease.getId());

        // ไม่มีพารามิเตอร์ค่าเงินให้ส่งเลย ค่าเช่าตั้งแต่ V12 ส่วนมัดจำ อัตรา และรอบบิลตั้งแต่ SSK-180
        // ค่าที่ล็อกไว้ตอนเซ็นจึงอยู่เฉย ๆ ของมันเอง ดู Lease.update
        lease.update(tenant, request.startDate(), request.endDate());
        return LeaseResponse.of(leaseRepository.saveAndFlush(lease));
    }

    /**
     * ปิดสัญญาตาม US-06-S1 ห้องจะกลับไปเป็น AVAILABLE เองทันทีโดยไม่ต้องสั่งแยก
     * เพราะสถานะห้องคำนวณจากสัญญา ACTIVE ที่ครอบวันนี้เท่านั้น (ดู Lease.terminate)
     * <p>
     * endDate มาจาก body เสมอ ไม่ได้ตกไปใช้วันนี้เองแบบ mock เพราะหน้าเว็บส่งวันที่มาเสมอ
     * (ป็อปอัป Check Out ใน RoomDialog) การเดาวันให้เงียบ ๆ
     * เวลา body ขาดช่องนี้ไปจะกลายเป็นวันสิ้นสุดสัญญาผิดที่ไม่มีใครทันสังเกต
     */
    @Transactional
    public LeaseResponse terminate(Long id, LocalDate endDate) {
        Lease lease = leaseRepository.findById(id)
                .orElseThrow(() -> new NotFoundException("lease", id));

        if (lease.isEnded()) {
            throw new ConflictException("This lease has already ended");
        }
        if (endDate.isBefore(lease.getStartDate())) {
            throw new IllegalArgumentException("The end date cannot be before the start date");
        }

        lease.terminate(endDate);
        return LeaseResponse.of(leaseRepository.saveAndFlush(lease));
    }

    /**
     * ค่าเช่าของห้องนี้ตามชนิดห้อง (V12 / SSK-127)
     * <p>
     * หาไม่เจอแปลว่า migration กับ enum ไม่ตรงกัน เป็นบั๊กของเราเอง ไม่ใช่ข้อมูลผู้ใช้ผิด
     * จึงเป็น IllegalStateException ไม่ใช่ IllegalArgumentException ที่จะกลายเป็น 400
     */
    private BigDecimal rentForRoomType(Room room) {
        return roomTypeRateRepository.findById(room.getRoomType())
                .map(RoomTypeRate::getMonthlyRent)
                .orElseThrow(() -> new IllegalStateException(
                        "ไม่มีค่าเช่าของชนิดห้อง " + room.getRoomType() + " ในตาราง room_type"));
    }

    /**
     * อัตราสี่ตัวของห้องที่ไม่มีอัตราเฉพาะ ประกอบกับเงินมัดจำที่ส่งมา
     * <p>
     * ฟอร์มฝั่งหน้าเว็บส่งมาแค่หกช่องแรก (frontend/src/dialogs/LeaseFormDialog.tsx)
     * ช่องที่ขาดจึงต้องเติมให้ตรงกับที่ดีไซน์ Create Contract บอกไว้ว่าอัตราตั้งต้น
     * มาจาก Apartment Config ส่วนเงินมัดจำไม่มีในตารางนั้นจึงตั้งเป็น 0 (ดู termsFor)
     * <p>
     * ใช้ตอนสร้างเท่านั้น ตอนแก้สัญญาค่าพวกนี้ล็อกไว้แล้ว (SSK-180 ดู assertFinancialTermsUnchanged)
     * <p>
     * ปัดทั้งห้าค่าให้เหลือสองตำแหน่งก่อนเก็บ เพื่อให้ response ตรงกับที่ NUMERIC(10,2)
     * เก็บจริง ดู {@link Money}
     */
    private static LeaseCharges chargesFor(LeaseRequest request, BigDecimal deposit, ApartmentConfig config) {
        return new LeaseCharges(
                deposit,
                rate(request.electricRatePerUnit(), config, ApartmentConfig::getElectricRatePerUnit),
                rate(request.waterRatePerUnit(), config, ApartmentConfig::getWaterRatePerUnit),
                rate(request.commonAreaFee(), config, ApartmentConfig::getCommonAreaFee),
                rate(request.internetFee(), config, ApartmentConfig::getInternetFee));
    }

    /**
     * เงื่อนไขการเงินของสัญญาล็อกไว้ตั้งแต่วันเซ็น ส่งค่าใหม่มาตอนแก้ได้ 409 (SSK-180)
     * <p>
     * ทีมตกลงไว้วันที่ 7 พ.ย. 2569 ว่าไม่ทำ amendment ใน Phase 2 ถ้าจะเปลี่ยนเงินมัดจำ อัตรา หรือรอบบิล ให้ปิดสัญญา
     * แล้วทำใบใหม่ ข้อความ 409 จึงบอกทางนั้นตรง ๆ รอบบิลอยู่ในชุดนี้ด้วยเพราะตารางล็อกในการ์ด SSK-180
     * จัดไว้แถวเดียวกับค่าเงิน (เปลี่ยนรายเดือนเป็นรายปีกลางสัญญาคือการเปลี่ยนวิธีเก็บเงิน)
     * <p>
     * เทียบค่าหลังปัดสองตำแหน่ง ไม่ใช่แค่ดูว่าส่งมาหรือเปล่า เพราะฟอร์มแก้สัญญาฝั่งหน้าเว็บส่งอัตราน้ำไฟเดิม
     * กลับมาทุกครั้ง (ContractFormDialog) ส่งค่าเดิมมาจึงผ่าน ช่องที่ไม่ส่งมาก็ถือว่าคงค่าเดิมเหมือนก่อน SSK-180
     */
    private static void assertFinancialTermsUnchanged(Lease lease, LeaseRequest request) {
        LeaseCharges locked = lease.getCharges();
        rejectIfChanged("Security deposit", request.securityDeposit(), locked.getSecurityDeposit());
        rejectIfChanged("Electricity rate per unit", request.electricRatePerUnit(), locked.getElectricRatePerUnit());
        rejectIfChanged("Water rate per unit", request.waterRatePerUnit(), locked.getWaterRatePerUnit());
        rejectIfChanged("Common area fee", request.commonAreaFee(), locked.getCommonAreaFee());
        rejectIfChanged("Internet fee", request.internetFee(), locked.getInternetFee());
        if (request.billingCycle() != null && request.billingCycle() != lease.getBillingCycle()) {
            throw new ConflictException("Billing cycle" + LOCKED_TERM);
        }
    }

    private static void rejectIfChanged(String label, BigDecimal given, BigDecimal locked) {
        if (given != null && round(given).compareTo(locked) != 0) {
            throw new ConflictException(label + LOCKED_TERM);
        }
    }

    /** ส่งมาเองใช้ค่านั้น ไม่ส่งมาใช้ของ apartment_config */
    private static BigDecimal rate(BigDecimal given, ApartmentConfig config,
            Function<ApartmentConfig, BigDecimal> column) {
        return round(given != null ? given : column.apply(config));
    }

    /**
     * แถวเดียวของ apartment_config ถูกใส่ไว้ตั้งแต่ migration V3 ถ้าหาไม่เจอแปลว่า
     * migration ไม่ได้รันหรือมีคนลบทิ้ง ซึ่งควรดังออกมาให้เห็น ไม่ใช่เงียบแล้วเดาอัตราเอง
     * ข้อความเดียวกับที่ ApartmentConfigService ใช้ จะได้ไล่เหตุเดียวกันเจอ
     */
    private ApartmentConfig loadConfig() {
        return apartmentConfigRepository.findById(CONFIG_ID)
                .orElseThrow(() -> new NotFoundException(
                        "No apartment config in the database. Check that migration V3 has run"));
    }

    /** ปัดให้ตรงกับที่ NUMERIC(10,2) เก็บจริง ดูเหตุผลที่ {@link Money} */
    private static BigDecimal round(BigDecimal value) {
        return Money.round(value);
    }

    /**
     * เช็คว่าช่วงวันที่ที่ขอมาไปทับสัญญา active ใบไหนของห้องนี้หรือเปล่า
     * <p>
     * ตรงนี้ไม่ใช่ตัวกันปล่อยเช่าซ้อน ตัวกันจริงคือ constraint lease_no_overlap ใน V4
     * ที่มีขั้นนี้เพราะ US-05-S1 ขอให้ "แสดงข้อความบอกชัดเจนว่าห้องไม่ว่างในช่วงวันที่ใด"
     * ซึ่ง error ที่หลุดมาจาก database บอกไม่ได้ว่าไปชนกับสัญญาของใคร
     * <p>
     * ignoreLeaseId คือใบที่กำลังแก้อยู่ ต้องตัดตัวเองออกก่อนเทียบ ไม่งั้นกดบันทึกโดยไม่
     * เปลี่ยนวันที่จะฟ้องว่าชนกับตัวเอง ตอนสร้างยังไม่มีใบให้ตัดจึงส่ง null มา
     * (กฎเดียวกับ findConflictingLease ใน frontend/src/domain/lease.ts)
     */
    private void guardAgainstOverlap(Room room, LocalDate startDate, LocalDate endDate, Long ignoreLeaseId) {
        leaseRepository.findByRoomIdAndStatus(room.getId(), LeaseStatus.ACTIVE).stream()
                .filter(existing -> ignoreLeaseId == null || !ignoreLeaseId.equals(existing.getId()))
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
        // สัญญาที่ยังไม่กำหนดวันจบ ใช้คำว่า no end date แทนวันที่
        // ตรงกับ overlapMessage ใน frontend/src/domain/lease.ts ที่หน้าเว็บใช้เอง
        String until = conflict.getEndDate() == null ? "no end date" : conflict.getEndDate().toString();
        return "Unit " + room.getRoomNumber() + " is not available from " + conflict.getStartDate()
                + " to " + until + " because " + conflict.getTenant().getFullName()
                + " already has a lease for it";
    }
}
