package com.sakurasoul.apartment.tenant;

import com.sakurasoul.apartment.common.ConflictException;
import com.sakurasoul.apartment.common.NotFoundException;
import com.sakurasoul.apartment.tenant.TenantDtos.CreateTenantRequest;
import com.sakurasoul.apartment.tenant.TenantDtos.TenantResponse;
import com.sakurasoul.apartment.tenant.TenantDtos.TenantSearchResponse;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.List;
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
                .hasMessage("That email address is not valid");

        verify(tenantRepository, never()).save(any(Tenant.class));
    }

    @Test
    @DisplayName("US-03 เลขบัตรซ้ำต้องเป็น ConflictException เพื่อให้กลายเป็น 409 ไม่ใช่ 500")
    void duplicateNationalIdIsAConflict() {
        when(tenantRepository.existsByNationalId("1234567890123")).thenReturn(true);

        assertThatThrownBy(() -> tenantService.create(new CreateTenantRequest(
                "ยูกิ ทานากะ", "1234567890123", "yuki.t", "081-000-0000", null)))
                .isInstanceOf(ConflictException.class)
                .hasMessage("A tenant with this national ID already exists");

        verify(tenantRepository, never()).save(any(Tenant.class));
    }

    @Test
    @DisplayName("ดูผู้เช่าที่ไม่มีต้องเป็น NotFoundException ที่บอกว่าไม่พบอะไร id ไหน")
    void getThrowsWhenTenantIsMissing() {
        when(tenantRepository.findById(999L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> tenantService.get(999L))
                .isInstanceOf(NotFoundException.class)
                .hasMessage("No tenant with id 999");
    }

    @Test
    @DisplayName("SSK-174 ค้นชื่อได้ผู้เช่าครบทุกช่องพร้อม match และผลที่ตรงทั้งคำมาก่อนผลที่คล้าย")
    void searchMapsEveryFieldAndRanksExactBeforeSimilar() {
        Tenant kant = tenant(7L, "Kant Srisuk", "1234567890123", "kant.s", "081-111-1111", "kant@example.com");
        Tenant kart = tenant(8L, "Kart Wong", "1234567890124", null, "081-222-2222", null);
        // repository เรียงตามชื่อมาแล้ว แต่ลำดับของผลต้องมาจากความตรง ไม่ใช่ลำดับที่ส่งเข้ามา
        when(tenantRepository.findAllByOrderByFullNameAsc()).thenReturn(List.of(kart, kant));

        List<TenantSearchResponse> results = tenantService.search("kant");

        assertThat(results).containsExactly(
                new TenantSearchResponse(7L, "Kant Srisuk", "1234567890123", "kant.s", "081-111-1111",
                        "kant@example.com", TenantMatch.EXACT),
                new TenantSearchResponse(8L, "Kart Wong", "1234567890124", null, "081-222-2222", null,
                        TenantMatch.SIMILAR));
    }

    @Test
    @DisplayName("SSK-174 คำค้นว่างหรือมีแต่ช่องว่างได้ลิสต์ว่างโดยไม่ถามฐานข้อมูล")
    void blankSearchDoesNotTouchTheDatabase() {
        assertThat(tenantService.search("")).isEmpty();
        assertThat(tenantService.search("   ")).isEmpty();
        assertThat(tenantService.search(null)).isEmpty();

        verify(tenantRepository, never()).findAllByOrderByFullNameAsc();
    }

    private static Tenant tenant(Long id, String fullName, String nationalId, String lineId, String phone,
            String email) {
        Tenant tenant = new Tenant(fullName, nationalId, lineId, phone, email);
        ReflectionTestUtils.setField(tenant, "id", id);
        return tenant;
    }

    private Tenant savedTenant() {
        ArgumentCaptor<Tenant> captor = ArgumentCaptor.forClass(Tenant.class);
        verify(tenantRepository).save(captor.capture());
        return captor.getValue();
    }
}
