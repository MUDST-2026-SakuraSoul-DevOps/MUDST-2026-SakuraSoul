package com.sakurasoul.apartment.billing;

import com.jayway.jsonpath.JsonPath;
import com.sakurasoul.apartment.TestcontainersConfiguration;
import com.sakurasoul.apartment.lease.LeaseRepository;
import com.sakurasoul.apartment.tenant.Tenant;
import com.sakurasoul.apartment.tenant.TenantRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIf;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.DockerClientFactory;

import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;

import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * หนี้ค้างของแต่ละสัญญา (SSK-163) ผ่าน API ถึง PostgreSQL จริง
 * <p>
 * สัญญาใช้อัตราตั้งต้นของตึก ใบ ส.ค. (ไฟ 85 น้ำ 15) 5,000.00 ครบกำหนด 5 ก.ย. ใบ ก.ย. (ไฟ 102 น้ำ 13) 5,100.00 ครบกำหนด 5 ต.ค.
 * จำนวนวันที่เกินกำหนดนับถึงวันนี้ตามเวลาไทย เทสจึงคิดค่าที่คาดจากวันที่รันเอง ขอบของช่วงอายุหนี้อยู่ที่ DebtResponseTest
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
@EnabledIf("dockerAvailable")
@WithMockUser
class DebtApiTest {

    private static final long ROOM_110 = 10L;
    private static final long ROOM_111 = 11L;
    private static final long ROOM_112 = 12L;

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JdbcClient jdbc;

    @Autowired
    private LeaseRepository leaseRepository;

    @Autowired
    private TenantRepository tenantRepository;

    private final List<Tenant> tenants = new ArrayList<>();

    static boolean dockerAvailable() {
        return DockerClientFactory.instance().isDockerAvailable();
    }

    @AfterEach
    void clearData() {
        BillingTables.clear(jdbc);
        leaseRepository.deleteAll();
        tenantRepository.deleteAll(tenants);
        tenants.clear();
    }

    @Test
    @DisplayName("SSK-163 หนึ่งแถวต่อสัญญาที่ยังค้าง ค้างนานสุดก่อน รวมสัญญาที่ปิดแล้ว สัญญาที่จ่ายครบไม่อยู่ในรายการ")
    void everyLeaseThatStillOwesLongestFirst() throws Exception {
        long recent = createLease(ROOM_110, "2300000000001", "2026-07-01", "null");
        long ended = createLease(ROOM_111, "2300000000002", "2026-07-01", "\"2026-08-31\"");
        long settled = createLease(ROOM_112, "2300000000003", "2026-07-01", "null");
        long recentBill = issue(recent, "2026-09", "102", "13");
        long endedBill = issue(ended, "2026-08", "85", "15");
        long settledBill = issue(settled, "2026-08", "85", "15");
        mockMvc.perform(post("/api/receipts/{id}/pay", settledBill)).andExpect(status().isOk());

        mockMvc.perform(get("/api/debts"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").value(hasSize(2)))
                .andExpect(jsonPath("$[0].leaseId").value(ended))
                .andExpect(jsonPath("$[0].roomNumber").value("111"))
                .andExpect(jsonPath("$[0].tenantName").value("ผู้เช่า 2"))
                .andExpect(jsonPath("$[0].receiptId").value(endedBill))
                .andExpect(jsonPath("$[0].billingMonth").value("2026-08"))
                .andExpect(jsonPath("$[0].balanceDue").value(5000.00))
                .andExpect(jsonPath("$[0].oldestUnpaidDueDate").value("2026-09-05"))
                .andExpect(jsonPath("$[0].daysOverdue").value(daysSince("2026-09-05")))
                // เลย 5 ก.ย. มาเกิน 60 วันแล้วตั้งแต่ 5 พ.ย. 2569
                .andExpect(jsonPath("$[0].bucket").value("61+"))
                .andExpect(jsonPath("$[1].leaseId").value(recent))
                .andExpect(jsonPath("$[1].receiptId").value(recentBill))
                .andExpect(jsonPath("$[1].oldestUnpaidDueDate").value("2026-10-05"))
                .andExpect(jsonPath("$[1].daysOverdue").value(daysSince("2026-10-05")))
                .andExpect(jsonPath("$[1].bucket").value(DebtResponse.bucket(daysSince("2026-10-05"))));
    }

    @Test
    @DisplayName("SSK-163 ใบที่ถูกยกยอดไม่ถูกนับซ้ำ แถวมาจากใบล่าสุด แต่อายุหนี้นับจากใบเก่าสุดที่ยังค้าง")
    void aCarriedBillIsCountedOnceThroughTheLatestBill() throws Exception {
        long lease = createLease(ROOM_110, "2300000000001", "2026-07-01", "null");
        issue(lease, "2026-08", "85", "15");
        long september = issue(lease, "2026-09", "102", "13");

        mockMvc.perform(get("/api/debts"))
                .andExpect(jsonPath("$").value(hasSize(1)))
                .andExpect(jsonPath("$[0].receiptId").value(september))
                .andExpect(jsonPath("$[0].balanceDue").value(10100.00))
                .andExpect(jsonPath("$[0].oldestUnpaidDueDate").value("2026-09-05"));
    }

    private static long daysSince(String date) {
        return ChronoUnit.DAYS.between(LocalDate.parse(date), LocalDate.now(ZoneId.of("Asia/Bangkok")));
    }

    /** body หกช่องแบบฟอร์มหน้าเว็บ อัตราจากค่าตั้งของตึก ผู้เช่าชื่อตามเลขท้ายของเลขบัตร */
    private long createLease(long roomId, String nationalId, String startDate, String endDate) throws Exception {
        String digit = nationalId.substring(12);
        Tenant tenant = tenantRepository.saveAndFlush(
                new Tenant("ผู้เช่า " + digit, nationalId, "debt." + digit, "082-230-000" + digit, null));
        tenants.add(tenant);
        String json = mockMvc.perform(post("/api/leases")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"roomId":%d,"tenantId":%d,"startDate":"%s","endDate":%s,\
                                "monthlyRent":9999,"billingCycle":"MONTHLY"}"""
                                .formatted(roomId, tenant.getId(), startDate, endDate)))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return ((Number) JsonPath.read(json, "$.id")).longValue();
    }

    private long issue(long leaseId, String month, String electricUnits, String waterUnits) throws Exception {
        String json = mockMvc.perform(post("/api/receipts")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"leaseId":%d,"billingMonth":"%s","electricUnits":%s,"waterUnits":%s}"""
                                .formatted(leaseId, month, electricUnits, waterUnits)))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return ((Number) JsonPath.read(json, "$.id")).longValue();
    }
}
