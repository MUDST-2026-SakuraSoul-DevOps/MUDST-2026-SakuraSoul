package com.sakurasoul.apartment.billing;

import com.sakurasoul.apartment.billing.ReceiptDtos.ReceiptItem;
import com.sakurasoul.apartment.billing.ReceiptDtos.ReceiptResponse;
import com.sakurasoul.apartment.pdf.DocumentFormat;
import com.sakurasoul.apartment.pdf.PdfDocument;
import io.micrometer.observation.Observation;
import io.micrometer.observation.ObservationRegistry;
import jakarta.mail.MessagingException;
import jakarta.mail.internet.MimeMessage;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.mail.MailPreparationException;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Component;

import java.io.UnsupportedEncodingException;
import java.time.YearMonth;

/**
 * ประกอบอีเมลของใบเสร็จหนึ่งใบแล้วส่งให้ JavaMailSender (SSK-143)
 * <p>
 * ปลายทางคือ Mailpit ที่รันอยู่ใน stack ของเราเอง (ดู spring.mail ใน application.yml) ไม่มีอะไรออกนอกเครื่อง
 * <p>
 * เนื้อความเป็นภาษาอังกฤษเหมือนหน้าเว็บกับ PDF และเป็นข้อความธรรมดา ไม่ใช่ HTML เพราะเอกสารจริงคือ PDF
 * ที่แนบไป อีเมลมีหน้าที่แค่บอกว่าใบไหน เท่าไหร่ ครบกำหนดเมื่อไหร่ ตัวเลขกับวันที่ใช้ DocumentFormat
 * ชุดเดียวกับ PDF อีเมลกับไฟล์แนบจึงเขียนยอดตรงกันเสมอ หน้าตาทุกแบบเขียนไว้ใน
 * docs/api-contract-billing.md หัวข้อ "หน้าตาอีเมล" แก้ที่นี่ต้องแก้ที่นั่นด้วย
 * <p>
 * แม่แบบมีสามแบบตาม {@link ReceiptStanding} ต้องจ่าย ถูกยกยอด และจ่ายครบ (SSK-163, SSK-164)
 * ใบธรรมดาที่ไม่มียอดยกมาและยังไม่มีการชำระได้อีเมลตัวอักษรเดิมทุกตัว
 */
@Component
@EnableConfigurationProperties(AppMailProperties.class)
public class ReceiptMailer {

    /** ชื่อผู้ส่งที่ผู้เช่าเห็นในกล่องจดหมาย และบรรทัดลงท้ายของอีเมล */
    static final String SENDER_NAME = "Sakura Soul Apartment";

    /**
     * บรรทัดยอดอยู่ใน %s ตัวที่ห้า ดู amountLines ส่วน %s ตัวสุดท้ายคือบล็อกบัญชีรับเงิน (SSK-168)
     * เป็นสตริงว่างเมื่อใบไม่มีสำเนาบัญชี อีเมลจึงเหมือนก่อน SSK-168 ทุกตัวอักษร
     */
    private static final String DUE_BODY = """
            Dear %s,

            Please find attached receipt %s for %s (Unit %s).

            %sDue date: %s
            %s
            If you have already paid, please ignore this email.

            Sakura Soul Apartment
            """;

    private static final String CARRIED_BODY = """
            Dear %s,

            Please find attached a copy of receipt %s for %s (Unit %s).

            The unpaid balance of %s on this receipt has been carried to receipt %s.
            Please pay according to receipt %s.

            Sakura Soul Apartment
            """;

    private static final String PAID_BODY = """
            Dear %s,

            Please find attached a copy of receipt %s for %s (Unit %s).

            Total: %s
            Paid on %s%s

            Thank you for your payment.

            Sakura Soul Apartment
            """;

    private final JavaMailSender mailSender;
    private final AppMailProperties mailProperties;

    private final ObservationRegistry observations;

    /** ไม่มี tracing (ใช้ในเทสหน่วยที่สร้าง mailer เอง) */
    public ReceiptMailer(JavaMailSender mailSender, AppMailProperties mailProperties) {
        this(mailSender, mailProperties, ObservationRegistry.NOOP);
    }

    @Autowired
    public ReceiptMailer(JavaMailSender mailSender, AppMailProperties mailProperties,
                         ObservationRegistry observations) {
        this.mailSender = mailSender;
        this.mailProperties = mailProperties;
        this.observations = observations;
    }

    /**
     * ส่งอีเมลหนึ่งฉบับไปที่ tenantEmail ของใบนี้ ผู้เรียกต้องเช็คเองก่อนว่าผู้เช่ามีอีเมล
     * <p>
     * ประกอบข้อความไม่ได้ (เช่นอีเมลของผู้เช่าเป็นรูปแบบที่ JavaMail อ่านไม่ออก) โยน MailPreparationException
     * ส่วนเมลเซิร์ฟเวอร์ไม่รับหรือติดต่อไม่ได้ JavaMailSender โยน MailException ชนิดอื่นออกมาเอง
     * ที่แยกสองแบบไว้เพราะแบบแรกเป็นปัญหาของใบนี้ใบเดียว ส่วนแบบหลังเป็นปัญหาของเมลเซิร์ฟเวอร์
     * การตัดสินว่าจะตอบผู้ใช้ว่าอะไรเป็นงานของ ReceiptDispatchService ซึ่งรู้ว่าส่งใบอื่นไปแล้วหรือยัง
     */
    public void send(ReceiptResponse receipt, PdfDocument pdf) {
        MimeMessage message = mailSender.createMimeMessage();
        try {
            // multipart เพราะมีไฟล์แนบ และบังคับ UTF-8 ไม่งั้นชื่อผู้เช่าภาษาไทยจะเพี้ยนในบางโปรแกรมอ่านอีเมล
            MimeMessageHelper helper = new MimeMessageHelper(message, true, "UTF-8");
            helper.setFrom(mailProperties.from(), SENDER_NAME);
            helper.setTo(receipt.tenantEmail());
            helper.setSubject(subject(receipt));
            helper.setText(body(receipt));
            helper.addAttachment(pdf.fileName(), new ByteArrayResource(pdf.content()), "application/pdf");
        } catch (MessagingException | UnsupportedEncodingException ex) {
            throw new MailPreparationException("Could not build the email for receipt " + receipt.receiptNo(), ex);
        }
        // span ของการส่งเมล (SSK-186) เห็นใน Tempo ว่าเวลาไปหมดที่เมลเซิร์ฟเวอร์เท่าไร
        // ไม่ใส่ที่อยู่อีเมลหรือชื่อผู้เช่าลงใน span เพราะเป็นข้อมูลส่วนบุคคล
        Observation.createNotStarted("receipt.email.send", observations)
                .observe(() -> mailSender.send(message));
    }

    /**
     * ใบที่ต้องจ่ายบอกยอดที่ยังต้องจ่ายกับวันครบกำหนดตั้งแต่หัวเรื่อง ผู้เช่าเห็นในรายการอีเมลโดยไม่ต้องเปิด
     * ใบที่ถูกยกยอดบอกบิลที่ต้องจ่ายแทน ใบที่จ่ายครบเป็นสำเนา หัวเรื่องต้องบอกว่าจ่ายแล้ว
     * ไม่งั้นผู้เช่าจะนึกว่าโดนเก็บเงินซ้ำ
     */
    static String subject(ReceiptResponse receipt) {
        String subject = "Receipt " + receipt.receiptNo() + " for " + billingMonth(receipt);
        return switch (ReceiptStanding.of(receipt)) {
            case DUE -> subject + " - " + DocumentFormat.money(receipt.balanceDue())
                    + " due " + DocumentFormat.date(receipt.dueDate());
            case CARRIED -> subject + " - carried to " + receipt.carriedToReceiptNo();
            case SETTLED -> subject + " - paid";
        };
    }

    /**
     * ใบค้างที่เลยกำหนดแล้วใช้ข้อความเดียวกับใบที่ยังไม่ถึงกำหนด ไม่ได้เขียนว่า overdue
     * เพราะการจะรู้ว่าเลยกำหนดหรือยังต้องรู้ "วันนี้" และรอบเตือนรายเดือนจะส่งทั้งสองแบบพร้อมกัน
     * ข้อความที่เป็นกลางจึงถูกทั้งสองกรณี วันครบกำหนดอยู่ในอีเมลแล้ว ผู้เช่าเทียบเองได้
     */
    static String body(ReceiptResponse receipt) {
        PaymentBlock payment = PaymentBlock.of(receipt);
        return switch (ReceiptStanding.of(receipt)) {
            case DUE -> DUE_BODY.formatted(receipt.tenantName(), receipt.receiptNo(), billingMonth(receipt),
                    receipt.roomNumber(), amountLines(receipt, payment != null),
                    DocumentFormat.date(receipt.dueDate()), payment == null ? "" : "\n" + payment.emailText());
            case CARRIED -> CARRIED_BODY.formatted(receipt.tenantName(), receipt.receiptNo(), billingMonth(receipt),
                    receipt.roomNumber(), DocumentFormat.money(receipt.outstandingAmount()),
                    receipt.carriedToReceiptNo(), receipt.carriedToReceiptNo());
            case SETTLED -> PAID_BODY.formatted(receipt.tenantName(), receipt.receiptNo(), billingMonth(receipt),
                    receipt.roomNumber(), DocumentFormat.money(receipt.totalAmount()), paidDate(receipt),
                    receipt.paymentMethod() == null ? "" : " (" + receipt.paymentMethod() + ")");
        };
    }

    /**
     * บรรทัดยอดของใบที่ต้องจ่าย ผู้เช่าที่เห็นยอดสูงกว่าค่าเช่าปกติต้องรู้จากอีเมลเลยว่าทำไม
     * "Total" กับ "Includes…" ขึ้นเมื่อมียอดยกมา "Paid so far" ขึ้นเมื่อมีการชำระบนบิลนี้แล้ว
     * ใบธรรมดาจึงเหลือบรรทัด "Amount due" บรรทัดเดียวเหมือนก่อน SSK-163
     * <p>
     * ใบที่มีบล็อกบัญชีรับเงิน (SSK-168) พิมพ์ยอดรวม จ่ายแล้ว และยอดที่ต้องจ่ายครบสามบรรทัดเสมอ เหมือนบล็อกใน PDF
     * ผู้เช่าจะได้เห็นว่าทำไมยอดใน QR ไม่ใช่ยอดเต็มของบิล
     */
    static String amountLines(ReceiptResponse receipt, boolean withPaymentBlock) {
        boolean carried = receipt.previousBalance().signum() > 0;
        StringBuilder lines = new StringBuilder();
        if (carried || withPaymentBlock) {
            lines.append("Total: ").append(DocumentFormat.money(receipt.totalAmount())).append('\n');
        }
        if (carried) {
            lines.append("Includes previous balance ").append(DocumentFormat.money(receipt.previousBalance()))
                    .append(" (").append(carriedReceipts(receipt)).append(')');
            if (receipt.interestAmount().signum() > 0) {
                lines.append(" and late interest ").append(DocumentFormat.money(receipt.interestAmount()));
            }
            lines.append('\n');
        }
        if (receipt.paidAmount().signum() > 0 || withPaymentBlock) {
            lines.append("Paid so far: ").append(DocumentFormat.money(receipt.paidAmount())).append('\n');
        }
        return lines.append("Amount due: ").append(DocumentFormat.money(receipt.balanceDue())).append('\n').toString();
    }

    /** เลขที่ของใบที่ยกมาอยู่ใน detail ของบรรทัดยอดยกมา บรรทัดค่าใช้จ่ายพิเศษ (มี chargeId) ชื่อซ้ำได้จึงไม่นับ */
    private static String carriedReceipts(ReceiptResponse receipt) {
        return receipt.items().stream()
                .filter(item -> item.chargeId() == null && ReceiptItem.PREVIOUS_BALANCE.equals(item.item()))
                .map(ReceiptItem::detail)
                .findFirst()
                .orElse("");
    }

    /** วันที่ได้รับเงินของการชำระที่ทำให้ใบครบ ใบยอดศูนย์ที่ไม่มีการชำระใช้วันของเวลาที่ครบ (ตามเวลาไทย) */
    static String paidDate(ReceiptResponse receipt) {
        return receipt.paidOn() != null
                ? DocumentFormat.date(receipt.paidOn())
                : DocumentFormat.date(receipt.paidAt());
    }

    /** "Sep 2026" แบบเดียวกับที่ PDF พิมพ์ ใน DTO เก็บเป็น "2026-09" */
    private static String billingMonth(ReceiptResponse receipt) {
        return DocumentFormat.monthYear(YearMonth.parse(receipt.billingMonth()).atDay(1));
    }
}
