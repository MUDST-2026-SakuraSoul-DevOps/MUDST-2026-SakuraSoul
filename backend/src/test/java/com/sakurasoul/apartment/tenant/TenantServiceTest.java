package com.sakurasoul.apartment.tenant;

import com.sakurasoul.apartment.common.ConflictException;
import com.sakurasoul.apartment.common.NotFoundException;
import com.sakurasoul.apartment.tenant.TenantDtos.CreateTenantRequest;
import com.sakurasoul.apartment.tenant.TenantDtos.TenantResponse;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * เทสของ US-03 "เพิ่มข้อมูลผู้เช่า" (SSK-9) ชั้นที่ไม่แตะ database
 * <p>
 * ปลอม repository ทั้งหมด จึงพิสูจน์ได้แค่กฎที่เขียนไว้ใน service คือการตัดช่องว่าง
 * การแปลงอีเมลว่างเป็น null และข้อความที่โยนออกมาตอนเลขบัตรซ้ำ ส่วนตัวกันเลขบัตรซ้ำ
 * ของจริงคือ constraint tenant_national_id_uk ใน V6 ซึ่งพิสูจน์ที่ TenantApiTest แทน
 * เพราะ repository ปลอมไม่มีทางจับเคสสองคำขอที่เข้ามาพร้อมกันได้
 */
@ExtendWith(MockitoExtension.class)
class TenantServiceTest {

    @Mock
    private TenantRepository tenantRepository;

    @InjectMocks
    private TenantService tenantService;

    @Test
    @DisplayName("US-03-S1 สร้างผู้เช่าสำเร็จต้องประกอบ entity ครบทั้งห้าช่องและตอบกลับค่าเดียวกัน")
    void createBuildsTheEntityWithEveryField() {
        when(tenantRepository.existsByNationalId("1234567890123")).thenReturn(false);
        when(tenantRepository.save(any(Tenant.class))).thenAnswer(call -> call.getArgument(0));

        TenantResponse response = tenantService.create(new CreateTenantRequest(
                "ยูกิ ทานากะ", "1234567890123", "yuki.t", "081-000-0000", "yuki.t@example.com"));

        Tenant saved = savedTenant();
        assertThat(saved.getFullName()).isEqualTo("ยูกิ ทานากะ");
        assertThat(saved.getNationalId()).isEqualTo("1234567890123");
        assertThat(saved.getLineId()).isEqualTo("yuki.t");
        assertThat(saved.getPhone()).isEqualTo("081-000-0000");
        assertThat(saved.getEmail()).isEqualTo("yuki.t@example.com");

        assertThat(response.fullName()).isEqualTo("ยูกิ ทานากะ");
        assertThat(response.lineId()).isEqualTo("yuki.t");
        assertThat(response.email()).isEqualTo("yuki.t@example.com");
    }

    /**
     * ช่องว่างหัวท้ายมักติดมากับการก๊อปวางจากไลน์หรือจากไฟล์ Excel ถ้าปล่อยไว้
     * เลขบัตรใบเดียวกันจะกลายเป็นคนละค่าในสายตา constraint กันซ้ำ แล้วผู้เช่าคนเดิม
     * ถูกเพิ่มซ้ำได้ทั้งที่มีตัวกันอยู่
     */
    @Test
    @DisplayName("ตัดช่องว่างหัวท้ายทุกช่องก่อนบันทึก และเช็คเลขบัตรซ้ำด้วยค่าที่ตัดแล้ว")
    void createTrimsEveryField() {
        when(tenantRepository.existsByNationalId("1234567890123")).thenReturn(false);
        when(tenantRepository.save(any(Tenant.class))).thenAnswer(call -> call.getArgument(0));

        tenantService.create(new CreateTenantRequest("  ยูกิ ทานากะ  ", " 1234567890123 ",
                "  yuki.t ", " 081-000-0000 ", "  yuki.t@example.com  "));

        Tenant saved = savedTenant();
        assertThat(saved.getFullName()).isEqualTo("ยูกิ ทานากะ");
        assertThat(saved.getNationalId()).isEqualTo("1234567890123");
        assertThat(saved.getLineId()).isEqualTo("yuki.t");
        assertThat(saved.getPhone()).isEqualTo("081-000-0000");
        assertThat(saved.getEmail()).isEqualTo("yuki.t@example.com");
    }

    /** อีเมลเป็นช่องเดียวที่ไม่บังคับ ฟอร์มส่งช่องว่างมาเป็นสตริงว่าง ไม่ใช่ null */
    @Test
    @DisplayName("US-03 อีเมลที่เป็นช่องว่างล้วนต้องกลายเป็น null ไม่ใช่สตริงว่างในฐาน")
    void blankEmailBecomesNull() {
        when(tenantRepository.existsByNationalId("1234567890123")).thenReturn(false);
        when(tenantRepository.save(any(Tenant.class))).thenAnswer(call -> call.getArgument(0));

        TenantResponse response = tenantService.create(new CreateTenantRequest(
                "ยูกิ ทานากะ", "1234567890123", "yuki.t", "081-000-0000", "   "));

        assertThat(savedTenant().getEmail()).isNull();
        assertThat(response.email()).isNull();
    }

    /**
     * เช็คที่ service ไม่ใช่ที่ @Pattern บน DTO เพราะช่องนี้ไม่บังคับ สตริงว่างจะไม่ผ่าน
     * @Pattern ทันที ดูคำอธิบายเต็มใน TenantDtos ข้อความต้องเป็นประโยคเดียวกับ
     * validateTenant ใน frontend/src/domain/tenant.ts
     */
    @Test
    @DisplayName("US-03-S2 อีเมลผิดรูปแบบต้องเป็น IllegalArgumentException เพื่อให้กลายเป็น 400")
    void malformedEmailIsRejectedBeforeSaving() {
        assertThatThrownBy(() -> tenantService.create(new CreateTenantRequest(
                "ยูกิ ทานากะ", "1234567890123", "yuki.t", "081-000-0000", "not-an-email")))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("รูปแบบอีเมลไม่ถูกต้อง");

        verify(tenantRepository, never()).save(any(Tenant.class));
    }

    @Test
    @DisplayName("US-03 เลขบัตรซ้ำต้องเป็น ConflictException เพื่อให้กลายเป็น 409 ไม่ใช่ 500")
    void duplicateNationalIdIsAConflict() {
        when(tenantRepository.existsByNationalId("1234567890123")).thenReturn(true);

        assertThatThrownBy(() -> tenantService.create(new CreateTenantRequest(
                "ยูกิ ทานากะ", "1234567890123", "yuki.t", "081-000-0000", null)))
                .isInstanceOf(ConflictException.class)
                .hasMessage("มีผู้เช่าที่ใช้เลขบัตรประชาชนนี้อยู่แล้ว");

        verify(tenantRepository, never()).save(any(Tenant.class));
    }

    @Test
    @DisplayName("ดูผู้เช่าที่ไม่มีต้องเป็น NotFoundException ที่บอกว่าไม่พบอะไร id ไหน")
    void getThrowsWhenTenantIsMissing() {
        when(tenantRepository.findById(999L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> tenantService.get(999L))
                .isInstanceOf(NotFoundException.class)
                .hasMessage("ไม่พบผู้เช่า id 999");
    }

    private Tenant savedTenant() {
        ArgumentCaptor<Tenant> captor = ArgumentCaptor.forClass(Tenant.class);
        verify(tenantRepository).save(captor.capture());
        return captor.getValue();
    }
}
