package com.sakurasoul.apartment.tenant;

import com.sakurasoul.apartment.tenant.TenantDtos.CreateTenantRequest;
import com.sakurasoul.apartment.tenant.TenantDtos.TenantResponse;
import com.sakurasoul.apartment.tenant.TenantDtos.TenantSearchResponse;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
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

    /**
     * ค้นชื่อผู้เช่าแบบยอมให้พิมพ์ผิด (SSK-174) เรียงจากตรงที่สุด ไม่เกิน 20 คน
     * <p>
     * path ตรงตัว "/search" ชนะ "/{id}" เสมอใน Spring MVC ไม่ว่าจะประกาศก่อนหรือหลัง ที่วางไว้ตรงนี้เพื่อให้อ่านง่าย
     * ก่อนมี endpoint นี้ คำขอไปตก "/{id}" แล้วได้ 400 เพราะ "search" แปลงเป็นเลขไม่ได้ ไม่ส่ง q มาได้ลิสต์ว่างเหมือน backend จำลอง
     */
    @GetMapping("/search")
    public List<TenantSearchResponse> search(@RequestParam(defaultValue = "") String q) {
        return tenantService.search(q);
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
