package com.sakurasoul.apartment.auth;

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
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.testcontainers.DockerClientFactory;

import jakarta.servlet.http.HttpSession;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * เทสของ US-01 (เข้าสู่ระบบ) และ US-02 (ออกจากระบบ) ระดับ HTTP ยิงผ่าน MockMvc
 * ทะลุถึง PostgreSQL ตัวจริงใน Testcontainers
 * <p>
 * ที่ต้องเป็นเทสชั้นนี้ ไม่ใช่ unit test เพราะสิ่งที่ต้องพิสูจน์คือพฤติกรรมของ filter chain
 * ทั้งเส้น ซึ่ง mock จับไม่ได้สักข้อ คือ session ถูกเขียนตอนล็อกอินจริงไหม
 * (Spring Security 6 ขึ้นไปไม่ save ให้เอง) คำขอถัดไปที่แนบ session เดิมมาผ่านไหม
 * คำขอที่ไม่มี session ได้ 401 เป็น problem+json ไม่ใช่ 302 ไปหน้า login และ
 * probe ของ k8s ยังเข้าได้โดยไม่ต้องล็อกอินไหม
 * <p>
 * ไม่ใช้ @WithMockUser ที่นี่โดยตั้งใจ ต่างจาก RoomApiTest กับ LeaseApiTest ที่ใช้
 * เพราะชุดนี้เทสตัวกลไกล็อกอินเอง ถ้าปลอม SecurityContext ให้ก็ไม่เหลืออะไรให้เทส
 * <p>
 * เครื่องที่ไม่ได้เปิด Docker จะข้ามเทสชุดนี้ ไม่ใช่ล้ม ส่วน CI มี Docker อยู่แล้วจะรันจริง
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
@EnabledIf("dockerAvailable")
class AuthApiTest {

    private static final String USERNAME = "somsri";
    private static final String PASSWORD = "sakura-1234";
    private static final String DISPLAY_NAME = "สมศรี ผู้ดูแล";

    /** ข้อความเดียวกันทั้งกรอกชื่อผิดและกรอกรหัสผิด ห้ามบอกว่าผิดช่องไหน */
    private static final String BAD_CREDENTIALS = "The username or password is incorrect";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private AdminUserRepository adminUserRepository;

    @Autowired
    private PasswordEncoder passwordEncoder;

    private AdminUser somsri;

    static boolean dockerAvailable() {
        return DockerClientFactory.instance().isDockerAvailable();
    }

    /**
     * สร้างแอดมินผ่าน repository ตรง ๆ พร้อม hash จาก PasswordEncoder ตัวเดียวกับที่
     * แอปใช้จริง ไม่ได้ก๊อป hash มาแปะเป็นค่าคงที่ เพราะวันที่เปลี่ยน strength ของ BCrypt
     * หรือย้ายไป argon2 เทสชุดนี้จะยังเขียวตามไปเองโดยไม่ต้องไปนั่งสร้าง hash ใหม่
     * <p>
     * ไม่ใช้ AdminUserInitializer เพราะตัวนั้นทำงานตอนสตาร์ต context ซึ่งใช้ร่วมกัน
     * ทุกคลาสเทส และโปรไฟล์ตอนเทสไม่ได้ตั้งรหัสผ่านไว้ ตารางจึงว่างอยู่แล้ว
     */
    @BeforeEach
    void createAdmin() {
        somsri = adminUserRepository.saveAndFlush(new AdminUser(USERNAME,
                passwordEncoder.encode(PASSWORD), DISPLAY_NAME, "somsri@example.com", "081-111-2222"));
    }

    /**
     * ลบทิ้งทุกครั้ง เพราะ container กับ Spring context ใช้ร่วมกันทั้งรอบเทส
     * ถ้าปล่อยแถวค้างไว้ AdminUserInitializerTest ที่เช็คว่า "ตารางว่างไหม" หรือ
     * เทสของคนอื่นที่มาเพิ่มทีหลังจะเห็นแอดมินโผล่มาแล้วพังตามลำดับการรัน
     */
    @AfterEach
    void removeAdmin() {
        adminUserRepository.delete(somsri);
    }

    @Test
    @DisplayName("US-01-S1 ล็อกอินถูกต้องต้องได้ 200 พร้อมชื่อที่เอาไปโชว์ และมี session ผูกให้แล้ว")
    void loginWithCorrectPasswordReturnsProfileAndStartsASession() throws Exception {
        MvcResult result = login(USERNAME, PASSWORD)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.username").value(USERNAME))
                .andExpect(jsonPath("$.displayName").value(DISPLAY_NAME))
                .andExpect(jsonPath("$.email").value("somsri@example.com"))
                .andExpect(jsonPath("$.phone").value("081-111-2222"))
                .andReturn();

        // MockMvc ไม่ได้วิ่งผ่าน servlet container จริงจึงไม่มีหัว Set-Cookie: JSESSIONID
        // ให้ตรวจ สิ่งที่ตรวจได้และเป็นตัวเดียวกับที่ cookie ชี้ไปคือ session ฝั่ง server
        // ที่ต้องมี SecurityContext ถูกเขียนไว้แล้ว ถ้า AuthService ลืมเรียก saveContext
        // บรรทัดนี้จะแดงทันทีทั้งที่ status ยังเป็น 200
        HttpSession session = result.getRequest().getSession(false);
        assertThat(session).isNotNull();
        assertThat(session.getAttribute(
                HttpSessionSecurityContextRepository.SPRING_SECURITY_CONTEXT_KEY)).isNotNull();
    }

    /**
     * session fixation คือท่าที่คนร้ายยัด JSESSIONID ที่ตัวเองรู้ค่าเข้าไปในเบราว์เซอร์ของ
     * เหยื่อก่อน แล้วรอให้เหยื่อล็อกอินด้วย session ใบนั้น ถ้ารหัส session ไม่เปลี่ยนตอน
     * ล็อกอิน ใบเดิมที่คนร้ายถืออยู่ก็กลายเป็นใบของแอดมินไปด้วย
     * <p>
     * ที่ต้องมีเทสนี้เพราะ login ของเราเรียก AuthenticationManager เอง ไม่ได้ผ่าน form
     * login filter ของ Spring Security กลไกเปลี่ยนรหัส session ที่มากับฟิลเตอร์นั้นจึงไม่
     * ทำงาน ถ้าวันหลังมีคนลบสองบรรทัดใน AuthService ทิ้ง ไม่มีเทสตัวอื่นในไฟล์นี้แดงเลย
     * เพราะทุกตัวยังล็อกอินผ่านและใช้ session ต่อได้เหมือนเดิมทุกอย่าง
     */
    @Test
    @DisplayName("US-01 ล็อกอินสำเร็จต้องเปลี่ยนรหัส session ใบเดิมทิ้ง กัน session fixation")
    void loginChangesTheSessionIdThatTheBrowserCameWith() throws Exception {
        MockHttpSession planted = new MockHttpSession();
        String plantedId = planted.getId();

        MvcResult result = login(USERNAME, PASSWORD, planted)
                .andExpect(status().isOk())
                .andReturn();

        // ใบเดิมต้องไม่ใช่ใบเดิมอีกต่อไป รหัสที่คนร้ายถือไว้ก่อนหน้าจึงใช้ไม่ได้
        HttpSession session = result.getRequest().getSession(false);
        assertThat(session).isNotNull();
        assertThat(session.getId()).isNotEqualTo(plantedId);

        // เปลี่ยนรหัสแล้วต้องไม่ทำ context หาย ไม่งั้นจะกันได้แต่ล็อกอินไม่ติด
        assertThat(session.getAttribute(
                HttpSessionSecurityContextRepository.SPRING_SECURITY_CONTEXT_KEY)).isNotNull();
    }

    @Test
    @DisplayName("US-01-S2 รหัสผ่านผิดต้องได้ 401 เป็น problem+json พร้อมข้อความไทย")
    void loginWithWrongPasswordIsUnauthorized() throws Exception {
        login(USERNAME, "ผิดแน่นอน")
                .andExpect(status().isUnauthorized())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.detail").value(BAD_CREDENTIALS));
    }

    /**
     * หัวใจของข้อนี้คือข้อความต้องเท่ากับเคสรหัสผ่านผิดเป๊ะ ๆ ถ้าต่างกันแม้แต่คำเดียว
     * คนที่ไล่ยิงจะแยกออกว่าชื่อผู้ใช้ไหนมีอยู่จริง แล้วเหลือแค่เดารหัสผ่านอย่างเดียว
     */
    @Test
    @DisplayName("US-01-S2 ชื่อผู้ใช้ที่ไม่มีในระบบต้องได้ข้อความเดียวกับรหัสผ่านผิด ไม่บอกว่าไม่มีชื่อนี้")
    void loginWithUnknownUsernameGivesTheSameMessage() throws Exception {
        login("ไม่มีคนนี้", PASSWORD)
                .andExpect(status().isUnauthorized())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.detail").value(BAD_CREDENTIALS));
    }

    @Test
    @DisplayName("US-01 ไม่กรอกชื่อผู้ใช้ต้องได้ 400 พร้อมข้อความของช่องนั้น ไม่ใช่ 401")
    void loginWithBlankUsernameIsABadRequest() throws Exception {
        login("", PASSWORD)
                .andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.detail").value("Please enter the username"));
    }

    /**
     * ข้อนี้คือเหตุผลทั้งหมดที่ SSK-28 มีอยู่ ก่อนหน้านี้ทุก endpoint เปิดหมด
     * ถ้าเทสตัวนี้แดงเมื่อไหร่แปลว่ามีคนเผลอเปิดระบบทิ้งไว้อีกครั้ง
     */
    @Test
    @DisplayName("US-01 เรียก API ที่ต้องล็อกอินโดยไม่มี session ต้องได้ 401 problem+json ไม่ใช่ redirect")
    void protectedEndpointWithoutASessionIsUnauthorized() throws Exception {
        mockMvc.perform(get("/api/rooms"))
                .andExpect(status().isUnauthorized())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.detail").value("Please sign in"));
    }

    @Test
    @DisplayName("US-01-S1 ล็อกอินแล้วเรียก API เดิมด้วย session เดียวกันต้องผ่าน")
    void protectedEndpointWithTheLoginSessionSucceeds() throws Exception {
        MockHttpSession session = loginAndGetSession();

        mockMvc.perform(get("/api/rooms").session(session))
                .andExpect(status().isOk());
    }

    @Test
    @DisplayName("US-01 GET /api/auth/me ด้วย session ที่ล็อกอินแล้วต้องบอกได้ว่าใครอยู่")
    void meReturnsTheLoggedInAdmin() throws Exception {
        MockHttpSession session = loginAndGetSession();

        mockMvc.perform(get("/api/auth/me").session(session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.username").value(USERNAME))
                .andExpect(jsonPath("$.displayName").value(DISPLAY_NAME));
    }

    /**
     * US-02 ออกจากระบบแล้วต้องออกจริง ไม่ใช่แค่หน้าเว็บลืมไปเอง
     * <p>
     * เทสสองท่อนติดกันในเทสเดียวโดยตั้งใจ เพราะข้อที่ต้องพิสูจน์คือความสัมพันธ์ระหว่าง
     * สองคำขอนั้น ไม่ใช่รหัสสถานะของแต่ละอันแยกกัน แยกเป็นสองเทสแล้วจะไม่เหลือเทส
     * ตัวไหนที่จับได้เลยว่า session ถูกทิ้งจริง
     */
    @Test
    @DisplayName("US-02-S1 ออกจากระบบต้องได้ 204 และ session เดิมต้องใช้ต่อไม่ได้อีก")
    void logoutEndsTheSession() throws Exception {
        MockHttpSession session = loginAndGetSession();

        mockMvc.perform(post("/api/auth/logout").session(session))
                .andExpect(status().isNoContent());

        mockMvc.perform(get("/api/auth/me").session(session))
                .andExpect(status().isUnauthorized())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.detail").value("Please sign in"));
    }

    /**
     * probe ของ k8s (k8s/20-backend.yaml) กับ healthcheck ของ docker-compose ยิงมา
     * โดยไม่มี session ถ้าข้อนี้แดง pod จะไม่มีวันผ่าน readiness แล้ว k8s จะ restart
     * วนไปเรื่อย ๆ โดยที่ log ของแอปดูปกติทุกอย่าง
     */
    @Test
    @DisplayName("probe ของ k8s ต้องเข้าถึงได้โดยไม่ต้องล็อกอิน")
    void healthProbesStayOpen() throws Exception {
        mockMvc.perform(get("/actuator/health/readiness"))
                .andExpect(status().isOk());
    }

    private ResultActions login(String username, String password) throws Exception {
        return mockMvc.perform(loginRequest(username, password));
    }

    /**
     * แบบที่แนบ session ซึ่งเบราว์เซอร์ถืออยู่ก่อนกดล็อกอินไปด้วย ใช้เฉพาะเทสที่ต้องดูว่า
     * ใบเดิมใบนั้นโดนทำอะไรบ้าง ปกติคำขอ login จริงมักไม่มี session ติดมาเลย
     */
    private ResultActions login(String username, String password, MockHttpSession session)
            throws Exception {
        return mockMvc.perform(loginRequest(username, password).session(session));
    }

    private MockHttpServletRequestBuilder loginRequest(String username, String password) {
        String body = """
                {"username":"%s","password":"%s"}""".formatted(username, password);
        return post("/api/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content(body);
    }

    /**
     * session ที่ล็อกอินสำเร็จแล้ว เอาไปแนบกับคำขอถัดไปด้วย .session(...) ได้เลย
     * เหมือนที่เบราว์เซอร์แนบ cookie JSESSIONID กลับมาให้เอง
     */
    private MockHttpSession loginAndGetSession() throws Exception {
        MvcResult result = login(USERNAME, PASSWORD).andExpect(status().isOk()).andReturn();
        return (MockHttpSession) result.getRequest().getSession(false);
    }
}
