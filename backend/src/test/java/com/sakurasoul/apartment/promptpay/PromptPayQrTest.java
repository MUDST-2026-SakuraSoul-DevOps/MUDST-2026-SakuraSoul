package com.sakurasoul.apartment.promptpay;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.math.BigDecimal;
import java.util.Base64;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * ภาพ QR ของ PromptPay (SSK-168) ถอดรหัสภาพที่วาดกลับมาด้วย ZXing ตาม AC ของการ์ด
 * แล้วเช็คว่าได้ payload เดิม CRC ถูก และจำนวนเงินตรง
 */
class PromptPayQrTest {

    private static final PromptPayId MOBILE = PromptPayId.parse("0812345678");

    @ParameterizedTest(name = "{0} บาท")
    @ValueSource(strings = {"3000.00", "8145.00"})
    @DisplayName("SSK-168 ถอดรหัสภาพแล้วได้ payload เดิม CRC ของข้อความที่ถอดได้ถูก และจำนวนเงินในช่อง 54 ตรง")
    void theDecodedImageGivesBackThePayloadWithAValidCrcAndTheAmount(String amount) {
        String payload = PromptPayPayload.of(MOBILE, new BigDecimal(amount));

        String decoded = QrCodes.decode(PromptPayQr.png(payload));

        assertThat(decoded).isEqualTo(payload);
        String withoutCrc = decoded.substring(0, decoded.length() - 4);
        assertThat(withoutCrc).endsWith("6304");
        assertThat(decoded).endsWith(Crc16Ccitt.hex(withoutCrc));
        assertThat(decoded).contains("540" + amount.length() + amount + "5802TH");
    }

    @Test
    @DisplayName("SSK-168 เป็นไฟล์ PNG ขนาด 300 x 300")
    void itIsAPngOfThreeHundredPixels() throws IOException {
        byte[] png = PromptPayQr.png(PromptPayPayload.of(MOBILE, new BigDecimal("3000.00")));

        assertThat(png).startsWith(0x89, 'P', 'N', 'G');
        BufferedImage image = ImageIO.read(new ByteArrayInputStream(png));
        assertThat(image.getWidth()).isEqualTo(300);
        assertThat(image.getHeight()).isEqualTo(300);
    }

    @Test
    @DisplayName("SSK-168 data URI เป็น base64 บรรทัดเดียวของ PNG ภาพเดียวกัน")
    void theDataUriHoldsTheSamePngOnOneLine() {
        String payload = PromptPayPayload.of(MOBILE, new BigDecimal("8145.00"));

        String uri = PromptPayQr.dataUri(payload);

        assertThat(uri).startsWith("data:image/png;base64,").doesNotContain("\n", "\r");
        byte[] png = Base64.getDecoder().decode(uri.substring("data:image/png;base64,".length()));
        assertThat(QrCodes.decode(png)).isEqualTo(payload);
    }
}
