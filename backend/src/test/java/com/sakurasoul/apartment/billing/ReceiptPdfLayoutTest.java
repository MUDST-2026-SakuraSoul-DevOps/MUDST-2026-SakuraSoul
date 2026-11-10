package com.sakurasoul.apartment.billing;

import com.sakurasoul.apartment.billing.ReceiptDtos.ReceiptItem;
import com.sakurasoul.apartment.billing.ReceiptDtos.ReceiptResponse;
import com.sakurasoul.apartment.pdf.PdfImages;
import com.sakurasoul.apartment.pdf.PdfRenderer;
import com.sakurasoul.apartment.pdf.PdfText;
import com.sakurasoul.apartment.promptpay.QrCodes;
import io.micrometer.observation.ObservationRegistry;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.thymeleaf.spring6.SpringTemplateEngine;
import org.thymeleaf.templatemode.TemplateMode;
import org.thymeleaf.templateresolver.ClassLoaderTemplateResolver;

import java.awt.image.BufferedImage;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * หน้าตา PDF ใบเสร็จ render ด้วย template จริงโดยไม่ต้องยก Spring
 * <ul>
 *   <li>SSK-168: ใบ พ.ย. ของตัวอย่างในสัญญามีบรรทัดยอดยกมากับดอกเบี้ยเพิ่มจากห้าบรรทัดมาตรฐาน เป็นใบที่ยาวที่สุดที่เจอบ่อย
 *       ตอนแรกบล็อกบัญชีดันหมายเหตุท้ายใบไปอยู่หน้าสองคนเดียว เทสกันไม่ให้ใบแบบนี้กลับไปเป็นสองหน้า</li>
 *   <li>SSK-169: ไฟล์พิมพ์รวมใช้ fragment ชุดเดียวกับใบเดี่ยว หน้าของใบหนึ่งในไฟล์รวมต้องเหมือนไฟล์ใบเดี่ยวของใบนั้น
 *       ทั้งข้อความ ตำแหน่งตัวอักษร รูป QR และฟอนต์ และขึ้นหน้าใหม่เฉพาะระหว่างใบ</li>
 * </ul>
 */
class ReceiptPdfLayoutTest {

    private final ReceiptPdfService service = new ReceiptPdfService(null, null,
            new PdfRenderer(templateEngine(), ObservationRegistry.NOOP));

    @Test
    @DisplayName("SSK-168 ใบที่มียอดยกมา ดอกเบี้ย และบล็อกบัญชีพร้อม QR ยังจบในหน้าเดียว และ QR ในไฟล์อ่านได้")
    void aBillWithACarryAndThePaymentBlockFitsOnOnePage() {
        ContractExample example = new ContractExample();
        ReceiptResponse november = example.responseOf(example.november);

        byte[] pdf = service.render(november).content();

        assertThat(PdfText.pages(pdf)).isEqualTo(1);
        assertThat(PdfImages.of(pdf)).singleElement()
                .satisfies(image -> assertThat(QrCodes.decode(image)).isEqualTo(november.promptPayPayload()));
    }

    @Test
    @DisplayName("SSK-168 ใบเดียวกันที่ไม่มีสำเนาบัญชีก็ยังหน้าเดียวและไม่มีรูป")
    void theSameBillWithoutABankAccountIsOnePageWithoutImages() {
        ContractExample example = new ContractExample(null);

        byte[] pdf = service.render(example.responseOf(example.november)).content();

        assertThat(PdfText.pages(pdf)).isEqualTo(1);
        assertThat(PdfImages.of(pdf)).isEmpty();
    }

    /**
     * สามแบบในไฟล์เดียว: ใบ ต.ค. ที่ถูกยกยอด (มีสำเนาบัญชีแต่ไม่มีบล็อก) ใบ พ.ย. ที่ต้องจ่าย (มี QR) และใบ พ.ย. ที่ไม่มีบัญชี
     * ถ้าตัวแปรของรอบไม่ไปถึง fragment ทุกหน้าจะเป็นใบเดียวกันหรือว่าง ถ้ากฎขึ้นหน้าใหม่ผิดจะมีหน้าว่างหัวหรือท้ายไฟล์
     */
    @Test
    @DisplayName("SSK-169 ไฟล์รวมได้หนึ่งหน้าต่อใบ ไม่มีหน้าว่าง และแต่ละหน้าเหมือนไฟล์ใบเดี่ยวของใบนั้นทุกตัวอักษร")
    void eachPageOfTheBulkFileIsTheSingleFileOfThatReceipt() {
        List<ReceiptResponse> receipts = threeKinds();

        byte[] bulk = service.renderAll(receipts, "receipts.pdf").content();

        assertThat(PdfText.pages(bulk)).isEqualTo(3);
        for (int page = 1; page <= 3; page++) {
            byte[] single = service.render(receipts.get(page - 1)).content();
            assertThat(PdfText.textOfPage(bulk, page)).as("หน้า %d", page)
                    .isNotBlank()
                    .isEqualTo(PdfText.textOfPage(single, 1));
        }
    }

    @Test
    @DisplayName("SSK-169 QR อยู่เฉพาะหน้าของใบที่ต้องจ่าย และถอดรหัสได้ payload ของใบนั้น")
    void theQrIsOnlyOnThePageOfTheBillStillDue() {
        List<ReceiptResponse> receipts = threeKinds();

        List<List<BufferedImage>> images = PdfImages.byPage(service.renderAll(receipts, "receipts.pdf").content());

        assertThat(images).hasSize(3);
        assertThat(images.get(0)).as("ใบที่ถูกยกยอด").isEmpty();
        assertThat(images.get(1)).singleElement()
                .satisfies(image -> assertThat(QrCodes.decode(image)).isEqualTo(receipts.get(1).promptPayPayload()));
        assertThat(images.get(2)).as("ใบที่ไม่มีสำเนาบัญชี").isEmpty();
    }

    /** padding ของ .sheet แทน margin ของ body ใบที่สองเป็นต้นไปจึงไม่เริ่มสูงกว่าใบแรก และไม่ล้นไปหน้าถัดไป */
    @Test
    @DisplayName("SSK-169 ใบเดียวกันสามครั้งได้สามหน้า ตำแหน่งตัวอักษรทุกตัวของทุกหน้าตรงกับไฟล์ใบเดี่ยว")
    void everyPageKeepsTheGeometryOfTheSingleFile() {
        ContractExample example = new ContractExample();
        ReceiptResponse november = example.responseOf(example.november);
        byte[] single = service.render(november).content();

        byte[] bulk = service.renderAll(List.of(november, november, november), "receipts.pdf").content();

        assertThat(PdfText.pages(bulk)).isEqualTo(3);
        for (int page = 1; page <= 3; page++) {
            assertThat(PdfText.glyphsOfPage(bulk, page)).as("หน้า %d", page)
                    .isEqualTo(PdfText.glyphsOfPage(single, 1));
        }
    }

    @Test
    @DisplayName("SSK-169 ใบที่ยาวเกินหนึ่งหน้าใช้หลายหน้าเท่าไฟล์เดี่ยวของมัน แล้วใบถัดไปยังขึ้นหน้าใหม่")
    void theNextReceiptStartsOnAFreshPageAfterALongOne() {
        ContractExample example = new ContractExample();
        ReceiptResponse november = example.responseOf(example.november);
        ReceiptResponse longOne = withManyExtraLines(example.responseOf(example.october), 30);
        int longPages = PdfText.pages(service.render(longOne).content());
        assertThat(longPages).as("ใบยาวใบเดียว").isGreaterThan(1);

        byte[] bulk = service.renderAll(List.of(longOne, november), "receipts.pdf").content();

        assertThat(PdfText.pages(bulk)).isEqualTo(longPages + 1);
        assertThat(PdfText.textOfPage(bulk, longPages)).doesNotContain("RC-2026-0012");
        assertThat(PdfText.textOfPage(bulk, longPages + 1)).contains("Receipt no. RC-2026-0012");
    }

    @Test
    @DisplayName("SSK-169 ทุกหน้าของไฟล์รวมฝังฟอนต์ Sarabun และชื่อผู้เช่าภาษาไทยไม่หาย")
    void everyPageCarriesTheThaiFont() {
        byte[] bulk = service.renderAll(threeKinds(), "receipts.pdf").content();

        for (int page = 1; page <= 3; page++) {
            assertThat(PdfText.fontNamesOfPage(bulk, page)).as("หน้า %d", page).anyMatch(name -> name.contains("Sarabun"));
            assertThat(PdfText.textOfPage(bulk, page)).as("หน้า %d", page).contains("มานี รักเรียน");
        }
    }

    /**
     * render ครั้งเดียวทั้งไฟล์ ฟอนต์จึงถูกฝังครั้งเดียว ถ้าวันหนึ่งไฟล์รวมกลายเป็น PDF ทีละใบมาต่อกัน
     * ขนาดจะโตตามจำนวนใบคูณขนาดฟอนต์ เพดานนี้ห่างจากที่วัดได้พอสมควร ไม่ได้บีบให้พอดี
     */
    @Test
    @DisplayName("SSK-169 ไฟล์รวม 24 ใบเล็กกว่า 24 ไฟล์เดี่ยวรวมกันมาก เพราะฝังฟอนต์ครั้งเดียว")
    void theBulkFileEmbedsTheFontsOnce() {
        ContractExample example = new ContractExample();
        ReceiptResponse november = example.responseOf(example.november);
        int single = service.render(november).content().length;

        int bulk = service.renderAll(Collections.nCopies(24, november), "receipts.pdf").content().length;

        assertThat(bulk).isLessThan(12 * single);
    }

    @Test
    @DisplayName("SSK-169 ไม่มีใบเลยไม่ทำ PDF เปล่า และเป็นบั๊กของผู้เรียก (500) ไม่ใช่ 400 ที่โชว์ข้อความภายในให้ผู้ใช้")
    void anEmptyListIsABug() {
        assertThatThrownBy(() -> service.renderAll(List.of(), "receipts.pdf"))
                .isInstanceOf(IllegalStateException.class);
    }

    /** ใบ ต.ค. ที่ถูกยกยอดแต่มีสำเนาบัญชี ใบ พ.ย. ที่ต้องจ่ายพร้อม QR และใบ พ.ย. ที่ออกตอนยังไม่ตั้งบัญชี */
    private static List<ReceiptResponse> threeKinds() {
        ContractExample withBank = new ContractExample(ContractExample.BANK, ContractExample.BANK);
        withBank.voidPaymentOnNovember();
        ContractExample withoutBank = new ContractExample(null);
        ReceiptResponse carried = withBank.responseOf(withBank.october);
        assertThat(ReceiptStanding.of(carried)).isEqualTo(ReceiptStanding.CARRIED);
        return List.of(carried, withBank.responseOf(withBank.november),
                withoutBank.responseOf(withoutBank.november));
    }

    /** ใบเดิมที่มีบรรทัดค่าใช้จ่ายพิเศษเพิ่ม count บรรทัด ยาวพอให้ล้นไปหน้าที่สอง */
    private static ReceiptResponse withManyExtraLines(ReceiptResponse r, int count) {
        List<ReceiptItem> items = new ArrayList<>(r.items());
        for (int i = 1; i <= count; i++) {
            items.add(new ReceiptItem("Extra charge " + i, "Monthly", null, null, null, BigDecimal.TEN, (long) i));
        }
        return new ReceiptResponse(r.id(), r.receiptNo(), r.leaseId(), r.roomNumber(), r.tenantName(), r.tenantEmail(),
                r.billingMonth(), r.issuedAt(), r.dueDate(), r.status(), items, r.totalAmount(), r.paidAt(),
                r.paymentMethod(), r.lastSentAt(), r.sentCount(), r.latest(), r.chargesAmount(), r.previousBalance(),
                r.interestAmount(), r.paidAmount(), r.balanceDue(), r.settledAmount(), r.outstandingAmount(),
                r.oldestUnpaidDueDate(), r.overdue(), r.carriedToReceiptId(), r.carriedToReceiptNo(), r.paidOn(),
                r.payments(), r.bank(), r.promptPayPayload());
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
