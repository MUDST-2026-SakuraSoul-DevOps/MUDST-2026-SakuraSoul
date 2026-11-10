package com.sakurasoul.apartment.meter;

import com.sakurasoul.apartment.TestcontainersConfiguration;
import com.sakurasoul.apartment.buildingconfig.BuildingConfigDtos.BuildingConfigRequest;
import com.sakurasoul.apartment.buildingconfig.BuildingConfigService;
import com.sakurasoul.apartment.common.ConflictException;
import com.sakurasoul.apartment.room.Room;
import com.sakurasoul.apartment.room.RoomRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIf;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockMultipartHttpServletRequestBuilder;
import org.testcontainers.DockerClientFactory;

import java.math.BigDecimal;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.time.YearMonth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.matchesPattern;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.anonymous;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * นำเข้าค่าน้ำค่าไฟจาก CSV (SSK-166) ยิงผ่าน HTTP แบบ multipart ถึง PostgreSQL ตัวจริง ตามที่สัญญา API ขอ
 * คือ dry run, นำเข้าจริง, นำเข้าซ้ำ และ overwrite
 * <p>
 * ไม่มีเทสคลาสอื่นเขียนตาราง meter_reading จึงล้างทั้งตารางหลังทุกเทส ค่าที่ค้างไว้ทำให้ห้องนั้นลบไม่ได้ในเทสอื่น
 * เดือนที่นำเข้าใช้ปี 2025 เพราะเดือนอนาคตถูกปฏิเสธ
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
@EnabledIf("dockerAvailable")
@WithMockUser
class MeterReadingApiTest {

    private static final String HEADER = "room_number,month,electric_units,water_units\n";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JdbcTemplate jdbc;

    @Autowired
    private RoomRepository roomRepository;

    @Autowired
    private BuildingConfigService buildingConfigService;

    static boolean dockerAvailable() {
        return DockerClientFactory.instance().isDockerAvailable();
    }

    @AfterEach
    void clearReadings() {
        jdbc.update("DELETE FROM meter_reading");
    }

    @Test
    @DisplayName("SSK-166 dry run ตอบแถวที่ถูกกับแถวที่ผิดพร้อมเลขบรรทัดในไฟล์ ไม่บันทึกอะไร ไม่ส่ง dryRun ก็ถือเป็น dry run")
    void aDryRunReportsWithoutSaving() throws Exception {
        String csv = HEADER + "101,2025-03,142.5,12\n\n102,2025-03,98,9.5\n999,2025-03,1,1\n101,2099-01,1,1\n";

        importCsv(csv, "true", null)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.dryRun").value(true))
                .andExpect(jsonPath("$.rows[*].line", contains(2, 4)))
                .andExpect(jsonPath("$.rows[0].roomNumber").value("101"))
                .andExpect(jsonPath("$.rows[0].month").value("2025-03"))
                .andExpect(jsonPath("$.rows[0].electricUnits").value(142.5))
                .andExpect(jsonPath("$.rows[0].waterUnits").value(12.0))
                .andExpect(jsonPath("$.rows[0].alreadyExists").value(false))
                .andExpect(jsonPath("$.errors[0].line").value(5))
                .andExpect(jsonPath("$.errors[0].message").value("Unit 999 does not exist"))
                .andExpect(jsonPath("$.errors[1].line").value(6))
                .andExpect(jsonPath("$.errors[1].message").value("Month 2099-01 is in the future"))
                .andExpect(jsonPath("$.imported").value(0))
                .andExpect(jsonPath("$.skipped").value(0));
        importCsv(csv, null, null)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.dryRun").value(true));

        assertThat(readings()).isZero();
    }

    @Test
    @DisplayName("SSK-166 นำเข้าจริงบันทึกแถวที่ถูก นำเข้าซ้ำข้ามของเดิม overwrite ทับ รายการเรียงเดือนใหม่ก่อนแล้วตามผังตึก")
    void importSkipsOrOverwritesExistingReadings() throws Exception {
        importCsv(HEADER + "102,2025-03,98,9.5\n101,2025-03,142.5,12\n101,2025-02,120,10\n", "false", null)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.dryRun").value(false))
                .andExpect(jsonPath("$.imported").value(3))
                .andExpect(jsonPath("$.skipped").value(0));

        mockMvc.perform(get("/api/meter-readings"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[*].roomNumber", contains("101", "102", "101")))
                .andExpect(jsonPath("$[*].month", contains("2025-03", "2025-03", "2025-02")))
                .andExpect(jsonPath("$[0].roomId").value(1))
                .andExpect(jsonPath("$[0].electricUnits").value(142.5))
                .andExpect(jsonPath("$[0].waterUnits").value(12.0))
                .andExpect(jsonPath("$[0].source").value("CSV"))
                .andExpect(jsonPath("$[0].importedAt")
                        .value(matchesPattern("^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z$")));
        mockMvc.perform(get("/api/meter-readings").param("month", "2025-02"))
                .andExpect(jsonPath("$[*].roomNumber", contains("101")));

        // นำเข้าซ้ำด้วยค่าใหม่โดยไม่ขอทับ แถวเดิมถูกข้ามและค่าไม่เปลี่ยน แถวที่ยังไม่มี (102 ก.พ.) ยังบันทึก
        String again = HEADER + "101,2025-03,150,13\n102,2025-02,80,8\n";
        importCsv(again, "false", "false")
                .andExpect(jsonPath("$.rows[*].alreadyExists", contains(true, false)))
                .andExpect(jsonPath("$.imported").value(1))
                .andExpect(jsonPath("$.skipped").value(1));
        assertThat(electricUnits("101", "2025-03")).isEqualByComparingTo("142.50");

        // dry run ที่ขอทับนับว่าจะบันทึกทุกแถว แต่ยังไม่เขียนอะไร
        importCsv(again, "true", "true")
                .andExpect(jsonPath("$.imported").value(0))
                .andExpect(jsonPath("$.skipped").value(0));
        assertThat(electricUnits("101", "2025-03")).isEqualByComparingTo("142.50");

        importCsv(again, "false", "true")
                .andExpect(jsonPath("$.imported").value(2))
                .andExpect(jsonPath("$.skipped").value(0));
        assertThat(electricUnits("101", "2025-03")).isEqualByComparingTo("150.00");
        assertThat(readings()).isEqualTo(4);
    }

    @Test
    @DisplayName("SSK-166 ไฟล์ที่ใช้ไม่ได้ทั้งไฟล์ได้ 400 ข้อความตรงกับหน้าเว็บ และไม่บันทึกแม้แต่แถวเดียว")
    void unusableFilesAreRejectedWhole() throws Exception {
        mockMvc.perform(multipart("/api/meter-readings/import").param("dryRun", "false"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value("Please choose a CSV file"));
        assertBadFile(new byte[MeterCsv.MAX_BYTES + 1], "The file is larger than 1 MB");
        assertBadFile((HEADER + "ห้อง,2025-03,1,1\n").getBytes(Charset.forName("TIS-620")),
                "The file must be UTF-8 text");
        assertBadFile(utf8(HEADER + "101,\"2025-03,1,1\n101,2025-04,1,1\n"),
                "The file has a quote that is never closed. Check the file and try again.");
        assertBadFile(utf8("room,month\n101,2025-03\n"), "The first line must be the header"
                + " room_number,month,electric_units,water_units. Download the template to see the format.");
        assertBadFile(utf8(HEADER), "The file has no data rows.");

        assertThat(readings()).isZero();
    }

    @Test
    @DisplayName("SSK-166 ค่ามิเตอร์เป็นประวัติของห้อง ลบห้องหรือลดผังตึกได้ 409 ที่บอกเหตุผล")
    void roomsWithReadingsCannotBeRemoved() throws Exception {
        try {
            buildingConfigService.update(new BuildingConfigRequest(
                    BigDecimal.valueOf(3), BigDecimal.valueOf(12), "SINGLE"));
            long room301 = roomId("301");
            importCsv(HEADER + "301,2025-03,10,1\n", "false", null)
                    .andExpect(jsonPath("$.imported").value(1));

            mockMvc.perform(delete("/api/rooms/{id}", room301))
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.detail").value("Unit 301 has meter reading history and cannot be deleted"));
            assertThatThrownBy(() -> buildingConfigService.update(new BuildingConfigRequest(
                    BigDecimal.valueOf(2), BigDecimal.valueOf(12), "SINGLE")))
                    .isInstanceOf(ConflictException.class)
                    .hasMessage("Unit 301 has lease, maintenance or meter reading history and cannot be removed."
                            + " Nothing was changed.");
        } finally {
            jdbc.update("DELETE FROM meter_reading");
            buildingConfigService.update(new BuildingConfigRequest(
                    BigDecimal.valueOf(2), BigDecimal.valueOf(12), "SINGLE"));
        }
    }

    @Test
    @DisplayName("SSK-166 เดือนของ GET ที่ผิดรูปแบบได้ 400 และไม่ได้ล็อกอินได้ 401 ทั้งอ่านและนำเข้า")
    void badMonthsAndSignedOutRequestsAreRejected() throws Exception {
        mockMvc.perform(get("/api/meter-readings").param("month", "2025-13"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value("month must be YYYY-MM"));
        mockMvc.perform(get("/api/meter-readings").with(anonymous()))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(multipart("/api/meter-readings/import").file(csvFile(utf8(HEADER))).with(anonymous()))
                .andExpect(status().isUnauthorized());
    }

    private ResultActions importCsv(String csv, String dryRun, String overwrite) throws Exception {
        MockMultipartHttpServletRequestBuilder request = multipart("/api/meter-readings/import")
                .file(csvFile(utf8(csv)));
        if (dryRun != null) {
            request.param("dryRun", dryRun);
        }
        if (overwrite != null) {
            request.param("overwrite", overwrite);
        }
        return mockMvc.perform(request);
    }

    /** ส่งแบบ dryRun=false เพื่อพิสูจน์ด้วยว่าไฟล์ที่ผิดทั้งไฟล์ไม่บันทึกอะไรแม้ขอให้บันทึก */
    private void assertBadFile(byte[] content, String detail) throws Exception {
        mockMvc.perform(multipart("/api/meter-readings/import").file(csvFile(content)).param("dryRun", "false"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value(detail));
    }

    private static MockMultipartFile csvFile(byte[] content) {
        return new MockMultipartFile("file", "usage.csv", "text/csv", content);
    }

    private static byte[] utf8(String text) {
        return text.getBytes(StandardCharsets.UTF_8);
    }

    private int readings() {
        return jdbc.queryForObject("SELECT count(*) FROM meter_reading", Integer.class);
    }

    private BigDecimal electricUnits(String roomNumber, String month) {
        return jdbc.queryForObject("""
                SELECT m.electric_units FROM meter_reading m JOIN room r ON r.id = m.room_id
                WHERE r.room_number = ? AND m.reading_month = ?""",
                BigDecimal.class, roomNumber, YearMonth.parse(month).atDay(1));
    }

    private long roomId(String roomNumber) {
        return roomRepository.findAllInLayoutOrder().stream()
                .filter(room -> room.getRoomNumber().equals(roomNumber))
                .map(Room::getId)
                .findFirst()
                .orElseThrow();
    }
}
