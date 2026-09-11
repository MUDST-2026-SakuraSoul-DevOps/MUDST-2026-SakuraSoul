package com.sakurasoul.apartment.lease;

import com.sakurasoul.apartment.apartmentconfig.ApartmentConfig;
import com.sakurasoul.apartment.apartmentconfig.ApartmentConfigRepository;
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

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.List;
import java.util.function.Function;
import java.util.function.Supplier;

@Service
public class LeaseService {

    /** apartment_config มีแถวเดียวเสมอ id ถูกล็อกไว้ด้วย CHECK constraint ใน V3 */
    private static final short CONFIG_ID = 1;

    /**
     * คอลัมน์เงินทุกตัวของ lease เป็น NUMERIC(10,2) ฐานข้อมูลจึงปัดให้เหลือสองตำแหน่ง
     * อยู่แล้ว ถ้าไม่ปัดเองก่อนตอบกลับ คนที่ส่ง 8.005 มาจะได้ response ว่า 8.005
     * แต่พอ GET รอบถัดไปกลับได้ 8.01 ซึ่งดูเหมือนระบบแอบเปลี่ยนค่าให้
     * เหตุผลเดียวกับ RATE_SCALE ใน ApartmentConfigService
     */
    private static final int MONEY_SCALE = 2;

    private final LeaseRepository leaseRepository;
    private final RoomRepository roomRepository;
    private final TenantRepository tenantRepository;
    private final ApartmentConfigRepository apartmentConfigRepository;

    public LeaseService(LeaseRepository leaseRepository, RoomRepository roomRepository,
            TenantRepository tenantRepository, ApartmentConfigRepository apartmentConfigRepository) {
        this.leaseRepository = leaseRepository;
        this.roomRepository = roomRepository;
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
        Room room = roomRepository.findById(request.roomId())
                .orElseThrow(() -> new NotFoundException("unit", request.roomId()));
        Tenant tenant = tenantRepository.findById(request.tenantId())
                .orElseThrow(() -> new NotFoundException("tenant", request.tenantId()));

        if (request.endDate() != null && request.endDate().isBefore(request.startDate())) {
            throw new IllegalArgumentException("The end date cannot be before the start date");
        }

        guardAgainstOverlap(room, request.startDate(), request.endDate(), null);

        Lease lease = new Lease(room, tenant, request.startDate(), request.endDate(),
                request.monthlyRent(), request.billingCycle(), chargesFor(request));
        return LeaseResponse.of(leaseRepository.save(lease));
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
     */
    @Transactional
    public LeaseResponse update(Long id, LeaseRequest request) {
        Lease lease = leaseRepository.findById(id)
                .orElseThrow(() -> new NotFoundException("สัญญา", id));

        // mock ฝั่งหน้าเว็บไม่ได้เขียนกฎข้อนี้ไว้ แต่ปล่อยให้แก้สัญญาที่ปิดไปแล้วไม่ได้
        // เพราะการแก้จะดึงช่วงวันที่ของสัญญาที่ปิดแล้วกลับมากันห้องใหม่ ซึ่งขัดกับ US-06-S1
        // ที่เพิ่งบอกว่าปิดแล้วห้องต้องว่าง ถ้าจะต่อสัญญาให้สร้างใบใหม่แทน
        if (lease.isEnded()) {
            throw new ConflictException("สัญญานี้สิ้นสุดไปแล้ว แก้ไขไม่ได้");
        }

        Room room = lease.getRoom();
        if (!room.getId().equals(request.roomId())) {
            // ตามข้อตกลงใน docs/api-contract-lease.md หัวข้อ "ของที่ยังไม่ได้ตกลง"
            // ยังไม่ได้สรุปว่าการย้ายห้องนับเป็นสัญญาใหม่หรือแก้ของเดิม จึงยังไม่รับไว้ก่อน
            throw new IllegalArgumentException(
                    "ยังย้ายสัญญาไปห้องอื่นไม่ได้ ถ้าผู้เช่าย้ายห้องให้ปิดสัญญาใบนี้แล้วสร้างสัญญาใหม่ของห้องใหม่");
        }

        // เปลี่ยนผู้เช่าได้ ทำตาม mock ที่ประกอบสัญญาใหม่จาก tenantId ที่ส่งมาทุกครั้ง
        // เคสจริงคือกรอกผิดคนตอนเซ็น แล้วมาแก้ทีหลังโดยไม่อยากเสียเลขสัญญาเดิม
        Tenant tenant = tenantRepository.findById(request.tenantId())
                .orElseThrow(() -> new NotFoundException("ผู้เช่า", request.tenantId()));

        if (request.endDate() != null && request.endDate().isBefore(request.startDate())) {
            throw new IllegalArgumentException("วันสิ้นสุดสัญญาต้องไม่มาก่อนวันเริ่มสัญญา");
        }

        guardAgainstOverlap(room, request.startDate(), request.endDate(), lease.getId());

        lease.update(tenant, request.startDate(), request.endDate(), request.monthlyRent(),
                request.billingCycle(), chargesKeeping(lease.getCharges(), request));
        return LeaseResponse.of(leaseRepository.saveAndFlush(lease));
    }

    /**
     * ปิดสัญญาตาม US-06-S1 ห้องจะกลับไปเป็น AVAILABLE เองทันทีโดยไม่ต้องสั่งแยก
     * เพราะสถานะห้องคำนวณจากสัญญา ACTIVE ที่ครอบวันนี้เท่านั้น (ดู Lease.terminate)
     * <p>
     * endDate มาจาก body เสมอ ไม่ได้ตกไปใช้วันนี้เองแบบ mock เพราะจอ Check-out
     * ฝั่งหน้าเว็บบังคับให้เลือกวันอยู่แล้ว (ConfirmCheckOutDialog) การเดาวันให้เงียบ ๆ
     * เวลา body ขาดช่องนี้ไปจะกลายเป็นวันสิ้นสุดสัญญาผิดที่ไม่มีใครทันสังเกต
     */
    @Transactional
    public LeaseResponse terminate(Long id, LocalDate endDate) {
        Lease lease = leaseRepository.findById(id)
                .orElseThrow(() -> new NotFoundException("สัญญา", id));

        if (lease.isEnded()) {
            throw new ConflictException("สัญญานี้สิ้นสุดไปแล้ว");
        }
        if (endDate.isBefore(lease.getStartDate())) {
            throw new IllegalArgumentException("วันสิ้นสุดสัญญาต้องไม่มาก่อนวันเริ่มสัญญา");
        }

        lease.terminate(endDate);
        return LeaseResponse.of(leaseRepository.saveAndFlush(lease));
    }

    /**
     * ประกอบเงินมัดจำกับอัตราสี่ตัวที่จะล็อกติดไปกับสัญญาใบนี้
     * <p>
     * ฟอร์มฝั่งหน้าเว็บส่งมาแค่หกช่องแรก (frontend/src/dialogs/LeaseFormDialog.tsx)
     * ช่องที่ขาดจึงต้องเติมให้ตรงกับที่ดีไซน์ Create Contract บอกไว้ว่าอัตราตั้งต้น
     * มาจาก Apartment Config ส่วนเงินมัดจำไม่มีในตารางนั้นจึงตั้งเป็น 0
     * <p>
     * โหลดแถว config แบบขี้เกียจ เพราะคำขอที่ส่งอัตรามาครบทั้งสี่ตัว (เช่นตอนแอดมิน
     * แก้อัตรารายสัญญา หรือ DevDataSeeder) ไม่ควรต้องยิง query ที่ไม่ได้ใช้
     * <p>
     * ปัดทั้งห้าค่าให้เหลือสองตำแหน่งก่อนเก็บ เพื่อให้ response ตรงกับที่ NUMERIC(10,2)
     * เก็บจริง ดู MONEY_SCALE
     */
    private LeaseCharges chargesFor(LeaseRequest request) {
        // Supplier + memo: อ่านแถว config ครั้งเดียวต่อคำขอ ถึงจะขาดหลายช่องก็ตาม
        Supplier<ApartmentConfig> config = lazyConfig();

        return new LeaseCharges(
                round(request.securityDeposit() != null ? request.securityDeposit() : BigDecimal.ZERO),
                rate(request.electricRatePerUnit(), config, ApartmentConfig::getElectricRatePerUnit),
                rate(request.waterRatePerUnit(), config, ApartmentConfig::getWaterRatePerUnit),
                rate(request.commonAreaFee(), config, ApartmentConfig::getCommonAreaFee),
                rate(request.internetFee(), config, ApartmentConfig::getInternetFee));
    }

    /**
     * ประกอบเงินมัดจำกับอัตราสี่ตัวตอน "แก้" สัญญา ช่องไหนไม่ส่งมาให้คงค่าที่ล็อกไว้เดิม
     * <p>
     * ต่างจาก chargesFor() ที่ใช้ตอนสร้าง ตรงที่ห้ามไปอ่าน apartment_config ใหม่
     * เพราะอัตราชุดนั้นถูกล็อกไว้ตั้งแต่วันเซ็นแล้ว (US-16-S3 กับ LeaseCharges) ถ้าแก้แค่
     * ค่าเช่าแล้วอัตราค่าไฟกระโดดไปตามอัตราปัจจุบันของตึก เท่ากับสัญญาถูกเปลี่ยนเงื่อนไข
     * ย้อนหลังโดยที่แอดมินไม่ได้สั่ง ส่วนช่องที่ส่งมาถือว่าตั้งใจแก้ ใช้ค่าที่ส่งมาทับ
     */
    private static LeaseCharges chargesKeeping(LeaseCharges locked, LeaseRequest request) {
        return new LeaseCharges(
                keepUnlessGiven(request.securityDeposit(), locked.getSecurityDeposit()),
                keepUnlessGiven(request.electricRatePerUnit(), locked.getElectricRatePerUnit()),
                keepUnlessGiven(request.waterRatePerUnit(), locked.getWaterRatePerUnit()),
                keepUnlessGiven(request.commonAreaFee(), locked.getCommonAreaFee()),
                keepUnlessGiven(request.internetFee(), locked.getInternetFee()));
    }

    /** ส่งมาใช้ค่าที่ส่งมา (ปัดสองตำแหน่ง) ไม่ส่งมาใช้ค่าที่ล็อกไว้กับสัญญาใบนี้อยู่แล้ว */
    private static BigDecimal keepUnlessGiven(BigDecimal given, BigDecimal locked) {
        return given != null ? round(given) : locked;
    }

    /** ส่งมาเองใช้ค่านั้น ไม่ส่งมาค่อยไปอ่านจาก apartment_config */
    private static BigDecimal rate(BigDecimal given, Supplier<ApartmentConfig> config,
            Function<ApartmentConfig, BigDecimal> column) {
        return round(given != null ? given : column.apply(config.get()));
    }

    /**
     * แถวเดียวของ apartment_config ถูกใส่ไว้ตั้งแต่ migration V3 ถ้าหาไม่เจอแปลว่า
     * migration ไม่ได้รันหรือมีคนลบทิ้ง ซึ่งควรดังออกมาให้เห็น ไม่ใช่เงียบแล้วเดาอัตราเอง
     * ข้อความเดียวกับที่ ApartmentConfigService ใช้ จะได้ไล่เหตุเดียวกันเจอ
     */
    private Supplier<ApartmentConfig> lazyConfig() {
        return new Supplier<>() {
            private ApartmentConfig loaded;

            @Override
            public ApartmentConfig get() {
                if (loaded == null) {
                    loaded = apartmentConfigRepository.findById(CONFIG_ID)
                            .orElseThrow(() -> new NotFoundException(
                                    "No apartment config in the database. Check that migration V3 has run"));
                }
                return loaded;
            }
        };
    }

    /** ปัดให้ตรงกับที่ NUMERIC(10,2) เก็บจริง ดูเหตุผลที่ MONEY_SCALE */
    private static BigDecimal round(BigDecimal value) {
        return value.setScale(MONEY_SCALE, RoundingMode.HALF_UP);
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
