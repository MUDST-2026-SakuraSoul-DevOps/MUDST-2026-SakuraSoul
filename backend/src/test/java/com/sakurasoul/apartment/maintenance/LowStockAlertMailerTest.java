package com.sakurasoul.apartment.maintenance;

import com.sakurasoul.apartment.RecordingMailSender;
import com.sakurasoul.apartment.billing.AppMailProperties;
import jakarta.mail.Message;
import jakarta.mail.internet.InternetAddress;
import jakarta.mail.internet.MimeMessage;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.boot.context.properties.bind.Binder;
import org.springframework.boot.context.properties.source.MapConfigurationPropertySource;

import java.util.Arrays;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** อีเมลสรุปของใกล้หมด (SSK-171) ประกอบผ่าน MimeMessageHelper ตัวจริง แทนที่แค่ขั้นส่งสุดท้าย (RecordingMailSender) */
class LowStockAlertMailerTest {

    @Test
    @DisplayName("SSK-171 อีเมลฉบับเดียวถึงผู้รับทุกคน ผู้ส่งเดียวกับอีเมลใบเสร็จ มีทุกรายการตามลำดับที่ส่งมา")
    void oneEmailListsEveryItemForEveryRecipient() throws Exception {
        RecordingMailSender mailSender = new RecordingMailSender();
        LowStockAlertMailer mailer = new LowStockAlertMailer(mailSender, new AppMailProperties(null),
                new LowStockAlertProperties(List.of("admin@sakura-soul.local", "tech@sakura-soul.local"), null));

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
        assertThat(new LowStockAlertProperties(null, null).lowStockAlertTo())
                .containsExactly("admin@sakura-soul.local");
        assertThat(new LowStockAlertProperties(List.of(" ", ""), null).lowStockAlertTo())
                .containsExactly("admin@sakura-soul.local");
        assertThat(new LowStockAlertProperties(
                List.of(" tech@sakura-soul.local ", "", "office@sakura-soul.local"), null).lowStockAlertTo())
                .containsExactly("tech@sakura-soul.local", "office@sakura-soul.local");
    }

    /** ตัวแปรที่ตั้งเป็นค่าว่างผ่าน placeholder ของ Spring ได้ค่าว่าง ไม่ได้ค่าตั้งต้น cron ว่างทำให้แอปสตาร์ตไม่ขึ้น */
    @Test
    @DisplayName("SSK-171 APP_LOW_STOCK_ALERT_CRON ไม่ตั้งหรือว่างได้แปดโมงเช้า ค่าที่ตั้งมาถูกตัดช่องว่าง")
    void blankCronFallsBackToTheDefault() {
        assertThat(new LowStockAlertProperties(null, null).lowStockAlertCron()).isEqualTo("0 0 8 * * *");
        assertThat(new LowStockAlertProperties(null, "  ").lowStockAlertCron()).isEqualTo("0 0 8 * * *");
        assertThat(new LowStockAlertProperties(null, " 0 * * * * * ").lowStockAlertCron()).isEqualTo("0 * * * * *");
    }

    @Test
    @DisplayName("SSK-171 ที่อยู่ผู้รับที่ผิดรูปแบบทำให้แอปสตาร์ตไม่ขึ้นพร้อมข้อความที่บอกที่อยู่นั้น ไม่ใช่ส่งไม่ออกเงียบ ๆ ทุกเช้า")
    void aMalformedRecipientIsRejectedAtStartup() {
        assertThatThrownBy(() -> new LowStockAlertProperties(List.of("admin@sakura-soul.local", "tech at office"), null))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("APP_LOW_STOCK_ALERT_TO has an invalid email address: tech at office");
    }

    /** environment ส่งมาเป็นข้อความเดียว ตัวผูกค่าของ Spring แยกจุลภาคให้ เทสผ่านตัวผูกค่าจริงไม่ใช่สร้าง record เอง */
    @Test
    @DisplayName("SSK-171 ผู้รับหลายคนในตัวแปรเดียวคั่นด้วยจุลภาค ผูกค่าผ่าน Spring แล้วได้ทีละคน")
    void commaSeparatedRecipientsAreBoundOneByOne() {
        Binder binder = new Binder(new MapConfigurationPropertySource(Map.of(
                "app.supplies.low-stock-alert-to", "tech@sakura-soul.local, office@sakura-soul.local",
                "app.supplies.low-stock-alert-cron", "")));

        LowStockAlertProperties properties = binder.bind("app.supplies", LowStockAlertProperties.class).get();

        assertThat(properties.lowStockAlertTo()).containsExactly("tech@sakura-soul.local", "office@sakura-soul.local");
        assertThat(properties.lowStockAlertCron()).isEqualTo("0 0 8 * * *");
    }

    private static SupplyItem item(String name, String sku, int stock, int minStock) {
        return new SupplyItem(name, sku, "Supplies", stock, minStock, Math.max(stock, minStock));
    }
}
