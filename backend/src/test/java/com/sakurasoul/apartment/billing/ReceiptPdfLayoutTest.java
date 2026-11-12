package com.sakurasoul.apartment.billing;

import com.sakurasoul.apartment.billing.ReceiptDtos.ReceiptResponse;
import com.sakurasoul.apartment.pdf.PdfImages;
import com.sakurasoul.apartment.pdf.PdfRenderer;
import com.sakurasoul.apartment.promptpay.QrCodes;
import io.micrometer.observation.ObservationRegistry;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.thymeleaf.spring6.SpringTemplateEngine;
import org.thymeleaf.templatemode.TemplateMode;
import org.thymeleaf.templateresolver.ClassLoaderTemplateResolver;

import java.io.IOException;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * หน้าตา PDF ใบเสร็จที่มีบล็อกบัญชีรับเงิน (SSK-168) render ด้วย template จริงโดยไม่ต้องยก Spring
 * <p>
 * ใบ พ.ย. ของตัวอย่างในสัญญามีบรรทัดยอดยกมากับดอกเบี้ยเพิ่มจากห้าบรรทัดมาตรฐาน เป็นใบที่ยาวที่สุดที่เจอบ่อย
 * ตอนแรกบล็อกบัญชีดันหมายเหตุท้ายใบไปอยู่หน้าสองคนเดียว และเส้นลงชื่อแยกจากคำกำกับคนละหน้า
 * เทสนี้กันไม่ให้การแก้ template ครั้งหน้าทำให้ใบแบบนี้กลับไปเป็นสองหน้า
 */
class ReceiptPdfLayoutTest {

    private final ReceiptPdfService service = new ReceiptPdfService(null, null,
            new PdfRenderer(templateEngine(), ObservationRegistry.NOOP));

    @Test
    @DisplayName("SSK-168 ใบที่มียอดยกมา ดอกเบี้ย และบล็อกบัญชีพร้อม QR ยังจบในหน้าเดียว และ QR ในไฟล์อ่านได้")
    void aBillWithACarryAndThePaymentBlockFitsOnOnePage() throws IOException {
        ContractExample example = new ContractExample();
        ReceiptResponse november = example.responseOf(example.november);

        byte[] pdf = service.render(november).content();

        assertThat(pages(pdf)).isEqualTo(1);
        assertThat(PdfImages.of(pdf)).singleElement()
                .satisfies(image -> assertThat(QrCodes.decode(image)).isEqualTo(november.promptPayPayload()));
    }

    @Test
    @DisplayName("SSK-168 ใบเดียวกันที่ไม่มีสำเนาบัญชีก็ยังหน้าเดียวและไม่มีรูป")
    void theSameBillWithoutABankAccountIsOnePageWithoutImages() throws IOException {
        ContractExample example = new ContractExample(null);

        byte[] pdf = service.render(example.responseOf(example.november)).content();

        assertThat(pages(pdf)).isEqualTo(1);
        assertThat(PdfImages.of(pdf)).isEmpty();
    }

    private static int pages(byte[] pdf) throws IOException {
        try (PDDocument document = PDDocument.load(pdf)) {
            return document.getNumberOfPages();
        }
    }

    /** ตั้งค่าแบบเดียวกับที่ Spring Boot ตั้งให้ (templates/ + .html โหมด HTML) */
    private static SpringTemplateEngine templateEngine() {
        ClassLoaderTemplateResolver resolver = new ClassLoaderTemplateResolver();
        resolver.setPrefix("templates/");
        resolver.setSuffix(".html");
        resolver.setTemplateMode(TemplateMode.HTML);
        resolver.setCharacterEncoding("UTF-8");
        SpringTemplateEngine engine = new SpringTemplateEngine();
        engine.setTemplateResolver(resolver);
        return engine;
    }
}
