package com.sakurasoul.apartment.maintenance;

import com.jayway.jsonpath.JsonPath;
import com.sakurasoul.apartment.TestcontainersConfiguration;
import com.sakurasoul.apartment.common.AppTime;
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

import java.time.LocalDate;

import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.notNullValue;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * เทสของ US-14 การแจ้งเตือนซ่อมบำรุงตามรอบ ระดับ HTTP ยิงผ่าน MockMvc ทะลุถึง
 * PostgreSQL ตัวจริง
 * <p>
 * ที่ต้องมีชั้นนี้เพิ่มจาก ReminderServiceTest เพราะเรื่องที่ mock จับไม่ได้คือใบแจ้งซ่อม
 * ที่ระบบสร้างให้ถูกเขียนลงฐานจริงจน GET /api/maintenance เห็นไหม วันครบกำหนดที่
 * เลื่อนไปแล้วถูกบันทึกลงคอลัมน์จริงไหม และ entity กับ V8 ตรงกันพอให้แอปสตาร์ตไหม
 * <p>
 * วันที่ในเทสชุดนี้อ้างอิงจาก AppTime.today() เสมอ ไม่ได้ฝังวันที่ตายตัว เพราะเทสชั้นนี้
 * ยิงผ่านแอปจริงซึ่งใช้นาฬิกาจริง (การตรึงวันเป็นงานของ ReminderServiceTest)
 * <p>
 * เครื่องที่ไม่ได้เปิด Docker จะข้ามเทสชุดนี้ ไม่ใช่ล้ม ส่วน CI มี Docker อยู่แล้วจะรันจริง
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
@EnabledIf("dockerAvailable")
// ทุก endpoint ต้องล็อกอินแล้วตั้งแต่ SSK-28 ชุดนี้จึงยิงในนามผู้ใช้ปลอม เพราะสิ่งที่เทสคือ US-14 ไม่ใช่ระบบ login
@WithMockUser
class ReminderApiTest {

    /** ห้อง 101 มาจาก migration V2 ห้ามลบทิ้งตอนล้างข้อมูล */
    private static final long ROOM_101 = 1L;

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private MaintenanceReminderRepository reminderRepository;

    @Autowired
    private MaintenanceTicketRepository ticketRepository;

    /**
     * ลบใบแจ้งซ่อมก่อนใบแจ้งเตือนเสมอ เพราะใบที่ระบบสร้างให้มี foreign key
     * ชี้กลับไปที่ maintenance_reminder
     */
    @AfterEach
    void clearRemindersAndGeneratedTickets() {
        ticketRepository.deleteAll();
        reminderRepository.deleteAll();
    }

    static boolean dockerAvailable() {
        return DockerClientFactory.instance().isDockerAvailable();
    }

    @Test
    @DisplayName("US-14-S1 ตั้งการแจ้งเตือนตามรอบต้องได้ 201 และครั้งถัดไปเท่ากับวันเริ่ม")
    void creatingAReminderKeepsTheStartDateAsNextDue() throws Exception {
        LocalDate startDate = AppTime.today().plusDays(10);

        createReminder("""
                {"name":"ล้างแอร์ทุกไตรมาส","frequency":"QUARTERLY","startDate":"%s","roomId":%d,\
                "remindTime":"09:00","priority":"HIGH","notes":"ล้างคอยล์และเปลี่ยนไส้กรอง"}"""
                .formatted(startDate, ROOM_101))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.name").value("ล้างแอร์ทุกไตรมาส"))
                .andExpect(jsonPath("$.frequency").value("QUARTERLY"))
                .andExpect(jsonPath("$.startDate").value(startDate.toString()))
                .andExpect(jsonPath("$.nextDueDate").value(startDate.toString()))
                .andExpect(jsonPath("$.overdue").value(false))
                .andExpect(jsonPath("$.roomId").value((int) ROOM_101))
                .andExpect(jsonPath("$.roomNumber").value("101"))
                .andExpect(jsonPath("$.remindTime").value("09:00"))
                .andExpect(jsonPath("$.priority").value("HIGH"))
                .andExpect(jsonPath("$.active").value(true))
                .andExpect(jsonPath("$.lastTriggeredAt").value(nullValue()));
    }

    @Test
    @DisplayName("US-14 ใบที่วันครบกำหนดผ่านไปแล้วต้องติดธง overdue และเรียงขึ้นก่อนใบที่ยังไม่ถึง")
    void overdueRemindersAreFlaggedAndSortedFirst() throws Exception {
        createReminder(body("ตรวจเครื่องสูบน้ำ", "MONTHLY", AppTime.today().minusDays(3)))
                .andExpect(status().isCreated());
        createReminder(body("ตรวจดาดฟ้า", "ANNUAL", AppTime.today().plusMonths(2)))
                .andExpect(status().isCreated());

        mockMvc.perform(get("/api/reminders"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").value(hasSize(2)))
                .andExpect(jsonPath("$[0].name").value("ตรวจเครื่องสูบน้ำ"))
                .andExpect(jsonPath("$[0].overdue").value(true))
                .andExpect(jsonPath("$[1].name").value("ตรวจดาดฟ้า"))
                .andExpect(jsonPath("$[1].overdue").value(false));
    }

    /**
     * US-14-S2 ตัวงานประจำวันจริง ๆ ที่ ReminderScheduler เรียกทุกเช้า เทสกดเรียกเองผ่าน
     * endpoint เพื่อไม่ต้องรอถึงแปดโมง โค้ดที่ทำงานเป็นเมธอดเดียวกันทั้งสองทาง
     */
    @Test
    @DisplayName("US-14-S2 สั่งให้ไล่ใบที่ถึงกำหนด ต้องเกิดใบแจ้งซ่อม RECURRING และรอบถูกเลื่อนไปเดือนหน้า")
    void runningDueRemindersCreatesARecurringTicket() throws Exception {
        LocalDate startDate = AppTime.today().minusDays(1);
        long reminderId = createdReminderId(body("ล้างแอร์", "MONTHLY", startDate));

        mockMvc.perform(post("/api/reminders/run-due"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.createdTickets").value(1));

        mockMvc.perform(get("/api/maintenance"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").value(hasSize(1)))
                .andExpect(jsonPath("$[0].title").value("ล้างแอร์"))
                .andExpect(jsonPath("$[0].source").value("RECURRING"))
                .andExpect(jsonPath("$[0].status").value("OPEN"))
                .andExpect(jsonPath("$[0].roomNumber").value("101"))
                .andExpect(jsonPath("$[0].scheduledDate").value(startDate.toString()));

        // ใบแจ้งเตือนต้องจดเวลาที่ยิงและเลื่อนรอบไปข้างหน้าหนึ่งก้าว
        mockMvc.perform(get("/api/reminders"))
                .andExpect(jsonPath("$[0].id").value((int) reminderId))
                .andExpect(jsonPath("$[0].nextDueDate").value(startDate.plusMonths(1).toString()))
                .andExpect(jsonPath("$[0].overdue").value(false))
                .andExpect(jsonPath("$[0].lastTriggeredAt").value(notNullValue()));

        // สั่งซ้ำในวันเดียวกันต้องไม่เกิดใบที่สอง เพราะรอบถูกเลื่อนพ้นวันนี้ไปแล้ว
        mockMvc.perform(post("/api/reminders/run-due"))
                .andExpect(jsonPath("$.createdTickets").value(0));
        mockMvc.perform(get("/api/maintenance"))
                .andExpect(jsonPath("$").value(hasSize(1)));

        // และงานค้างใบนั้นต้องโผล่บนการ์ดห้องเหมือนใบที่แอดมินเปิดเอง
        mockMvc.perform(get("/api/rooms/{id}", ROOM_101))
                .andExpect(jsonPath("$.openMaintenanceCount").value(1))
                .andExpect(jsonPath("$.openMaintenanceTitle").value("ล้างแอร์"));
    }

    @Test
    @DisplayName("US-14 ใบรอบเดียวที่ยิงไปแล้วต้องถูกปิดสวิตช์เอง ไม่ยิงซ้ำในรอบถัดไป")
    void oneTimeReminderTurnsItselfOff() throws Exception {
        createReminder(body("ซ่อมประตูรั้ว", "ONE_TIME", AppTime.today()))
                .andExpect(status().isCreated());

        mockMvc.perform(post("/api/reminders/run-due"))
                .andExpect(jsonPath("$.createdTickets").value(1));

        mockMvc.perform(get("/api/reminders"))
                .andExpect(jsonPath("$[0].active").value(false))
                // ใบที่ปิดสวิตช์แล้วครั้งถัดไปค้างอยู่ที่วันเริ่ม ไม่ได้ถูกเลื่อน
                .andExpect(jsonPath("$[0].nextDueDate").value(AppTime.today().toString()));

        mockMvc.perform(post("/api/reminders/run-due"))
                .andExpect(jsonPath("$.createdTickets").value(0));
    }

    @Test
    @DisplayName("US-14 ใบที่ปิดสวิตช์ไว้ต้องถูกข้าม ถึงจะเลยกำหนดมาแล้วก็ตาม")
    void inactiveRemindersAreSkipped() throws Exception {
        long reminderId = createdReminderId(body("ล้างถังเก็บน้ำ", "MONTHLY", AppTime.today().minusDays(5)));

        mockMvc.perform(patch("/api/reminders/{id}/active", reminderId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"active":false}"""))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.active").value(false));

        mockMvc.perform(post("/api/reminders/run-due"))
                .andExpect(jsonPath("$.createdTickets").value(0));

        mockMvc.perform(get("/api/maintenance"))
                .andExpect(jsonPath("$").value(hasSize(0)));
    }

    /**
     * 31 ม.ค. บวกหนึ่งเดือนต้องหนีบเหลือวันสุดท้ายของกุมภาพันธ์ ไม่ล้นไปเดือนมีนาคม
     * กฎเดียวกับ addMonths ใน frontend/src/domain/maintenanceBoard.ts
     */
    @Test
    @DisplayName("US-14 แก้ใบรายเดือนที่เริ่มวันที่ 31 ต้องได้ครั้งถัดไปเป็นวันสิ้นเดือนของเดือนที่สั้นกว่า")
    void updateRecomputesNextDueWithEndOfMonthClamping() throws Exception {
        long reminderId = createdReminderId(body("ตรวจเครื่องสูบน้ำ", "MONTHLY", AppTime.today()));

        // ปีที่เลือกอยู่ในอดีตแน่นอน ครั้งถัดไปจึงถูกไล่ขึ้นมาจนถึงวันนี้ และทุกก้าวหลังก้าวแรก
        // จะเป็นวันที่ 28 หรือ 30 ตามเดือนที่ผ่าน ไม่มีทางเป็นวันที่ 31 อีก
        mockMvc.perform(put("/api/reminders/{id}", reminderId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body("ตรวจเครื่องสูบน้ำ", "MONTHLY", LocalDate.of(2020, 1, 31))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.startDate").value("2020-01-31"))
                .andExpect(jsonPath("$.nextDueDate").value(expectedNextDue(LocalDate.of(2020, 1, 31))))
                .andExpect(jsonPath("$.overdue").value(false));
    }

    /**
     * เคสที่เคยทำให้เกิดใบแจ้งซ่อมซ้ำ งานประจำวันยิงใบไปเมื่อเช้า แล้วแอดมินมาแก้บันทึก
     * ของใบเดียวกันตอนบ่าย ซึ่ง PUT คิดวันครบกำหนดใหม่จากวันเริ่มทุกครั้ง
     * <p>
     * ถ้าค่าที่คิดใหม่ย้อนกลับมาเป็นวันนี้ ใบจะถึงกำหนดอีกรอบทันทีและ run-due ครั้งถัดไป
     * จะสร้างใบที่สองให้รอบเดิม ขัดกับที่สัญญา API บอกว่าเรียกซ้ำในวันเดียวกันได้ 0 ใบ
     */
    @Test
    @DisplayName("US-14 แก้ใบในวันเดียวกับที่ระบบยิงไปแล้ว ต้องไม่ทำให้เกิดใบแจ้งซ่อมใบที่สอง")
    void updatingAfterTheRunKeepsTheAdvancedNextDue() throws Exception {
        LocalDate startDate = AppTime.today();
        long reminderId = createdReminderId(body("ล้างแอร์", "MONTHLY", startDate));

        mockMvc.perform(post("/api/reminders/run-due"))
                .andExpect(jsonPath("$.createdTickets").value(1));

        mockMvc.perform(put("/api/reminders/{id}", reminderId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"ล้างแอร์","frequency":"MONTHLY","startDate":"%s","roomId":%d,\
                                "notes":"ล้างคอยล์ด้วย"}""".formatted(startDate, ROOM_101)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.notes").value("ล้างคอยล์ด้วย"))
                .andExpect(jsonPath("$.nextDueDate").value(startDate.plusMonths(1).toString()))
                .andExpect(jsonPath("$.overdue").value(false));

        mockMvc.perform(post("/api/reminders/run-due"))
                .andExpect(jsonPath("$.createdTickets").value(0));
        mockMvc.perform(get("/api/maintenance"))
                .andExpect(jsonPath("$").value(hasSize(1)));
    }

    @Test
    @DisplayName("ไม่กรอกชื่อ ไม่เลือกวันเริ่ม หรือรอบที่สะกดผิด ต้องได้ 400 พร้อมข้อความไทย")
    void invalidReminderBodiesAreRejected() throws Exception {
        createReminder("""
                {"name":"  ","frequency":"MONTHLY","startDate":"2026-10-01"}""")
                .andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.detail").value("Please enter the reminder name"));

        createReminder("""
                {"name":"ล้างแอร์","frequency":"MONTHLY"}""")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value("Please choose a start date"));

        createReminder("""
                {"name":"ล้างแอร์","frequency":"WEEKLY","startDate":"2026-10-01"}""")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail")
                        .value("Frequency must be ONE_TIME, MONTHLY, QUARTERLY or ANNUAL"));
    }

    @Test
    @DisplayName("ตั้งการแจ้งเตือนให้ห้องที่ไม่มีต้องได้ 404 ที่บอกว่าไม่พบอะไร id ไหน")
    void unknownRoomIsNotFound() throws Exception {
        createReminder("""
                {"name":"ล้างแอร์","frequency":"MONTHLY","startDate":"2026-10-01","roomId":999}""")
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.detail").value("No unit with id 999"));
    }

    @Test
    @DisplayName("เปิดปิดสวิตช์ใบที่ไม่มีต้องได้ 404 ที่บอกว่าไม่พบการแจ้งเตือน id ไหน")
    void togglingAnUnknownReminderIsNotFound() throws Exception {
        mockMvc.perform(patch("/api/reminders/{id}/active", 999L)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"active":true}"""))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.detail").value("No reminder with id 999"));
    }

    /**
     * คำตอบที่คาดไว้ของการไล่รอบรายเดือนจากวันเริ่มจนถึงวันนี้ คิดด้วยสูตรเดียวกับที่
     * nextOccurrence ฝั่งหน้าเว็บใช้ คือเดินทีละก้าวด้วย plusMonths ที่หนีบสิ้นเดือนให้เอง
     * <p>
     * ที่ต้องคิดในเทสแทนที่จะเขียนวันที่ตายตัว เพราะคำตอบขึ้นกับว่ารันวันไหน
     */
    private static String expectedNextDue(LocalDate startDate) {
        LocalDate today = AppTime.today();
        LocalDate next = startDate;
        while (next.isBefore(today)) {
            next = next.plusMonths(1);
        }
        return next.toString();
    }

    private ResultActions createReminder(String body) throws Exception {
        return mockMvc.perform(post("/api/reminders")
                .contentType(MediaType.APPLICATION_JSON)
                .content(body));
    }

    private long createdReminderId(String body) throws Exception {
        String json = createReminder(body)
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return ((Number) JsonPath.read(json, "$.id")).longValue();
    }

    private static String body(String name, String frequency, LocalDate startDate) {
        return """
                {"name":"%s","frequency":"%s","startDate":"%s","roomId":%d}"""
                .formatted(name, frequency, startDate, ROOM_101);
    }
}
