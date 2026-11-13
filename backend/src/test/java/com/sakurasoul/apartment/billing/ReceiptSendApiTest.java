package com.sakurasoul.apartment.billing;

import com.jayway.jsonpath.JsonPath;
import com.sakurasoul.apartment.RecordingMailSender;
import com.sakurasoul.apartment.TestcontainersConfiguration;
import com.sakurasoul.apartment.billing.ReceiptDtos.SendReceiptsResponse;
import com.sakurasoul.apartment.billing.ReceiptDtos.SentReceipt;
import com.sakurasoul.apartment.billing.ReceiptDtos.SkipReason;
import com.sakurasoul.apartment.billing.ReceiptDtos.SkippedReceipt;
import com.sakurasoul.apartment.lease.LeaseRepository;
import com.sakurasoul.apartment.pdf.PdfImages;
import com.sakurasoul.apartment.promptpay.QrCodes;
import com.sakurasoul.apartment.tenant.Tenant;
import com.sakurasoul.apartment.tenant.TenantRepository;
import jakarta.mail.Message;
import jakarta.mail.Multipart;
import jakarta.mail.Part;
import jakarta.mail.internet.InternetAddress;
import jakarta.mail.internet.MimeMessage;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
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
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.testcontainers.DockerClientFactory;

import java.awt.image.BufferedImage;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;
import java.util.stream.LongStream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.tuple;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * เทสของการส่งใบเสร็จทางอีเมล (SSK-143) ระดับ HTTP ยิงผ่าน MockMvc ทะลุถึง PostgreSQL ตัวจริง
 * <p>
 * อีเมลไม่ได้ออกไปที่ Mailpit แต่ตกที่ RecordingMailSender ใน TestcontainersConfiguration
 * เทสจึงเปิดอีเมลที่ถูกส่งได้ทั้งฉบับ (ผู้รับ หัวเรื่อง เนื้อความ ไฟล์แนบ) และสั่งให้เมลเซิร์ฟเวอร์ล่มได้
 * เพื่อพิสูจน์กฎที่สำคัญที่สุดของ endpoint นี้ คือ 503 ออกได้เฉพาะตอนที่ยังไม่มีอีเมลฉบับไหนออกไป
 * <p>
 * เครื่องที่ไม่ได้เปิด Docker จะข้ามเทสชุดนี้ ไม่ใช่ล้ม ส่วน CI มี Docker อยู่แล้วจะรันจริง
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
@EnabledIf("dockerAvailable")
// ทุก endpoint ต้องล็อกอินแล้วตั้งแต่ SSK-28 ชุดนี้จึงยิงในนามผู้ใช้ปลอม
@WithMockUser
class ReceiptSendApiTest {

    /** ห้อง 104 กับ 105 มาจาก migration V2 ห้ามลบทิ้งตอนล้างข้อมูล ไม่ชนกับห้องที่เทสคลาสอื่นใช้ */
    private static final long ROOM_104 = 4L;
    private static final long ROOM_105 = 5L;

    private static final String EMAIL = "manee.send@example.com";

    /** อัตราชุดเดียวกับ ReceiptApiTest ยอดรวมของใบที่ออกด้วยหน่วย 120 / 15 จึงเป็น ฿5,290.00 */
    private static final String LEASE_BODY = """
            {"roomId":%d,"tenantId":%d,"startDate":"2026-09-01","endDate":null,\
            "monthlyRent":3500,"billingCycle":"MONTHLY","securityDeposit":7000,\
            "electricRatePerUnit":9.5,"waterRatePerUnit":20,\
            "commonAreaFee":350,"internetFee":0}""";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JdbcClient jdbc;

    @Autowired
    private RecordingMailSender mailSender;

    @Autowired
    private LeaseRepository leaseRepository;

    @Autowired
    private TenantRepository tenantRepository;

    @Autowired
    private ReceiptDispatchService receiptDispatchService;

    private Tenant withEmail;
    private Tenant withoutEmail;
    private long emailLeaseId;
    private long noEmailLeaseId;

    static boolean dockerAvailable() {
        return DockerClientFactory.instance().isDockerAvailable();
    }

    /**
     * ผู้เช่าสองคน คนหนึ่งมีอีเมล อีกคนไม่มี เลขบัตรขึ้นต้นด้วย 16 เพื่อไม่ให้ชนกับเทสคลาสอื่นที่ใช้
     * container เดียวกัน (V6 ตั้ง tenant_national_id_uk ไว้ เลขซ้ำข้ามคลาสจะพังตอนบันทึกทันที)
     */
    @BeforeEach
    void createTenantsAndLeases() throws Exception {
        mailSender.reset();
        withEmail = tenantRepository.saveAndFlush(
                new Tenant("มานี รักเรียน", "1600000000001", "manee.s", "082-600-0001", EMAIL));
        withoutEmail = tenantRepository.saveAndFlush(
                new Tenant("Kenji Watanabe", "1600000000002", "kenji.s", "082-600-0002", null));
        emailLeaseId = createLease(ROOM_104, withEmail);
        noEmailLeaseId = createLease(ROOM_105, withoutEmail);
    }

    /** ลบใบเสร็จก่อนสัญญา และลบสัญญาก่อนผู้เช่าเสมอ เพราะ foreign key ไล่กันเป็นทอด ๆ */
    @AfterEach
    void clearData() {
        mailSender.reset();
        BillingTables.clear(jdbc);
        leaseRepository.deleteAll();
        tenantRepository.deleteAll(List.of(withEmail, withoutEmail));
        // ค่าตั้งใช้ร่วมกันทุกเทสคลาส เทสของบัญชีรับเงิน (SSK-168) ต้องคืนเป็นไม่มีบัญชี
        jdbc.sql("""
                UPDATE apartment_config
                SET bank_name = NULL, bank_account_name = NULL, bank_account_number = NULL, bank_prompt_pay_id = NULL
                WHERE id = 1""").update();
    }

    /** อีเมลเป็นข้อความธรรมดา QR อยู่ใน PDF ที่แนบ ไฟล์แนบยังมีไฟล์เดียว และ QR ในไฟล์เป็นข้อความเดียวกับที่ API ตอบ */
    @Test
    @DisplayName("SSK-168 ส่งใบที่ต้องจ่ายและมีสำเนาบัญชี อีเมลมีบล็อกบัญชี ไฟล์แนบยังมีไฟล์เดียวและมีรูป QR ของยอดเดียวกัน")
    void aBillWithABankAccountIsSentWithThePaymentDetailsAndTheQrInThePdf() throws Exception {
        mockMvc.perform(put("/api/apartment-config/bank-account")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"bankName":"Kasikornbank","accountName":"Sakura Soul Apartment",\
                                "accountNumber":"012-3-45678-9","promptPayId":"081-234-5678"}"""))
                .andExpect(status().isOk());
        long receiptId = createdReceiptId(emailLeaseId, "2026-09");
        String payload = JsonPath.read(mockMvc.perform(get("/api/receipts/{id}", receiptId))
                .andReturn().getResponse().getContentAsString(), "$.promptPayPayload");

        send(receiptId).andExpect(status().isOk());

        MailParts parts = MailParts.of(mailSender.sent().getFirst());
        assertThat(parts.text().replace("\r\n", "\n")).contains("""
                Total: ฿5,290.00
                Paid so far: ฿0.00
                Amount due: ฿5,290.00
                Due date: 5 Oct 2026

                Payment details
                Bank: Kasikornbank
                Account name: Sakura Soul Apartment
                Account number: 012-3-45678-9
                PromptPay QR: scan the QR code in the attached PDF to pay ฿5,290.00
                """);
        assertThat(parts.attachments()).singleElement().satisfies(attachment -> {
            List<BufferedImage> images = PdfImages.of(attachment.content());
            assertThat(images).hasSize(1);
            assertThat(QrCodes.decode(images.getFirst())).isEqualTo(payload);
        });
    }

    @Test
    @DisplayName("SSK-143 ส่งใบค้างได้ 200 อีเมลถึงผู้เช่าพร้อม PDF ของใบนั้น และใบถูกบันทึกว่าส่งแล้วหนึ่งครั้ง")
    void sendingEmailsTheReceiptWithItsPdfAndRecordsIt() throws Exception {
        long receiptId = createdReceiptId(emailLeaseId, "2026-09");
        String receiptNo = receiptNo(receiptId);

        send(receiptId)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.sent").value(hasSize(1)))
                .andExpect(jsonPath("$.sent[0].receiptId").value(receiptId))
                .andExpect(jsonPath("$.sent[0].receiptNo").value(receiptNo))
                .andExpect(jsonPath("$.sent[0].tenantName").value("มานี รักเรียน"))
                .andExpect(jsonPath("$.sent[0].email").value(EMAIL))
                .andExpect(jsonPath("$.sent[0].sentAt").isNotEmpty())
                .andExpect(jsonPath("$.sent[0].sentCount").value(1))
                .andExpect(jsonPath("$.skipped").value(hasSize(0)));

        assertThat(mailSender.sent()).hasSize(1);
        MimeMessage mail = mailSender.sent().get(0);

        assertThat(mail.getRecipients(Message.RecipientType.TO))
                .extracting(address -> ((InternetAddress) address).getAddress())
                .containsExactly(EMAIL);
        InternetAddress from = (InternetAddress) mail.getFrom()[0];
        assertThat(from.getAddress()).isEqualTo("billing@sakura-soul.local");
        assertThat(from.getPersonal()).isEqualTo("Sakura Soul Apartment");
        assertThat(mail.getSubject())
                .isEqualTo("Receipt " + receiptNo + " for Sep 2026 - ฿5,290.00 due 5 Oct 2026");

        MailParts parts = MailParts.of(mail);
        assertThat(parts.text())
                .as("ชื่อภาษาไทยต้องไม่เพี้ยน และยอดกับวันครบกำหนดต้องมาจากใบนี้")
                .contains("Dear มานี รักเรียน,")
                .contains("(Unit 104)")
                .contains("Amount due: ฿5,290.00")
                .contains("Due date: 5 Oct 2026");
        assertThat(parts.attachments()).singleElement().satisfies(attachment -> {
            assertThat(attachment.fileName()).isEqualTo(receiptNo + ".pdf");
            assertThat(attachment.contentType()).startsWith("application/pdf");
            assertThat(pdfText(attachment.content()))
                    .as("ไฟล์แนบต้องเป็น PDF ของใบที่ส่ง ไม่ใช่ใบอื่น")
                    .contains(receiptNo)
                    .contains("฿5,290.00");
        });

        mockMvc.perform(get("/api/receipts").param("leaseId", String.valueOf(emailLeaseId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].tenantEmail").value(EMAIL))
                .andExpect(jsonPath("$[0].sentCount").value(1))
                .andExpect(jsonPath("$[0].lastSentAt").isNotEmpty());
    }

    @Test
    @DisplayName("SSK-143 ผู้เช่าที่ไม่มีอีเมลถูกข้ามด้วย NO_EMAIL ไม่มีอีเมลออก และใบไม่ถูกนับว่าส่งแล้ว")
    void tenantWithoutEmailIsSkipped() throws Exception {
        long receiptId = createdReceiptId(noEmailLeaseId, "2026-09");

        send(receiptId)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.sent").value(hasSize(0)))
                .andExpect(jsonPath("$.skipped").value(hasSize(1)))
                .andExpect(jsonPath("$.skipped[0].receiptId").value(receiptId))
                .andExpect(jsonPath("$.skipped[0].tenantName").value("Kenji Watanabe"))
                .andExpect(jsonPath("$.skipped[0].reason").value("NO_EMAIL"));

        assertThat(mailSender.sent()).isEmpty();
        mockMvc.perform(get("/api/receipts/{id}", receiptId))
                .andExpect(jsonPath("$.tenantEmail").isEmpty())
                .andExpect(jsonPath("$.sentCount").value(0))
                .andExpect(jsonPath("$.lastSentAt").isEmpty());
    }

    @Test
    @DisplayName("SSK-143 ส่งหลายใบตามลำดับที่ขอ id ซ้ำนับเป็นใบเดียว และใบที่ไม่มีอีเมลรายงานแยก")
    void manyReceiptsAreSentInRequestOrderWithoutDuplicates() throws Exception {
        long noEmail = createdReceiptId(noEmailLeaseId, "2026-09");
        long september = createdReceiptId(emailLeaseId, "2026-09");
        long october = createdReceiptId(emailLeaseId, "2026-10");

        String json = send(noEmail, october, september, october)
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();

        assertThat(ids(json, "$.sent[*].receiptId")).containsExactly(october, september);
        assertThat(ids(json, "$.skipped[*].receiptId")).containsExactly(noEmail);
        assertThat(mailSender.sent())
                .extracting(MimeMessage::getSubject)
                .satisfiesExactly(
                        subject -> assertThat(subject).contains("for Oct 2026"),
                        subject -> assertThat(subject).contains("for Sep 2026"));
    }

    @Test
    @DisplayName("SSK-143 ไม่ส่ง receiptIds หรือส่งรายการว่างได้ 400 เกิน 100 ใบก็ได้ 400 และไม่มีอีเมลออก")
    void emptyOrOversizedRequestsAreRejected() throws Exception {
        sendBody("{}")
                .andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.detail").value("Please choose at least one receipt"));

        sendBody("""
                {"receiptIds":[]}""")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value("Please choose at least one receipt"));

        String hundredAndOne = LongStream.rangeClosed(1, 101)
                .mapToObj(String::valueOf)
                .collect(Collectors.joining(","));
        sendBody("{\"receiptIds\":[" + hundredAndOne + "]}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value("You can send at most 100 receipts at a time"));

        assertThat(mailSender.sent()).isEmpty();
    }

    @Test
    @DisplayName("SSK-143 มี id ที่ไม่พบได้ 404 และไม่มีใบไหนถูกส่ง แม้ใบอื่นในคำขอจะมีอยู่จริง")
    void unknownReceiptIsNotFoundAndNothingIsSent() throws Exception {
        long receiptId = createdReceiptId(emailLeaseId, "2026-09");

        send(receiptId, 999999L)
                .andExpect(status().isNotFound())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.detail").value("No receipt with id 999999"));

        assertThat(mailSender.sent()).isEmpty();
        mockMvc.perform(get("/api/receipts/{id}", receiptId))
                .andExpect(jsonPath("$.sentCount").value(0));
    }

    @Test
    @DisplayName("SSK-143 เมลเซิร์ฟเวอร์ล่มตั้งแต่ใบแรกได้ 503 เป็น ProblemDetail และไม่มีใบไหนถูกนับว่าส่งแล้ว")
    void mailServerDownBeforeAnythingWentOutIsServiceUnavailable() throws Exception {
        long receiptId = createdReceiptId(emailLeaseId, "2026-09");
        mailSender.failAfter(0);

        send(receiptId)
                .andExpect(status().isServiceUnavailable())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.detail").value("The mail server is not reachable. Please try again later"));

        mockMvc.perform(get("/api/receipts/{id}", receiptId))
                .andExpect(jsonPath("$.sentCount").value(0))
                .andExpect(jsonPath("$.lastSentAt").isEmpty());
    }

    /**
     * กฎที่สำคัญที่สุดของ endpoint นี้ ถ้าอีเมลฉบับแรกออกไปแล้ว ห้ามตอบ 503 เพราะผู้ใช้จะเข้าใจว่า
     * ไม่มีอะไรออกไปแล้วกดส่งซ้ำ ผู้เช่าคนแรกจะได้อีเมลฉบับเดิมสองรอบ
     */
    @Test
    @DisplayName("SSK-143 เมลเซิร์ฟเวอร์ล่มหลังส่งใบแรกไปแล้วได้ 200 ใบแรกถูกบันทึก ใบที่เหลือเป็น SEND_FAILED")
    void failureAfterTheFirstSendIsReportedPerReceipt() throws Exception {
        long september = createdReceiptId(emailLeaseId, "2026-09");
        long october = createdReceiptId(emailLeaseId, "2026-10");
        mailSender.failAfter(1);

        send(september, october)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.sent").value(hasSize(1)))
                .andExpect(jsonPath("$.sent[0].receiptId").value(september))
                .andExpect(jsonPath("$.skipped").value(hasSize(1)))
                .andExpect(jsonPath("$.skipped[0].receiptId").value(october))
                .andExpect(jsonPath("$.skipped[0].reason").value("SEND_FAILED"));

        mockMvc.perform(get("/api/receipts/{id}", september))
                .andExpect(jsonPath("$.sentCount").value(1));
        mockMvc.perform(get("/api/receipts/{id}", october))
                .andExpect(jsonPath("$.sentCount").value(0))
                .andExpect(jsonPath("$.lastSentAt").isEmpty());
    }

    @Test
    @DisplayName("SSK-143 ส่งใบเดิมซ้ำได้ และนับเพิ่มทุกครั้ง")
    void resendingCountsAgain() throws Exception {
        long receiptId = createdReceiptId(emailLeaseId, "2026-09");

        send(receiptId).andExpect(status().isOk());
        send(receiptId)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.sent[0].sentCount").value(2));

        assertThat(mailSender.sent()).hasSize(2);
        mockMvc.perform(get("/api/receipts/{id}", receiptId))
                .andExpect(jsonPath("$.sentCount").value(2));
    }

    @Test
    @DisplayName("SSK-143 ใบที่จ่ายแล้วส่งได้เป็นสำเนา หัวเรื่องกับเนื้อความบอกว่าจ่ายแล้ว")
    void paidReceiptIsSentAsAPaidCopy() throws Exception {
        long receiptId = createdReceiptId(emailLeaseId, "2026-09");
        String receiptNo = receiptNo(receiptId);
        mockMvc.perform(post("/api/receipts/{id}/pay", receiptId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"paymentMethod":"Cash"}"""))
                .andExpect(status().isOk());

        send(receiptId).andExpect(status().isOk());

        MimeMessage mail = mailSender.sent().get(0);
        assertThat(mail.getSubject()).isEqualTo("Receipt " + receiptNo + " for Sep 2026 - paid");
        assertThat(MailParts.of(mail).text())
                .contains("a copy of receipt " + receiptNo)
                .contains("Total: ฿5,290.00")
                .contains("(Cash)")
                .contains("Thank you for your payment.")
                .doesNotContain("Amount due");
    }

    /**
     * รอบเตือนรายเดือนส่งหนึ่งฉบับต่อสัญญา (SSK-163) ใบ ก.ย. ถูกยกเข้าใบ ต.ค. แล้วจึงไม่ถูกส่ง
     * อีเมลของใบ ต.ค. บอกที่มาของยอดที่สูงกว่าปกติ และ PDF ที่แนบพิมพ์บรรทัดยอดยกมาพร้อมเลขที่ของใบที่ยกมา
     */
    @Test
    @DisplayName("SSK-163 รอบเตือนส่งใบล่าสุดของแต่ละสัญญาที่ยังค้าง ใบที่ถูกยกยอดไม่ถูกส่งซ้ำ")
    void theMonthlyReminderSendsTheLatestBillOfEachLeaseOnce() throws Exception {
        long september = createdReceiptId(emailLeaseId, "2026-09");
        long october = createdReceiptId(emailLeaseId, "2026-10");
        long noEmailOctober = createdReceiptId(noEmailLeaseId, "2026-10");

        SendReceiptsResponse result = receiptDispatchService.sendAllDue();

        assertThat(result.sent()).extracting(SentReceipt::receiptId).containsExactly(october);
        assertThat(result.skipped()).extracting(SkippedReceipt::receiptId, SkippedReceipt::reason)
                .containsExactly(tuple(noEmailOctober, SkipReason.NO_EMAIL));
        MimeMessage mail = mailSender.sent().getFirst();
        assertThat(mail.getSubject())
                .isEqualTo("Receipt " + receiptNo(october) + " for Oct 2026 - ฿10,580.00 due 5 Nov 2026");
        MailParts parts = MailParts.of(mail);
        assertThat(parts.text())
                .contains("Total: ฿10,580.00\nIncludes previous balance ฿5,290.00 (" + receiptNo(september) + ")\n");
        assertThat(pdfText(parts.attachments().getFirst().content()))
                .contains("Previous balance")
                .contains(receiptNo(september))
                .contains("Not paid yet. Please pay by 5 Nov 2026");
    }

    @Test
    @DisplayName("SSK-164 ส่งใบที่ถูกยกยอดแล้วได้อีเมลแบบถูกยกยอด PDF บอกบิลที่ต้องจ่ายแทน ไม่บอกให้จ่ายใบนี้")
    void sendingACarriedReceiptPointsAtTheNewBill() throws Exception {
        long september = createdReceiptId(emailLeaseId, "2026-09");
        long october = createdReceiptId(emailLeaseId, "2026-10");

        send(september).andExpect(status().isOk());

        MimeMessage mail = mailSender.sent().getFirst();
        assertThat(mail.getSubject()).isEqualTo(
                "Receipt " + receiptNo(september) + " for Sep 2026 - carried to " + receiptNo(october));
        assertThat(pdfText(MailParts.of(mail).attachments().getFirst().content()))
                .contains("Unpaid balance carried to " + receiptNo(october))
                .doesNotContain("Please pay by");
    }

    @Test
    @DisplayName("SSK-163 PDF ของบิลที่จ่ายไปบางส่วนพิมพ์ยอดที่จ่ายแล้วกับยอดที่ยังต้องจ่าย")
    void aPartlyPaidBillPrintsWhatIsLeft() throws Exception {
        long september = createdReceiptId(emailLeaseId, "2026-09");
        mockMvc.perform(post("/api/receipts/{id}/payments", september)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"amount":2000,"method":"CASH"}"""))
                .andExpect(status().isCreated());

        byte[] pdf = mockMvc.perform(get("/api/receipts/{id}/pdf", september))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsByteArray();

        assertThat(pdfText(pdf))
                .contains("Paid ฿2,000.00")
                .contains("Balance due ฿3,290.00")
                .contains("Please pay by 5 Oct 2026")
                .doesNotContain("Not paid yet");
    }

    private long createLease(long roomId, Tenant tenant) throws Exception {
        String json = mockMvc.perform(post("/api/leases")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(LEASE_BODY.formatted(roomId, tenant.getId())))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return ((Number) JsonPath.read(json, "$.id")).longValue();
    }

    /** ออกใบด้วยหน่วยไฟ 120 น้ำ 15 ยอดรวม ฿5,290.00 ตามอัตราใน LEASE_BODY */
    private long createdReceiptId(long leaseId, String billingMonth) throws Exception {
        String json = mockMvc.perform(post("/api/receipts")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"leaseId":%d,"billingMonth":"%s","electricUnits":120,"waterUnits":15}"""
                                .formatted(leaseId, billingMonth)))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return ((Number) JsonPath.read(json, "$.id")).longValue();
    }

    private String receiptNo(long receiptId) throws Exception {
        return JsonPath.read(mockMvc.perform(get("/api/receipts/{id}", receiptId))
                .andReturn().getResponse().getContentAsString(), "$.receiptNo");
    }

    private ResultActions send(long... receiptIds) throws Exception {
        String ids = LongStream.of(receiptIds).mapToObj(String::valueOf).collect(Collectors.joining(","));
        return sendBody("{\"receiptIds\":[" + ids + "]}");
    }

    private ResultActions sendBody(String body) throws Exception {
        return mockMvc.perform(post("/api/receipts/send")
                .contentType(MediaType.APPLICATION_JSON)
                .content(body));
    }

    /** id ใน JSON ตัวเล็กถูกอ่านเป็น Integer แปลงเป็น long ก่อนเทียบ */
    private static List<Long> ids(String json, String path) {
        List<Number> numbers = JsonPath.read(json, path);
        return numbers.stream().map(Number::longValue).toList();
    }

    private static String pdfText(byte[] pdf) throws Exception {
        assertThat(new String(pdf, 0, 4, StandardCharsets.ISO_8859_1)).isEqualTo("%PDF");
        try (PDDocument document = PDDocument.load(pdf)) {
            return new PDFTextStripper().getText(document);
        }
    }

    private record Attachment(String fileName, String contentType, byte[] content) {
    }

    /**
     * แยกเนื้อความกับไฟล์แนบออกจากอีเมลหนึ่งฉบับ
     * <p>
     * MimeMessageHelper แบบ multipart ห่อเนื้อความไว้ใน multipart ซ้อนอีกชั้น จึงต้องไล่ลงไปทุกชั้น
     * ไม่ใช่เปิดแค่ส่วนแรกของชั้นนอก
     */
    private record MailParts(String text, List<Attachment> attachments) {

        static MailParts of(MimeMessage message) throws Exception {
            StringBuilder text = new StringBuilder();
            List<Attachment> attachments = new ArrayList<>();
            collect(message, text, attachments);
            return new MailParts(text.toString(), attachments);
        }

        private static void collect(Part part, StringBuilder text, List<Attachment> attachments)
                throws Exception {
            if (part.isMimeType("multipart/*")) {
                Multipart multipart = (Multipart) part.getContent();
                for (int i = 0; i < multipart.getCount(); i++) {
                    collect(multipart.getBodyPart(i), text, attachments);
                }
            } else if (Part.ATTACHMENT.equalsIgnoreCase(part.getDisposition())) {
                attachments.add(new Attachment(part.getFileName(), part.getContentType(),
                        part.getInputStream().readAllBytes()));
            } else if (part.isMimeType("text/plain")) {
                text.append((String) part.getContent());
            }
        }
    }
}
