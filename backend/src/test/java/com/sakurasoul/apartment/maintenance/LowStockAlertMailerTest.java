package com.sakurasoul.apartment.maintenance;

import com.sakurasoul.apartment.RecordingMailSender;
import com.sakurasoul.apartment.billing.AppMailProperties;
import jakarta.mail.Message;
import jakarta.mail.internet.InternetAddress;
import jakarta.mail.internet.MimeMessage;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.Arrays;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/** อีเมลสรุปของใกล้หมด (SSK-171) ประกอบผ่าน MimeMessageHelper ตัวจริง แทนที่แค่ขั้นส่งสุดท้าย (RecordingMailSender) */
class LowStockAlertMailerTest {

    @Test
    @DisplayName("SSK-171 อีเมลฉบับเดียวถึงผู้รับทุกคน ผู้ส่งเดียวกับอีเมลใบเสร็จ มีทุกรายการตามลำดับที่ส่งมา")
    void oneEmailListsEveryItemForEveryRecipient() throws Exception {
        RecordingMailSender mailSender = new RecordingMailSender();
        LowStockAlertMailer mailer = new LowStockAlertMailer(mailSender, new AppMailProperties(null),
                new LowStockAlertProperties(List.of("admin@sakura-soul.local", "tech@sakura-soul.local")));

        mailer.send(List.of(item("ไส้กรองแอร์", "HV-003", 0, 20), item("LED Bulbs 60W", null, 5, 5)));

        assertThat(mailSender.sent()).hasSize(1);
        MimeMessage mail = mailSender.sent().get(0);
        assertThat(Arrays.stream(mail.getRecipients(Message.RecipientType.TO))
                .map(address -> ((InternetAddress) address).getAddress()))
                .containsExactly("admin@sakura-soul.local", "tech@sakura-soul.local");
        InternetAddress from = (InternetAddress) mail.getFrom()[0];
        assertThat(from.getAddress()).isEqualTo("billing@sakura-soul.local");
        assertThat(from.getPersonal()).isEqualTo("Sakura Soul Apartment");
        assertThat(mail.getSubject()).isEqualTo("Low stock: 2 items need restocking");
        assertThat(((String) mail.getContent()).replace("\r\n", "\n")).isEqualTo("""
                These supplies are at or below their minimum stock:

                - ไส้กรองแอร์ (HV-003): 0 left, minimum 20
                - LED Bulbs 60W: 5 left, minimum 5

                Restock them in Maintenance > Supplies & Inventory.

                Sakura Soul Apartment
                """);
    }

    @Test
    @DisplayName("SSK-171 หัวเรื่องของรายการเดียวเป็นเอกพจน์")
    void aSingleItemSubjectIsSingular() {
        assertThat(LowStockAlertMailer.subject(List.of(item("Fuses", "EL-002", 1, 5))))
                .isEqualTo("Low stock: 1 item needs restocking");
    }

    /** ค่าที่หลุดมาจาก environment แบบนี้ต้องไม่กลายเป็นอีเมลที่ไม่มีผู้รับ ซึ่งส่งไม่ออกทุกวันโดยไม่มีใครรู้ */
    @Test
    @DisplayName("SSK-171 APP_LOW_STOCK_ALERT_TO ไม่ตั้งหรือว่างได้ผู้รับตั้งต้น ช่องว่างรอบที่อยู่ถูกตัด")
    void blankRecipientsFallBackToTheDefault() {
        assertThat(new LowStockAlertProperties(null).lowStockAlertTo()).containsExactly("admin@sakura-soul.local");
        assertThat(new LowStockAlertProperties(List.of(" ", "")).lowStockAlertTo())
                .containsExactly("admin@sakura-soul.local");
        assertThat(new LowStockAlertProperties(List.of(" tech@sakura-soul.local ", "", "office@sakura-soul.local"))
                .lowStockAlertTo())
                .containsExactly("tech@sakura-soul.local", "office@sakura-soul.local");
    }

    private static SupplyItem item(String name, String sku, int stock, int minStock) {
        return new SupplyItem(name, sku, "Supplies", stock, minStock, Math.max(stock, minStock));
    }
}
