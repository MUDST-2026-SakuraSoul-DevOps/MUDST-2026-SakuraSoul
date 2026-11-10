package com.sakurasoul.apartment.apartmentconfig;

import com.jayway.jsonpath.JsonPath;
import com.sakurasoul.apartment.TestcontainersConfiguration;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIf;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.testcontainers.DockerClientFactory;

import java.math.BigDecimal;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.matchesPattern;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * เทสของ US-16 ระดับ HTTP ยิงผ่าน MockMvc ทะลุถึง PostgreSQL ตัวจริงใน Testcontainers
 * <p>
 * ที่ต้องมีชั้นนี้เพิ่มจาก ApartmentConfigServiceTest เพราะสิ่งที่หน้าเว็บเห็นจริงคือ JSON
 * ไม่ใช่ record ฝั่ง Java เรื่องที่พังได้เฉพาะตอนแปลงเป็น JSON เช่น รูปแบบของ updatedAt
 * จำนวนทศนิยมของอัตรา และ ProblemDetail ที่ออกมาตอนกรอกผิด จับได้ที่ชั้นนี้ชั้นเดียว
 * <p>
 * เครื่องที่ไม่ได้เปิด Docker จะข้ามเทสชุดนี้ ไม่ใช่ล้ม ส่วน CI มี Docker อยู่แล้วจะรันจริง
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
@EnabledIf("dockerAvailable")
// ทุก endpoint ต้องล็อกอินแล้วตั้งแต่ SSK-28 ชุดนี้จึงยิงในนามผู้ใช้ปลอม เพราะสิ่งที่เทสคือ US-16 ไม่ใช่ระบบ login
@WithMockUser
class ApartmentConfigApiTest {

    /** รูปแบบที่สัญญา API กำหนด ความยาวคงที่เพื่อให้หน้าเว็บเทียบสตริงตรง ๆ ได้ */
    private static final String ISO_MILLIS_UTC = "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z$";

    private static final short SINGLETON_ID = 1;

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ApartmentConfigRepository apartmentConfigRepository;

    static boolean dockerAvailable() {
        return DockerClientFactory.instance().isDockerAvailable();
    }

    /**
     * ตารางนี้มีแถวเดียวและใช้ร่วมกันทุกเทส เทสที่แก้อัตราจึงต้องคืนค่าตั้งต้นให้ด้วย
     * ไม่งั้นเทสที่รันทีหลังจะเห็นค่าที่เทสก่อนหน้าทิ้งไว้ แล้วพังตามลำดับการรัน
     * <p>
     * คืนผ่าน repository ตรง ๆ ไม่ยิง PUT เพราะขั้นตอนล้างของไม่ควรพึ่ง endpoint ตัวที่
     * กำลังเทสอยู่ ถ้า PUT พังขึ้นมาจะได้เห็นว่าเทสไหนพังจริง ไม่ใช่พังยกชุด
     */
    @AfterEach
    void restoreSeededRates() {
        ApartmentConfig config = apartmentConfigRepository.findById(SINGLETON_ID).orElseThrow();
        config.apply(new BigDecimal("8.00"), new BigDecimal("18.00"), new BigDecimal("300.00"),
                new BigDecimal("250.00"), config.getUpdatedAt());
        // ดอกเบี้ยตั้งต้นของ V21 สัญญาที่เทสคลาสอื่นสร้างใน container เดียวกันคัดลอกค่านี้ไป
        config.applyLateInterest(new BigDecimal("0.00"), (short) 0);
        apartmentConfigRepository.saveAndFlush(config);
    }

    @Test
    @DisplayName("US-16 เปิดหน้าตั้งค่าต้องได้อัตราตั้งต้นครบ พร้อม updatedAt เป็น ISO-8601 ความยาวคงที่")
    void getReturnsSeededRatesWithFixedWidthTimestamp() throws Exception {
        mockMvc.perform(get("/api/apartment-config"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.electricRatePerUnit").value(8.00))
                .andExpect(jsonPath("$.waterRatePerUnit").value(18.00))
                .andExpect(jsonPath("$.commonAreaFee").value(300.00))
                .andExpect(jsonPath("$.internetFee").value(250.00))
                // ค่าตั้งต้นของ V21 คือไม่คิดดอกเบี้ย (SSK-164)
                .andExpect(jsonPath("$.lateInterestPercentPerMonth").value(0.00))
                .andExpect(jsonPath("$.graceDays").value(0))
                .andExpect(jsonPath("$.updatedAt").value(matchesPattern(ISO_MILLIS_UTC)));
    }

    @Test
    @DisplayName("US-16-S1 บันทึกอัตราใหม่แล้ว GET ต้องได้ค่าใหม่ และ updatedAt ครั้งหลังต้องมากกว่าครั้งก่อน")
    void putSavesNewRatesAndMovesUpdatedAtForward() throws Exception {
        String first = putRates("10.00", "20.00", "320.00", "260.00")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.electricRatePerUnit").value(10.00))
                .andReturn().getResponse().getContentAsString();

        mockMvc.perform(get("/api/apartment-config"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.electricRatePerUnit").value(10.00))
                .andExpect(jsonPath("$.waterRatePerUnit").value(20.00))
                .andExpect(jsonPath("$.commonAreaFee").value(320.00))
                .andExpect(jsonPath("$.internetFee").value(260.00));

        // ต้องห่างกันอย่างน้อยหนึ่งมิลลิวินาที ไม่งั้นสองครั้งจะได้ timestamp เดียวกัน
        Thread.sleep(5);

        String second = putRates("11.00", "21.00", "330.00", "270.00")
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();

        // เทียบแบบ lexicographic เหมือนที่ frontend/src/api/client.test.ts ทำ
        // ซึ่งใช้ได้เพราะรูปแบบเป็น UTC ความละเอียดมิลลิวินาที ความยาวคงที่
        assertThat(updatedAt(second)).isGreaterThan(updatedAt(first));
    }

    @Test
    @DisplayName("US-16-S2 อัตราติดลบต้องได้ 400 เป็น problem+json พร้อมข้อความอังกฤษ และของเดิมต้องไม่ถูกแตะ")
    void putRejectsNegativeRateAndKeepsOldValues() throws Exception {
        putRates("-1", "18", "300", "250")
                .andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.detail").value("Electricity rate per unit cannot be negative"));

        mockMvc.perform(get("/api/apartment-config"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.electricRatePerUnit").value(8.00))
                .andExpect(jsonPath("$.waterRatePerUnit").value(18.00))
                .andExpect(jsonPath("$.commonAreaFee").value(300.00))
                .andExpect(jsonPath("$.internetFee").value(250.00));
    }

    @Test
    @DisplayName("US-16-S2 กรอกตัวหนังสือในช่องตัวเลขต้องได้ 400 ที่บอกชื่อช่อง ไม่ใช่ข้อความภายในของ Jackson")
    void putRejectsNonNumericRateWithFieldName() throws Exception {
        mockMvc.perform(put("/api/apartment-config")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"electricRatePerUnit":"abc","waterRatePerUnit":18,\
                                "commonAreaFee":300,"internetFee":250}"""))
                .andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.detail").value("The electricRatePerUnit field must be a number"));
    }

    @Test
    @DisplayName("อัตราที่มีทศนิยมเกินสองตำแหน่งต้องตอบกลับค่าที่ปัดแล้ว ตรงกับที่ NUMERIC(10,2) เก็บจริง")
    void putRoundsRatesToTwoDecimals() throws Exception {
        putRates("8.005", "18.00", "300.00", "250.00")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.electricRatePerUnit").value(8.01));
    }

    @Test
    @DisplayName("SSK-164 ตั้งดอกเบี้ยแล้ว GET ได้ค่าใหม่ อัตราปัดสองตำแหน่ง อัตราน้ำไฟกับ updatedAt ไม่ขยับ")
    void putLateInterestSavesBothValuesAndLeavesTheRatesAlone() throws Exception {
        String before = mockMvc.perform(get("/api/apartment-config"))
                .andReturn().getResponse().getContentAsString();

        putLateInterest("1.505", "5")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.lateInterestPercentPerMonth").value(1.51))
                .andExpect(jsonPath("$.graceDays").value(5))
                .andExpect(jsonPath("$.electricRatePerUnit").value(8.00))
                .andExpect(jsonPath("$.updatedAt").value(updatedAt(before)));

        mockMvc.perform(get("/api/apartment-config"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.lateInterestPercentPerMonth").value(1.51))
                .andExpect(jsonPath("$.graceDays").value(5))
                .andExpect(jsonPath("$.internetFee").value(250.00));
    }

    @Test
    @DisplayName("SSK-164 ฟอร์มอัตราเดิมที่ไม่รู้จักสองช่องใหม่ กดบันทึกแล้วดอกเบี้ยที่ตั้งไว้ยังอยู่")
    void ratesPutDoesNotWipeTheLateInterest() throws Exception {
        putLateInterest("1.5", "5").andExpect(status().isOk());

        putRates("9.00", "18.00", "300.00", "250.00")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.electricRatePerUnit").value(9.00))
                .andExpect(jsonPath("$.lateInterestPercentPerMonth").value(1.50))
                .andExpect(jsonPath("$.graceDays").value(5));
    }

    @Test
    @DisplayName("SSK-164 ค่าดอกเบี้ยผิดได้ 400 เป็น problem+json พร้อมข้อความตามสัญญา และของเดิมไม่ถูกแตะ")
    void putLateInterestRejectsBadValues() throws Exception {
        putLateInterest("100.01", "0")
                .andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.detail").value("Late interest must be between 0 and 100 percent per month"));
        // ถ้าประกาศ graceDays เป็น int ค่านี้จะไม่ถึงกฎของเรา
        putLateInterest("1.5", "1.5")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value("Grace days must be a whole number from 0 to 31"));
        mockMvc.perform(put("/api/apartment-config/late-interest")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"lateInterestPercentPerMonth\":1.5}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value("Grace days must be a whole number from 0 to 31"));
        mockMvc.perform(put("/api/apartment-config/late-interest")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"lateInterestPercentPerMonth\":1.5,\"graceDays\":\"abc\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value("The graceDays field must be a number"));

        mockMvc.perform(get("/api/apartment-config"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.lateInterestPercentPerMonth").value(0.00))
                .andExpect(jsonPath("$.graceDays").value(0));
    }

    /**
     * error ที่ framework โยนเองก่อนถึง controller ต้องเป็น ProblemDetail ด้วย
     * <p>
     * id ของห้องเป็น Long พอส่ง abc มา Spring โยน MethodArgumentTypeMismatchException
     * ตั้งแต่ตอน bind ยังไม่ทันเข้า RoomService เคสนี้พิสูจน์ว่า ApiExceptionHandler ที่
     * สืบทอด ResponseEntityExceptionHandler ครอบ error กลุ่มนั้นให้แล้ว
     */
    @Test
    @DisplayName("path variable ผิดชนิดต้องได้ 400 เป็น problem+json ไม่ใช่ error page ตั้งต้นของ Spring Boot")
    void badPathVariableIsAProblemDetail() throws Exception {
        mockMvc.perform(get("/api/rooms/abc"))
                .andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON));
    }

    private ResultActions putRates(String electric, String water, String commonArea, String internet)
            throws Exception {
        String body = """
                {"electricRatePerUnit":%s,"waterRatePerUnit":%s,\
                "commonAreaFee":%s,"internetFee":%s}"""
                .formatted(electric, water, commonArea, internet);
        return mockMvc.perform(put("/api/apartment-config")
                .contentType(MediaType.APPLICATION_JSON)
                .content(body));
    }

    private ResultActions putLateInterest(String percentPerMonth, String graceDays) throws Exception {
        return mockMvc.perform(put("/api/apartment-config/late-interest")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"lateInterestPercentPerMonth\":%s,\"graceDays\":%s}".formatted(percentPerMonth, graceDays)));
    }

    /** ดึง updatedAt ออกมาเป็นสตริงดิบ ไม่แปลงเป็นเวลา เพราะสิ่งที่จะเทียบคือสตริง */
    private static String updatedAt(String json) {
        return JsonPath.read(json, "$.updatedAt");
    }
}
