package com.sakurasoul.apartment.billing;

import com.sakurasoul.apartment.billing.ReceiptDtos.ReceiptResponse;
import com.sakurasoul.apartment.pdf.DocumentFormat;
import com.sakurasoul.apartment.pdf.PdfDocument;
import jakarta.mail.MessagingException;
import jakarta.mail.internet.MimeMessage;
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
 * ชุดเดียวกับ PDF อีเมลกับไฟล์แนบจึงเขียนยอดตรงกันเสมอ หน้าตาทั้งสองแบบเขียนไว้ใน
 * docs/api-contract-billing.md หัวข้อ "หน้าตาอีเมล" แก้ที่นี่ต้องแก้ที่นั่นด้วย
 */
@Component
@EnableConfigurationProperties(AppMailProperties.class)
public class ReceiptMailer {

    /** ชื่อผู้ส่งที่ผู้เช่าเห็นในกล่องจดหมาย และบรรทัดลงท้ายของอีเมล */
    static final String SENDER_NAME = "Sakura Soul Apartment";

    private static final String PENDING_BODY = """
            Dear %s,

            Please find attached receipt %s for %s (Unit %s).

            Amount due: %s
            Due date: %s

            If you have already paid, please ignore this email.

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

    public ReceiptMailer(JavaMailSender mailSender, AppMailProperties mailProperties) {
        this.mailSender = mailSender;
        this.mailProperties = mailProperties;
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
        mailSender.send(message);
    }

    /**
     * ใบค้างบอกยอดกับวันครบกำหนดตั้งแต่หัวเรื่อง ผู้เช่าเห็นในรายการอีเมลโดยไม่ต้องเปิด
     * ใบที่จ่ายแล้วเป็นสำเนา หัวเรื่องต้องบอกว่าจ่ายแล้ว ไม่งั้นผู้เช่าจะนึกว่าโดนเก็บเงินซ้ำ
     */
    static String subject(ReceiptResponse receipt) {
        String subject = "Receipt " + receipt.receiptNo() + " for " + billingMonth(receipt);
        if (receipt.status() == ReceiptStatus.PAID) {
            return subject + " - paid";
        }
        return subject + " - " + DocumentFormat.money(receipt.totalAmount())
                + " due " + DocumentFormat.date(receipt.dueDate());
    }

    /**
     * ใบค้างที่เลยกำหนดแล้วใช้ข้อความเดียวกับใบที่ยังไม่ถึงกำหนด ไม่ได้เขียนว่า overdue
     * เพราะการจะรู้ว่าเลยกำหนดหรือยังต้องรู้ "วันนี้" และรอบเตือนรายเดือนจะส่งทั้งสองแบบพร้อมกัน
     * ข้อความที่เป็นกลางจึงถูกทั้งสองกรณี วันครบกำหนดอยู่ในอีเมลแล้ว ผู้เช่าเทียบเองได้
     */
    static String body(ReceiptResponse receipt) {
        if (receipt.status() == ReceiptStatus.PAID) {
            String method = receipt.paymentMethod() == null ? "" : " (" + receipt.paymentMethod() + ")";
            return PAID_BODY.formatted(receipt.tenantName(), receipt.receiptNo(), billingMonth(receipt),
                    receipt.roomNumber(), DocumentFormat.money(receipt.totalAmount()),
                    DocumentFormat.date(receipt.paidAt()), method);
        }
        return PENDING_BODY.formatted(receipt.tenantName(), receipt.receiptNo(), billingMonth(receipt),
                receipt.roomNumber(), DocumentFormat.money(receipt.totalAmount()),
                DocumentFormat.date(receipt.dueDate()));
    }

    /** "Sep 2026" แบบเดียวกับที่ PDF พิมพ์ ใน DTO เก็บเป็น "2026-09" */
    private static String billingMonth(ReceiptResponse receipt) {
        return DocumentFormat.monthYear(YearMonth.parse(receipt.billingMonth()).atDay(1));
    }
}
