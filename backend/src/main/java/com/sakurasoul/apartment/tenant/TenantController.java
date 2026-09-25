package com.sakurasoul.apartment.tenant;

import com.sakurasoul.apartment.tenant.TenantDtos.CreateTenantRequest;
import com.sakurasoul.apartment.tenant.TenantDtos.TenantResponse;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/tenants")
public class TenantController {

    private final TenantService tenantService;

    public TenantController(TenantService tenantService) {
        this.tenantService = tenantService;
    }

    @GetMapping
    public List<TenantResponse> list() {
        return tenantService.list();
    }

    @GetMapping("/{id}")
    public TenantResponse get(@PathVariable Long id) {
        return tenantService.get(id);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public TenantResponse create(@Valid @RequestBody CreateTenantRequest request) {
        return tenantService.create(request);
    }

    /**
     * แก้ข้อมูลผู้เช่าทั้งก้อน ใช้ body และกฎชุดเดียวกับตอนเพิ่ม (Edit Tenant Information)
     * <p>
     * ฟอร์มหน้าเว็บส่งช่องอื่นติดมาด้วย เช่น startDate/endDate/roomType ซึ่งเป็นของสัญญา
     * ไม่ใช่ของผู้เช่า Jackson ปล่อยผ่านช่องที่ไม่รู้จักอยู่แล้ว จึงไม่ถูกบันทึกที่นี่
     */
    @PutMapping("/{id}")
    public TenantResponse update(@PathVariable Long id, @Valid @RequestBody CreateTenantRequest request) {
        return tenantService.update(id, request);
    }

    /** ลบได้เฉพาะผู้เช่าที่ไม่เคยมีสัญญา ถ้ามีตอบ 409 ตอบ 204 เมื่อลบสำเร็จ */
    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable Long id) {
        tenantService.delete(id);
    }
}
