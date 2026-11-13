package com.sakurasoul.apartment.maintenance;

import com.sakurasoul.apartment.billing.AppMailProperties;
import jakarta.mail.MessagingException;
import jakarta.mail.internet.MimeMessage;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.mail.MailPreparationException;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Component;

import java.io.UnsupportedEncodingException;
import java.util.List;
import java.util.stream.Collectors;

/**
 * ประกอบอีเมลสรุปของใกล้หมดหนึ่งฉบับแล้วส่งให้ JavaMailSender (SSK-171) ปลายทางคือ Mailpit เหมือนอีเมลใบเสร็จ
 * <p>
 * ข้อความภาษาอังกฤษแบบข้อความธรรมดาเหมือน ReceiptMailer ผู้ส่งใช้ app.mail.from ชุดเดียวกัน
 * หน้าตาอีเมลเขียนไว้ใน docs/api-contract-phase2-backend.md หัวข้อ SSK-171 แก้ที่นี่ต้องแก้ที่นั่นด้วย
 */
@Component
@EnableConfigurationProperties({AppMailProperties.class, LowStockAlertProperties.class})
class LowStockAlertMailer {

    /** ชื่อผู้ส่งเดียวกับอีเมลใบเสร็จ (ReceiptMailer.SENDER_NAME) */
    static final String SENDER_NAME = "Sakura Soul Apartment";

    private static final String BODY = """
            These supplies are at or below their minimum stock:

            %s

            Restock them in Maintenance > Supplies & Inventory.

            Sakura Soul Apartment
            """;

    private final JavaMailSender mailSender;
    private final AppMailProperties mailProperties;
    private final LowStockAlertProperties alertProperties;

    LowStockAlertMailer(JavaMailSender mailSender, AppMailProperties mailProperties,
            LowStockAlertProperties alertProperties) {
        this.mailSender = mailSender;
        this.mailProperties = mailProperties;
        this.alertProperties = alertProperties;
    }

    /**
     * ส่งอีเมลฉบับเดียวที่มีทุกรายการ เรียงตามที่ส่งเข้ามา ผู้เรียกเรียงวิกฤตที่สุดก่อนแล้ว
     * <p>
     * ประกอบไม่ได้ (เช่นที่อยู่ผู้รับใน APP_LOW_STOCK_ALERT_TO ผิดรูปแบบ) โยน MailPreparationException
     * ส่วนเมลเซิร์ฟเวอร์ไม่รับหรือติดต่อไม่ได้ JavaMailSender โยน MailException ชนิดอื่นเอง
     * ทั้งสองแบบเป็น MailException ที่ LowStockAlertService จับแล้วรอส่งใหม่รอบถัดไป
     */
    void send(List<SupplyItem> items) {
        MimeMessage message = mailSender.createMimeMessage();
        try {
            // บังคับ UTF-8 ไม่งั้นชื่อของภาษาไทยจะเพี้ยนในบางโปรแกรมอ่านอีเมล
            MimeMessageHelper helper = new MimeMessageHelper(message, "UTF-8");
            helper.setFrom(mailProperties.from(), SENDER_NAME);
            helper.setTo(alertProperties.lowStockAlertTo().toArray(String[]::new));
            helper.setSubject(subject(items));
            helper.setText(body(items));
        } catch (MessagingException | UnsupportedEncodingException ex) {
            throw new MailPreparationException("Could not build the low stock email", ex);
        }
        mailSender.send(message);
    }

    /** จำนวนรายการอยู่ในหัวเรื่อง คนดูแลหอเห็นจากกล่องจดหมายเลยว่าต้องซื้อของกี่อย่าง */
    static String subject(List<SupplyItem> items) {
        return items.size() == 1
                ? "Low stock: 1 item needs restocking"
                : "Low stock: " + items.size() + " items need restocking";
    }

    static String body(List<SupplyItem> items) {
        return BODY.formatted(items.stream().map(LowStockAlertMailer::line).collect(Collectors.joining("\n")));
    }

    /** "- Air Filters 16x20x1 (HV-003): 0 left, minimum 20" ของที่ไม่มีรหัสไม่ต้องมีวงเล็บ */
    private static String line(SupplyItem item) {
        String sku = item.getSku() == null ? "" : " (" + item.getSku() + ")";
        return "- " + item.getName() + sku + ": " + item.getStock() + " left, minimum " + item.getMinStock();
    }
}
