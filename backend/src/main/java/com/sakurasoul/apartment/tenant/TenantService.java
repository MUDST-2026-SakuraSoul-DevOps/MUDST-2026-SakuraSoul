package com.sakurasoul.apartment.tenant;

import com.sakurasoul.apartment.common.ConflictException;
import com.sakurasoul.apartment.common.NotFoundException;
import com.sakurasoul.apartment.lease.LeaseRepository;
import com.sakurasoul.apartment.tenant.TenantDtos.CreateTenantRequest;
import com.sakurasoul.apartment.tenant.TenantDtos.TenantResponse;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.regex.Pattern;

@Service
public class TenantService {

    /**
     * เกณฑ์เดียวกับ EMAIL_SHAPE ใน frontend/src/domain/tenant.ts คือมี @ คั่นและมีจุด
     * ในส่วนโดเมน ไม่ได้ตรวจตาม RFC เต็มรูปแบบ เพราะ regex ที่ตรงสเปกจริงยาวหลายร้อย
     * ตัวอักษรและยังปฏิเสธอีเมลที่ใช้ได้จริง ตัวตัดสินสุดท้ายคือการส่งเมลออกไปจริง
     * <p>
     * ที่เช็คตรงนี้แทนที่จะเป็น @Pattern บน DTO เพราะช่องนี้ไม่บังคับ ฟอร์มส่งค่าว่างมา
     * เป็นสตริงว่างไม่ใช่ null ถ้าดักด้วย @Pattern สตริงว่างจะไม่ผ่านทันที ดูคำอธิบายเต็ม
     * ใน TenantDtos
     */
    private static final Pattern EMAIL_SHAPE = Pattern.compile("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$");

    private final TenantRepository tenantRepository;
    private final LeaseRepository leaseRepository;

    public TenantService(TenantRepository tenantRepository, LeaseRepository leaseRepository) {
        this.tenantRepository = tenantRepository;
        this.leaseRepository = leaseRepository;
    }

    @Transactional(readOnly = true)
    public List<TenantResponse> list() {
        return tenantRepository.findAllByOrderByFullNameAsc().stream()
                .map(TenantResponse::of)
                .toList();
    }

    @Transactional(readOnly = true)
    public TenantResponse get(Long id) {
        return tenantRepository.findById(id)
                .map(TenantResponse::of)
                .orElseThrow(() -> new NotFoundException("tenant", id));
    }

    /**
     * ตัดช่องว่างหัวท้ายทุกช่องก่อนบันทึก เพราะช่องว่างที่ติดมากับการก๊อปวางทำให้เลขบัตร
     * ใบเดียวกันกลายเป็นคนละค่าในสายตา constraint กันซ้ำ แล้วผู้เช่าคนเดิมถูกเพิ่มซ้ำได้
     */
    @Transactional
    public TenantResponse create(CreateTenantRequest request) {
        String fullName = trimToNull(request.fullName());
        String nationalId = trimToNull(request.nationalId());
        String lineId = trimToNull(request.lineId());
        String phone = trimToNull(request.phone());
        String email = trimToNull(request.email());

        if (email != null && !EMAIL_SHAPE.matcher(email).matches()) {
            throw new IllegalArgumentException("That email address is not valid");
        }

        // เช็คก่อนเพื่อให้ได้ข้อความที่อ่านรู้เรื่อง ส่วนเคสที่สองคำขอเข้ามาพร้อมกันจนผ่าน
        // ตรงนี้ทั้งคู่ จะไปโดน tenant_national_id_uk แล้ว ApiExceptionHandler แปลงเป็น
        // 409 ข้อความเดียวกัน ผู้ใช้จึงเห็นประโยคเดียวกันไม่ว่าจะแพ้เส้นทางไหน
        if (nationalId != null && tenantRepository.existsByNationalId(nationalId)) {
            throw new ConflictException("A tenant with this national ID already exists");
        }

        Tenant tenant = new Tenant(fullName, nationalId, lineId, phone, email);
        return TenantResponse.of(tenantRepository.save(tenant));
    }

    /**
     * แก้ข้อมูลผู้เช่า กฎเหมือนตอนเพิ่มทุกข้อ เลขบัตรที่แก้ไปซ้ำกับผู้เช่าคนอื่นตอบ 409
     * ส่วนเลขเดิมของตัวเองไม่นับว่าซ้ำ ไม่งั้นแก้แค่เบอร์โทรก็จะโดนปฏิเสธ
     * <p>
     * เคสสองคำขอแก้พร้อมกันจนเลขบัตรชนกัน ไปโดน tenant_national_id_uk แล้วได้ 409 เหมือนเดิม
     */
    @Transactional
    public TenantResponse update(Long id, CreateTenantRequest request) {
        Tenant tenant = tenantRepository.findById(id)
                .orElseThrow(() -> new NotFoundException("tenant", id));

        String nationalId = trimToNull(request.nationalId());
        String email = trimToNull(request.email());
        if (email != null && !EMAIL_SHAPE.matcher(email).matches()) {
            throw new IllegalArgumentException("That email address is not valid");
        }
        if (nationalId != null && !nationalId.equals(tenant.getNationalId())
                && tenantRepository.existsByNationalId(nationalId)) {
            throw new ConflictException("A tenant with this national ID already exists");
        }

        tenant.setFullName(trimToNull(request.fullName()));
        tenant.setNationalId(nationalId);
        tenant.setLineId(trimToNull(request.lineId()));
        tenant.setPhone(trimToNull(request.phone()));
        tenant.setEmail(email);
        // flush ตรงนี้ให้ constraint เลขบัตรซ้ำโยนออกมาในเมธอดนี้ แปลงเป็น 409 ได้ครบเส้นทาง
        return TenantResponse.of(tenantRepository.saveAndFlush(tenant));
    }

    /**
     * ลบผู้เช่าได้เฉพาะคนที่ไม่เคยมีสัญญาเลย ไม่ว่าสัญญาจะยัง active หรือปิดไปแล้ว
     * <p>
     * ประวัติสัญญาเป็นข้อมูลที่หอพักต้องเก็บ (docs/api-contract-lease.md) และสัญญามี
     * foreign key มาที่ผู้เช่า ถ้าปล่อยลบจะโดน constraint กลายเป็น error ที่อ่านไม่รู้เรื่อง
     * จึงเช็คก่อนแล้วบอกให้ชัดว่าทำไมลบไม่ได้
     */
    @Transactional
    public void delete(Long id) {
        Tenant tenant = tenantRepository.findById(id)
                .orElseThrow(() -> new NotFoundException("tenant", id));
        if (leaseRepository.existsByTenantId(id)) {
            throw new ConflictException(
                    "This tenant has lease history and cannot be deleted. End the lease instead.");
        }
        tenantRepository.delete(tenant);
    }

    /** ช่องที่กรอกมาเป็นช่องว่างล้วนถือว่าไม่ได้กรอก อีเมลจึงลงฐานเป็น null ไม่ใช่ "" */
    private static String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
