package com.sakurasoul.apartment.billing;

import com.sakurasoul.apartment.RecordingMailSender;
import com.sakurasoul.apartment.billing.ReceiptDtos.ReceiptResponse;
import com.sakurasoul.apartment.pdf.PdfDocument;
import jakarta.mail.Message;
import jakarta.mail.Multipart;
import jakarta.mail.Part;
import jakarta.mail.internet.InternetAddress;
import jakarta.mail.internet.MimeMessage;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * หน้าตาอีเมลใบเสร็จ (SSK-143) เทียบข้อความตรงตัวทั้งฉบับ
 * <p>
 * ข้อความชุดนี้เขียนไว้ใน docs/api-contract-billing.md หัวข้อ "หน้าตาอีเมล" ด้วย ถ้าเทสนี้แดงเพราะตั้งใจแก้ข้อความ
 * ให้แก้เอกสารให้ตรงกันในคอมมิตเดียวกัน ไม่งั้นสัญญากับของจริงจะเริ่มเขียนคนละอย่าง
 */
class ReceiptMailerTest {

    private static final String PENDING_BODY = """
            Dear สมชาย ใจดี,

            Please find attached receipt RC-2026-0003 for Sep 2026 (Unit 101).

            Amount due: ฿5,290.00
            Due date: 5 Oct 2026

            If you have already paid, please ignore this email.

            Sakura Soul Apartment
            """;

    private static final String PAID_BODY = """
            Dear สมชาย ใจดี,

            Please find attached a copy of receipt RC-2026-0003 for Sep 2026 (Unit 101).

            Total: ฿5,290.00
            Paid on 11 Sep 2026 (Cash)

            Thank you for your payment.

            Sakura Soul Apartment
            """;

    @Test
    @DisplayName("SSK-143 ใบค้างบอกยอดกับวันครบกำหนดตั้งแต่หัวเรื่อง")
    void pendingSubjectShowsTheAmountAndDueDate() {
        assertThat(ReceiptMailer.subject(pending()))
                .isEqualTo("Receipt RC-2026-0003 for Sep 2026 - ฿5,290.00 due 5 Oct 2026");
    }

    @Test
    @DisplayName("SSK-143 ใบที่จ่ายแล้วบอกว่าจ่ายแล้วในหัวเรื่อง ผู้เช่าจะได้ไม่นึกว่าโดนเก็บซ้ำ")
    void paidSubjectSaysItIsPaid() {
        assertThat(ReceiptMailer.subject(paid("Cash"))).isEqualTo("Receipt RC-2026-0003 for Sep 2026 - paid");
    }

    @Test
    @DisplayName("SSK-143 เนื้อความของใบค้างตรงตามสัญญาทุกบรรทัด")
    void pendingBodyMatchesTheContract() {
        assertThat(ReceiptMailer.body(pending())).isEqualTo(PENDING_BODY);
    }

    @Test
    @DisplayName("SSK-143 เนื้อความของใบที่จ่ายแล้วบอกวันที่จ่ายตามเวลาไทยพร้อมช่องทาง")
    void paidBodyMatchesTheContract() {
        assertThat(ReceiptMailer.body(paid("Cash"))).isEqualTo(PAID_BODY);
    }

    @Test
    @DisplayName("SSK-143 ใบที่จ่ายแล้วแต่ไม่ได้บันทึกช่องทาง ไม่มีวงเล็บว่างท้ายบรรทัด Paid on")
    void paidBodyWithoutPaymentMethodHasNoEmptyBrackets() {
        assertThat(ReceiptMailer.body(paid(null)))
                .contains("Paid on 11 Sep 2026\n")
                .doesNotContain("()");
    }

    @Test
    @DisplayName("SSK-143 ส่งถึงอีเมลของผู้เช่า ผู้ส่งเป็นชื่อหอ และแนบ PDF ชื่อตามเลขที่ใบเสร็จ")
    void sendAddressesTheTenantAndAttachesThePdf() throws Exception {
        RecordingMailSender mailSender = new RecordingMailSender();
        ReceiptMailer mailer = new ReceiptMailer(mailSender, new AppMailProperties(null));

        mailer.send(pending(), new PdfDocument("RC-2026-0003.pdf", "%PDF-1.4".getBytes()));

        assertThat(mailSender.sent()).hasSize(1);
        MimeMessage mail = mailSender.sent().get(0);
        assertThat(mail.getRecipients(Message.RecipientType.TO))
                .extracting(address -> ((InternetAddress) address).getAddress())
                .containsExactly("somchai.j@example.com");

        InternetAddress from = (InternetAddress) mail.getFrom()[0];
        assertThat(from.getAddress()).isEqualTo("billing@sakura-soul.local");
        assertThat(from.getPersonal()).isEqualTo("Sakura Soul Apartment");

        Part attachment = attachmentOf(mail);
        assertThat(attachment.getFileName()).isEqualTo("RC-2026-0003.pdf");
        assertThat(attachment.getContentType()).startsWith("application/pdf");
    }

    @Test
    @DisplayName("SSK-143 APP_MAIL_FROM ว่างหรือเป็นช่องว่างได้ผู้ส่งตั้งต้น ไม่ใช่อีเมลที่ไม่มีผู้ส่ง")
    void blankFromAddressFallsBackToTheDefault() {
        assertThat(new AppMailProperties("   ").from()).isEqualTo("billing@sakura-soul.local");
        assertThat(new AppMailProperties(" office@sakura-soul.local ").from()).isEqualTo("office@sakura-soul.local");
    }

    private static Part attachmentOf(MimeMessage mail) throws Exception {
        Multipart outer = (Multipart) mail.getContent();
        for (int i = 0; i < outer.getCount(); i++) {
            Part part = outer.getBodyPart(i);
            if (Part.ATTACHMENT.equalsIgnoreCase(part.getDisposition())) {
                return part;
            }
        }
        throw new AssertionError("ไม่มีไฟล์แนบในอีเมล");
    }

    private static ReceiptResponse pending() {
        return receipt(ReceiptStatus.PENDING, null, null);
    }

    private static ReceiptResponse paid(String paymentMethod) {
        // 03:00 UTC คือ 10:00 เวลาไทยของวันที่ 11 ถ้าพิมพ์ตามเวลา UTC ก็ยังเป็นวันเดียวกัน
        // เลือก 20:00 UTC ของวันที่ 10 แทน ซึ่งเป็นตีสามของวันที่ 11 ตามเวลาไทย จะได้จับได้ถ้าลืมแปลงโซน
        return receipt(ReceiptStatus.PAID, Instant.parse("2026-09-10T20:00:00Z"), paymentMethod);
    }

    private static ReceiptResponse receipt(ReceiptStatus status, Instant paidAt, String paymentMethod) {
        return new ReceiptResponse(3L, "RC-2026-0003", 1L, "101", "สมชาย ใจดี", "somchai.j@example.com",
                "2026-09", Instant.parse("2026-09-25T02:00:00Z"), LocalDate.of(2026, 10, 5), status, List.of(),
                new BigDecimal("5290.00"), paidAt, paymentMethod, null, 0);
    }
}
