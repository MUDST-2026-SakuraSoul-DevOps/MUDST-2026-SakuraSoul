package com.sakurasoul.apartment.config;

import com.sakurasoul.apartment.TestcontainersConfiguration;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import static org.hamcrest.Matchers.containsString;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.httpBasic;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * เทสว่า /actuator/prometheus (SSK-182) เข้าได้เฉพาะผู้ใช้ metrics ที่มีรหัสถูก
 * <p>
 * สิ่งที่ต้องพิสูจน์ ไม่ใช่แค่ "มี endpoint" แต่ "ใครเข้าไม่ได้":
 * ไม่ล็อกอิน, รหัสผิด, และแอดมินที่ล็อกอินด้วย session ธรรมดา ต้องได้ 401 ทั้งหมด
 * ส่วน health ที่ k8s ใช้เป็น probe ต้องยังเปิดโดยไม่ต้องล็อกอินเหมือนเดิม
 * <p>
 * ต้องเปิด Docker ก่อนรัน (Testcontainers ยก PostgreSQL) เหมือนเทส integration ตัวอื่น
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
@TestPropertySource(properties = "app.metrics.password=test-metrics-password")
class MetricsEndpointSecurityTest {

    @Autowired
    private MockMvc mockMvc;

    @Test
    @DisplayName("ผู้ใช้ metrics ที่รหัสถูกอ่าน metric ของ Prometheus ได้ และมีเมตริกของ JVM")
    void metricsUserCanScrape() throws Exception {
        mockMvc.perform(get("/actuator/prometheus").with(httpBasic("metrics", "test-metrics-password")))
                .andExpect(status().isOk())
                .andExpect(content().string(containsString("jvm_memory_used_bytes")));
    }

    @Test
    @DisplayName("ไม่ได้ล็อกอินเข้า /actuator/prometheus ไม่ได้ (401)")
    void anonymousIsRejected() throws Exception {
        mockMvc.perform(get("/actuator/prometheus"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("รหัสผ่านผิดเข้าไม่ได้ (401)")
    void wrongPasswordIsRejected() throws Exception {
        mockMvc.perform(get("/actuator/prometheus").with(httpBasic("metrics", "wrong")))
                .andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("ชื่อผู้ใช้อื่นแม้รหัสตรงกับ metrics ก็เข้าไม่ได้ (401)")
    void otherUsernameIsRejected() throws Exception {
        mockMvc.perform(get("/actuator/prometheus").with(httpBasic("admin", "test-metrics-password")))
                .andExpect(status().isUnauthorized());
    }

    @Test
    @WithMockUser
    @DisplayName("แอดมินที่ล็อกอินด้วย session ธรรมดาก็อ่าน metric ไม่ได้ ต้องเป็นผู้ใช้ metrics เท่านั้น")
    void sessionAdminIsRejected() throws Exception {
        // 401 หรือ 403 ก็ได้ ขึ้นกับว่า chain ที่ไม่มี session จะมองผู้ใช้ปลอมเป็นใคร ที่สำคัญคืออ่านไม่ได้
        mockMvc.perform(get("/actuator/prometheus"))
                .andExpect(status().is4xxClientError());
    }

    @Test
    @DisplayName("health ของ probe ยังเปิดโดยไม่ต้องล็อกอินเหมือนเดิม")
    void healthStaysOpen() throws Exception {
        mockMvc.perform(get("/actuator/health/readiness"))
                .andExpect(status().isOk());
    }
}
