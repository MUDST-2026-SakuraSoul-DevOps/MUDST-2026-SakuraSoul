package com.sakurasoul.apartment.tenant;

import com.sakurasoul.apartment.common.ConflictException;
import com.sakurasoul.apartment.common.NotFoundException;
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

    public TenantService(TenantRepository tenantRepository) {
        this.tenantRepository = tenantRepository;
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
                .orElseThrow(() -> new NotFoundException("ผู้เช่า", id));
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
            throw new IllegalArgumentException("รูปแบบอีเมลไม่ถูกต้อง");
        }

        // เช็คก่อนเพื่อให้ได้ข้อความที่อ่านรู้เรื่อง ส่วนเคสที่สองคำขอเข้ามาพร้อมกันจนผ่าน
        // ตรงนี้ทั้งคู่ จะไปโดน tenant_national_id_uk แล้ว ApiExceptionHandler แปลงเป็น
        // 409 ข้อความเดียวกัน ผู้ใช้จึงเห็นประโยคเดียวกันไม่ว่าจะแพ้เส้นทางไหน
        if (nationalId != null && tenantRepository.existsByNationalId(nationalId)) {
            throw new ConflictException("มีผู้เช่าที่ใช้เลขบัตรประชาชนนี้อยู่แล้ว");
        }

        Tenant tenant = new Tenant(fullName, nationalId, lineId, phone, email);
        return TenantResponse.of(tenantRepository.save(tenant));
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
