package com.sakurasoul.apartment.tenant;

import com.sakurasoul.apartment.TestcontainersConfiguration;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIf;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.testcontainers.DockerClientFactory;

import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * เทสของ US-03 "เพิ่มข้อมูลผู้เช่า" (SSK-9) ระดับ HTTP ยิงผ่าน MockMvc ทะลุถึง
 * PostgreSQL ตัวจริงใน Testcontainers
 * <p>
 * ชุดฟิลด์ที่บังคับมาจากคำตัดสินของอาจารย์ (11 ก.ย. 2569) คือ ชื่อ-นามสกุล เลขบัตร
 * ประชาชน และเบอร์โทร ส่วน Line ID กับอีเมลไม่บังคับ รายละเอียดกับข้อความอังกฤษทุกประโยค
 * อยู่ในหัวข้อ US-03 ของ docs/api-contract-lease.md
 * <p>
 * ที่ต้องมีชั้นนี้เพิ่มจาก TenantServiceTest เพราะเรื่องที่พังได้เฉพาะตอนผ่าน HTTP จริง
 * มีสามอย่าง คือ bean validation ตอบข้อความประโยคไหนออกมาที่ช่อง detail, entity
 * กับ V6 ตรงกันพอให้ ddl-auto: validate ยอมให้แอปสตาร์ตไหม และเลขบัตรซ้ำกลายเป็น
 * 409 จริงไม่ใช่ 500 ที่หลุดมาจาก constraint สามเรื่องนี้ mock จับไม่ได้สักอย่าง
 * <p>
 * เครื่องที่ไม่ได้เปิด Docker จะข้ามเทสชุดนี้ ไม่ใช่ล้ม ส่วน CI มี Docker อยู่แล้วจะรันจริง
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
@EnabledIf("dockerAvailable")
// ทุก endpoint ต้องล็อกอินแล้วตั้งแต่ SSK-28 ชุดนี้จึงยิงในนามผู้ใช้ปลอม เพราะสิ่งที่เทสคือ US-03 ไม่ใช่ระบบ login
@WithMockUser
class TenantApiTest {

    /**
     * ขึ้นต้นด้วย 14 กันชนกับเลขบัตรของเทสคลาสอื่นที่ใช้ container เดียวกัน
     * เพราะ V6 ตั้ง tenant_national_id_uk ไว้ เลขซ้ำข้ามคลาสจะพังตามลำดับการรัน
     */
    private static final String NATIONAL_ID = "1400000000001";
    private static final String OTHER_NATIONAL_ID = "1400000000002";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private TenantRepository tenantRepository;

    private Set<Long> tenantsBefore;

    static boolean dockerAvailable() {
        return DockerClientFactory.instance().isDockerAvailable();
    }

    @BeforeEach
    void rememberExistingTenants() {
        tenantsBefore = tenantRepository.findAll().stream()
                .map(Tenant::getId)
                .collect(Collectors.toSet());
    }

    /**
     * ลบเฉพาะผู้เช่าที่เทสนี้สร้างขึ้นมาเอง ไม่ใช่ deleteAll เพราะ container ใช้ร่วมกับ
     * เทสคลาสอื่น ผู้เช่าของคลาสอื่นที่ยังมีสัญญาผูกอยู่จะโดนลบไปด้วยแล้วติด foreign key
     * <p>
     * ปกติต้องลบสัญญาก่อนผู้เช่าเสมอเพราะ lease มี foreign key มาที่ tenant แต่คลาสนี้
     * ไม่ได้สร้างสัญญาสักใบ ผู้เช่าที่สร้างที่นี่จึงไม่มีใครอ้างถึง ลบตรง ๆ ได้เลย
     */
    @AfterEach
    void deleteTenantsCreatedHere() {
        List<Tenant> created = tenantRepository.findAll().stream()
                .filter(tenant -> !tenantsBefore.contains(tenant.getId()))
                .toList();
        tenantRepository.deleteAll(created);
    }

    @Test
    @DisplayName("US-03-S1 ส่งครบทุกช่องต้องได้ 201 และทุกฟิลด์ต้องสะท้อนกลับมาเหมือนที่ส่งไป")
    void createWithEveryFieldEchoesThemBack() throws Exception {
        createTenant("""
                {"fullName":"ยูกิ ทานากะ","nationalId":"%s","lineId":"yuki.t",\
                "phone":"081-000-0000","email":"yuki.t@example.com"}"""
                .formatted(NATIONAL_ID))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").isNumber())
                .andExpect(jsonPath("$.fullName").value("ยูกิ ทานากะ"))
                .andExpect(jsonPath("$.nationalId").value(NATIONAL_ID))
                .andExpect(jsonPath("$.lineId").value("yuki.t"))
                .andExpect(jsonPath("$.phone").value("081-000-0000"))
                .andExpect(jsonPath("$.email").value("yuki.t@example.com"));
    }

    /**
     * เดิมช่องนี้บังคับตามคำตัดสินของอาจารย์ แต่ฟอร์ม Add Tenant ที่ทีมหน้าเว็บ merge
     * เข้ามา (SSK-99) ยังไม่มีช่อง Line ID เลย ถ้ายังบังคับไว้ ทุกครั้งที่แอดมินกดเพิ่ม
     * ผู้เช่าจะได้ 400 กลับไป เท่ากับฟีเจอร์นี้ใช้ไม่ได้ทั้งอัน จึงปลดเป็นช่องไม่บังคับ
     * พร้อม migration V10 ที่ปลด NOT NULL ของคอลัมน์ line_id
     */
    @Test
    @DisplayName("US-03-S2 ไม่ส่ง lineId ต้องได้ 201 เพราะฟอร์มที่ merge มา (SSK-99) ยังไม่มีช่องนี้")
    void missingLineIdIsAcceptedBecauseTheMergedFormDoesNotSendIt() throws Exception {
        createTenant("""
                {"fullName":"ยูกิ ทานากะ","nationalId":"%s",\
                "phone":"081-000-0000","email":"yuki.t@example.com"}"""
                .formatted(NATIONAL_ID))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.lineId").value(nullValue()))
                .andExpect(jsonPath("$.phone").value("081-000-0000"));
    }

    /** ช่องเดียวที่ไม่บังคับตามคำตัดสินของอาจารย์ ไม่ส่งมาต้องผ่าน และลงฐานเป็น null */
    @Test
    @DisplayName("US-03 ไม่ส่งอีเมลมาต้องได้ 201 และ email ต้องเป็น null ไม่ใช่สตริงว่าง")
    void createWithoutEmailIsAccepted() throws Exception {
        createTenant("""
                {"fullName":"Kenji Watanabe","nationalId":"AB1234567","lineId":"kenji.w",\
                "phone":"062-111-2222"}""")
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.nationalId").value("AB1234567"))
                .andExpect(jsonPath("$.email").value(nullValue()));
    }

    /** ช่องว่างล้วนถือว่าไม่ได้กรอก ต้องไม่กลายเป็น 400 ทั้งที่ช่องนี้ไม่บังคับ */
    @Test
    @DisplayName("US-03 ส่งอีเมลมาเป็นสตริงว่างต้องได้ 201 และถูกเก็บเป็น null")
    void blankEmailBecomesNull() throws Exception {
        createTenant("""
                {"fullName":"ปิยะดา แสงทอง","nationalId":"%s","lineId":"piyada.s",\
                "phone":"089-876-5432","email":"   "}"""
                .formatted(NATIONAL_ID))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.email").value(nullValue()));
    }

    @Test
    @DisplayName("US-03-S2 อีเมลผิดรูปแบบต้องได้ 400 พร้อมข้อความชุดเดียวกับฝั่งหน้าเว็บ")
    void malformedEmailIsRejected() throws Exception {
        createTenant("""
                {"fullName":"ยูกิ ทานากะ","nationalId":"%s","lineId":"yuki.t",\
                "phone":"081-000-0000","email":"not-an-email"}"""
                .formatted(NATIONAL_ID))
                .andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.detail").value("That email address is not valid"));

        // ต้องไม่ถูกบันทึกไปแล้วค่อยฟ้อง
        mockMvc.perform(get("/api/tenants"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.nationalId=='%s')]".formatted(NATIONAL_ID), hasSize(0)));
    }

    @Test
    @DisplayName("US-03-S2 เลขบัตรสั้นเกินต้องได้ 400 ที่บอกว่ารับ 13 หลักหรือเลขพาสปอร์ต")
    void tooShortNationalIdIsRejected() throws Exception {
        createTenant("""
                {"fullName":"ยูกิ ทานากะ","nationalId":"12","lineId":"yuki.t",\
                "phone":"081-000-0000","email":"yuki.t@example.com"}""")
                .andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.detail")
                        .value("The national ID must be 13 digits, or a passport number of 6 to 20 characters"))
                .andExpect(jsonPath("$.fields.nationalId")
                        .value("The national ID must be 13 digits, or a passport number of 6 to 20 characters"));
    }

    /**
     * ช่องนี้มีสองกฎซ้อนกันคือ @NotBlank กับ @Pattern ค่าที่เป็นสตริงว่างจึงเคยผิดทั้งคู่
     * พร้อมกัน แล้ว detail จะได้ประโยคไหนขึ้นกับลำดับของ Set ที่ bean validation คืนมา
     * ซึ่งไม่มีใครรับประกัน สัญญา API ระบุว่าเคส "ไม่ได้กรอกเลขบัตร" ต้องได้ประโยคที่บอกให้
     * ไปกรอก ไม่ใช่ประโยคที่อธิบายรูปแบบ เทสนี้จึงตรึงข้อนี้ไว้ ดูคำอธิบายเต็มใน TenantDtos
     */
    @Test
    @DisplayName("US-03-S2 ส่งเลขบัตรมาเป็นสตริงว่างต้องได้ 400 ที่บอกให้กรอก ไม่ใช่ที่อธิบายรูปแบบ")
    void blankNationalIdAsksForItInsteadOfExplainingTheFormat() throws Exception {
        createTenant("""
                {"fullName":"ยูกิ ทานากะ","nationalId":"","lineId":"yuki.t",\
                "phone":"081-000-0000","email":"yuki.t@example.com"}""")
                .andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.detail").value("Please enter the national ID"))
                .andExpect(jsonPath("$.fields.nationalId").value("Please enter the national ID"));
    }

    /**
     * เลขบัตรซ้ำเป็นเคสที่ต้องมาถึงชั้นนี้ถึงจะพิสูจน์ได้ เพราะ constraint
     * tenant_national_id_uk ใน V6 ต้องมีอยู่จริง ถึงจะกันเคสที่สองคำขอเข้ามาพร้อมกัน
     * <p>
     * เทสตัวนี้ยิงผ่าน HTTP จึงได้เส้นทางที่ TenantService เช็คเจอก่อน ส่วนเส้นทางที่หลุด
     * ไปโดน constraint จริง ๆ อยู่ในเทสตัวถัดไป สองเส้นทางต้องได้ประโยคเดียวกัน
     */
    @Test
    @DisplayName("US-03 เพิ่มผู้เช่าด้วยเลขบัตรเดิมซ้ำต้องได้ 409 ไม่ใช่ 500 และบอกว่าซ้ำกับใคร")
    void duplicateNationalIdIsAConflict() throws Exception {
        String body = """
                {"fullName":"ยูกิ ทานากะ","nationalId":"%s","lineId":"yuki.t",\
                "phone":"081-000-0000","email":"yuki.t@example.com"}"""
                .formatted(NATIONAL_ID);

        createTenant(body).andExpect(status().isCreated());

        createTenant("""
                {"fullName":"คนละคนกัน","nationalId":"%s","lineId":"other.line",\
                "phone":"089-000-0000","email":null}"""
                .formatted(NATIONAL_ID))
                .andExpect(status().isConflict())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.detail").value("A tenant with this national ID already exists"));

        // ใบที่สองต้องไม่ถูกบันทึก เลขบัตรนี้ยังมีผู้เช่าคนเดียวเหมือนเดิม
        mockMvc.perform(get("/api/tenants"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.nationalId=='%s')]".formatted(NATIONAL_ID), hasSize(1)));
    }

    /**
     * จงใจข้าม TenantService เขียนตรงเข้า repository เพื่อจำลองสองคำขอที่เช็คผ่านพร้อมกัน
     * แล้วเขียนลงไปทั้งคู่ ซึ่งเป็นเส้นทางเดียวที่ทำให้ constraint ทำงานจริง (หลักการเดียว
     * กับ lease_no_overlap ใน LeaseOverlapIntegrationTest)
     * <p>
     * ที่ต้องเช็คถึงชื่อ constraint ในข้อความ เพราะ ApiExceptionHandler ตัดสินใจจากการ
     * หาคำว่า tenant_national_id_uk ในข้อความของ cause ถ้าวันหนึ่งมีคนเปลี่ยนชื่อ
     * constraint ใน migration ตัว handler จะตกไปใช้ประโยคกลาง ๆ "ข้อมูลชนกับที่มีอยู่แล้ว
     * ในระบบ" เงียบ ๆ โดยไม่มีเทสไหนแดง ผู้ใช้จะเห็นคนละประโยคกับที่สัญญา API เขียนไว้
     */
    @Test
    @DisplayName("US-03 เขียนเลขบัตรซ้ำตรงเข้า database ต้องโดน tenant_national_id_uk กันไว้")
    void databaseConstraintBlocksDuplicateNationalIdEvenWithoutServiceCheck() {
        tenantRepository.saveAndFlush(
                new Tenant("ยูกิ ทานากะ", NATIONAL_ID, "yuki.t", "081-000-0000", null));

        Tenant duplicate =
                new Tenant("คนละคนกัน", NATIONAL_ID, "other.line", "089-000-0000", null);

        assertThatThrownBy(() -> tenantRepository.saveAndFlush(duplicate))
                .isInstanceOf(DataIntegrityViolationException.class)
                .satisfies(ex -> assertThat(((DataIntegrityViolationException) ex)
                        .getMostSpecificCause().getMessage())
                        .contains("tenant_national_id_uk"));
    }

    @Test
    @DisplayName("US-03 รายชื่อผู้เช่าและผู้เช่ารายคนต้องมี lineId กับ email ติดมาด้วย")
    void listAndDetailCarryTheNewContactFields() throws Exception {
        createTenant("""
                {"fullName":"ยูกิ ทานากะ","nationalId":"%s","lineId":"yuki.t",\
                "phone":"081-000-0000","email":"yuki.t@example.com"}"""
                .formatted(NATIONAL_ID))
                .andExpect(status().isCreated());

        // คนที่สองไม่มีอีเมล รายการต้องส่ง null กลับมาได้โดยไม่ตัดฟิลด์ทิ้ง
        createTenant("""
                {"fullName":"Kenji Watanabe","nationalId":"%s","lineId":"kenji.w",\
                "phone":"062-111-2222"}"""
                .formatted(OTHER_NATIONAL_ID))
                .andExpect(status().isCreated());

        mockMvc.perform(get("/api/tenants"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.nationalId=='%s')].lineId".formatted(NATIONAL_ID))
                        .value("yuki.t"))
                .andExpect(jsonPath("$[?(@.nationalId=='%s')].email".formatted(NATIONAL_ID))
                        .value("yuki.t@example.com"))
                .andExpect(jsonPath("$[?(@.nationalId=='%s')].lineId".formatted(OTHER_NATIONAL_ID))
                        .value("kenji.w"));

        mockMvc.perform(get("/api/tenants/{id}", tenantId(NATIONAL_ID)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.fullName").value("ยูกิ ทานากะ"))
                .andExpect(jsonPath("$.nationalId").value(NATIONAL_ID))
                .andExpect(jsonPath("$.lineId").value("yuki.t"))
                .andExpect(jsonPath("$.phone").value("081-000-0000"))
                .andExpect(jsonPath("$.email").value("yuki.t@example.com"));

        // ผู้เช่าที่ไม่ได้กรอกอีเมลต้องยังมีช่อง email ติดมาในคำตอบ แค่เป็น null
        mockMvc.perform(get("/api/tenants/{id}", tenantId(OTHER_NATIONAL_ID)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.lineId").value("kenji.w"))
                .andExpect(jsonPath("$.email").value(nullValue()));
    }

    private long tenantId(String nationalId) {
        return tenantRepository.findAll().stream()
                .filter(tenant -> nationalId.equals(tenant.getNationalId()))
                .findFirst()
                .orElseThrow()
                .getId();
    }

    private ResultActions createTenant(String body) throws Exception {
        return mockMvc.perform(post("/api/tenants")
                .contentType(MediaType.APPLICATION_JSON)
                .content(body));
    }
}
