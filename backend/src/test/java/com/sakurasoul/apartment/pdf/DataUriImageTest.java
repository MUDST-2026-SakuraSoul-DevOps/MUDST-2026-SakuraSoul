package com.sakurasoul.apartment.pdf;

import com.openhtmltopdf.pdfboxout.PdfRendererBuilder;
import com.sakurasoul.apartment.promptpay.PromptPayId;
import com.sakurasoul.apartment.promptpay.PromptPayPayload;
import com.sakurasoul.apartment.promptpay.PromptPayQr;
import com.sakurasoul.apartment.promptpay.QrCodes;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.math.BigDecimal;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * openhtmltopdf รุ่นที่ใช้วาดรูปจาก data: URI ได้ ทั้งที่ PdfRenderer ส่ง baseUri เป็น null (SSK-168)
 * <p>
 * QR บนใบเสร็จพึ่งพฤติกรรมนี้ทั้งหมด ถ้า library เงียบ ๆ ข้ามรูปที่โหลดไม่ได้ PDF จะออกมาปกติแต่ไม่มี QR
 * เทสนี้จึงสร้าง PDF จาก builder ตรง ๆ ไม่ผ่าน Spring แล้วเปิดไฟล์ด้วย PDFBox ถอดรหัสรูปที่ฝังไว้กลับมา
 */
class DataUriImageTest {

    @Test
    @DisplayName("SSK-168 img ที่เป็น data: URI ถูกฝังลงหน้า PDF และถอดรหัสกลับได้ payload เดิม")
    void aDataUriImageIsEmbeddedAndStillDecodes() throws IOException {
        String payload = PromptPayPayload.of(PromptPayId.parse("0812345678"), new BigDecimal("3000.00"));
        String xhtml = "<html><body><p>QR</p><img src=\"" + PromptPayQr.dataUri(payload)
                + "\" style=\"width: 38mm; height: 38mm;\" /></body></html>";

        List<BufferedImage> images = PdfImages.of(render(xhtml));

        assertThat(images).hasSize(1);
        assertThat(QrCodes.decode(images.get(0))).isEqualTo(payload);
    }

    private static byte[] render(String xhtml) throws IOException {
        try (ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            PdfRendererBuilder builder = new PdfRendererBuilder();
            builder.withHtmlContent(xhtml, null);
            builder.toStream(out);
            builder.run();
            return out.toByteArray();
        }
    }
}
