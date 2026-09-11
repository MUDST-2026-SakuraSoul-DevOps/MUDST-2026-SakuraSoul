package com.sakurasoul.apartment.pdf;

import com.openhtmltopdf.pdfboxout.PdfRendererBuilder;
import com.openhtmltopdf.outputdevice.helper.BaseRendererBuilder.FontStyle;
import org.springframework.stereotype.Component;
import org.thymeleaf.ITemplateEngine;
import org.thymeleaf.context.Context;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.util.Map;

/**
 * แปลง template Thymeleaf เป็นไฟล์ PDF หนึ่งไฟล์ ใช้ร่วมกันทั้งใบเสร็จ (US-10)
 * และสัญญาเช่า (US-11)
 * <p>
 * ทางเดินคือ Thymeleaf render template ออกมาเป็นสตริง XHTML ก่อน แล้วส่งต่อให้
 * openhtmltopdf แปลงเป็น PDF ตามที่ตกลงกันไว้ในหัวข้อ "การออกเอกสาร PDF" ของ README
 * ที่เลือกทางนี้เพราะ layout ของเอกสารเขียนด้วย HTML กับ CSS ได้ตรง ๆ ใครก็แก้ได้
 * ไม่ต้องนั่งวางพิกัดกล่องข้อความทีละอันแบบ PDF library สายวาดเอง
 *
 * <h2>สองกับดักที่ทำให้เสียเวลาเป็นวัน ถ้าไม่รู้ไว้ก่อน</h2>
 *
 * <b>หนึ่ง ฟอนต์ไทยต้อง embed เข้าไปในไฟล์ ไม่ใช่แค่ตั้ง font-family</b>
 * ถ้าไม่ embed ตัวอักษรไทยจะหายกลายเป็นช่องว่าง หรือสระกับวรรณยุกต์ลอยผิดตำแหน่ง
 * ที่หลอกคือเปิดบนเครื่องตัวเองมักยังปกติ เพราะเครื่องเรามีฟอนต์อยู่แล้ว ต้องไปเปิด
 * เครื่องอื่นหรือใน container ถึงจะเจอ เทส ReceiptApiTest จึงเปิดไฟล์ที่ generate
 * ออกมาด้วย PDFBox แล้วไล่ดูชื่อฟอนต์ใน resource ของทุกหน้าว่ามี Sarabun อยู่จริง
 * ไม่ได้เช็คแค่ว่าไฟล์เปิดได้
 * <p>
 * ลงทะเบียนสองน้ำหนักคือ 400 กับ 700 ถ้าลงแค่ 400 ตัวหนาจะไม่ใช่ตัวหนาจริง
 * openhtmltopdf จะไม่สังเคราะห์ตัวหนาให้ ข้อความที่สั่ง font-weight: bold จะออกมา
 * เหมือนตัวธรรมดาทุกประการ หัวตารางกับยอดรวมบนใบเสร็จจะจมหายไปกับเนื้อความ
 * <p>
 * ส่ง supplier ที่เปิด stream ใหม่ทุกครั้ง ไม่ได้ส่ง stream สำเร็จรูปเข้าไป เพราะ
 * PdfRendererBuilder เรียก supplier ตอน run() และเรียกกี่ครั้งก็ได้ stream ที่อ่านจบ
 * ไปแล้วจะกลายเป็นฟอนต์เปล่า ซึ่งอาการที่เห็นคือตัวอักษรไทยหายไปเฉย ๆ ไม่มี error
 *
 * <p><b>สอง openhtmltopdf อ่าน HTML ด้วย parser ของ XML ไม่ใช่ parser ของเบราว์เซอร์</b>
 * template จึงต้องเป็น XHTML ที่ well-formed ห้ามมี void element อย่าง
 * {@code meta}, {@code br}, {@code hr}, {@code img} ที่ไม่ปิด tag และห้ามใช้ entity
 * ของ HTML อย่าง {@code &nbsp;} เพราะไม่มี DTD ให้ parser แปล ต้องเขียนเป็น
 * {@code &#160;} แทน ถ้าพลาดข้อไหนจะได้ error ตอน run() ไม่ใช่ PDF ที่หน้าตาเพี้ยน
 * ซึ่งถือว่าโชคดีแล้ว
 * <p>
 * ส่วน CSS ใช้ได้เท่าที่ openhtmltopdf รองรับ flexbox กับ grid ใช้ไม่ได้เลย
 * ต้องจัด layout ด้วย table กับ float เหมือนเว็บสมัยก่อน
 */
@Component
public class PdfRenderer {

    /**
     * ชื่อตระกูลฟอนต์ที่ template ต้องอ้างใน font-family ให้ตรงตัวอักษรทุกตัว
     * ถ้าสะกดไม่ตรง openhtmltopdf จะเงียบ ๆ ตกไปใช้ฟอนต์ตั้งต้นที่ไม่มีตัวอักษรไทย
     */
    public static final String FONT_FAMILY = "Sarabun";

    /**
     * ไฟล์ฟอนต์อยู่ใน resources ของ backend ไม่ได้พึ่งฟอนต์ที่ติดมากับเครื่องหรือ image
     * base ของ Docker เพราะ image ที่ใช้รันไม่มีฟอนต์ไทยสักตัว
     * <p>
     * README เขียนไว้ตอนแรกว่าจะใช้ TH Sarabun New แต่ในที่สุดใช้ตระกูล "Sarabun"
     * จาก Google Fonts แทน เป็นฟอนต์สายเดียวกันที่สัญญาอนุญาตเป็น OFL 1.1 ชัดเจน
     * จึงคอมมิตไฟล์ลง repo และแจกจ่ายไปกับ image ได้โดยไม่ต้องตีความสัญญาอนุญาต
     * ตัวสัญญาอนุญาตอยู่ที่ resources/fonts/OFL.txt ห้ามลบออกจาก repo
     */
    private static final String REGULAR = "/fonts/Sarabun-Regular.ttf";
    private static final String BOLD = "/fonts/Sarabun-Bold.ttf";

    private final ITemplateEngine templateEngine;

    public PdfRenderer(ITemplateEngine templateEngine) {
        this.templateEngine = templateEngine;
    }

    /**
     * render template แล้วคืนไฟล์ PDF ทั้งไฟล์เป็น byte array
     * <p>
     * คืนเป็น byte array ไม่ได้ stream ออกไปตรง ๆ เพราะเอกสารของหอพักใบหนึ่งใหญ่
     * ไม่กี่สิบกิโลไบต์ และการถือไว้ทั้งก้อนทำให้ตอบ Content-Length ได้จริง เบราว์เซอร์
     * จึงโชว์ progress ของการดาวน์โหลดได้ อีกข้อคือถ้า render พังกลางทางตอน stream
     * ผู้ใช้จะได้ไฟล์ครึ่ง ๆ ที่เปิดไม่ขึ้นพร้อมสถานะ 200 แทนที่จะได้ 500 ที่บอกว่าพัง
     *
     * @param templateName ชื่อ template ใต้ resources/templates เช่น "pdf/receipt"
     * @param model        ตัวแปรที่ template อ่าน ควรฟอร์แมตเป็นสตริงมาแล้ว (ดู ThaiFormat)
     */
    public byte[] render(String templateName, Map<String, Object> model) {
        Context context = new Context();
        context.setVariables(model);
        String xhtml = templateEngine.process(templateName, context);

        try (ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            PdfRendererBuilder builder = new PdfRendererBuilder();
            builder.useFont(() -> fontStream(REGULAR), FONT_FAMILY, 400, FontStyle.NORMAL, true);
            builder.useFont(() -> fontStream(BOLD), FONT_FAMILY, 700, FontStyle.NORMAL, true);

            // baseUri เป็น null ได้เพราะเอกสารทั้งสองแบบไม่มีรูปหรือไฟล์ภายนอกเลย
            // ทุกอย่างเป็นข้อความกับเส้นตารางที่วาดด้วย CSS ถ้าวันหลังต้องใส่โลโก้หอ
            // ต้องฝังเป็น data: URI ไม่ใช่ path ในเครื่อง ไม่งั้นตอนรันใน container จะหาไม่เจอ
            builder.withHtmlContent(xhtml, null);
            builder.toStream(out);
            builder.run();

            return out.toByteArray();
        } catch (IOException ex) {
            // ปล่อยเป็น unchecked ให้ทะลุขึ้นไปเป็น 500 เพราะ IO พังตอนเขียนลงหน่วยความจำ
            // แปลว่ามีอะไรผิดปกติระดับเครื่อง ไม่ใช่ความผิดของคำขอ ไม่มีข้อความไทยให้ผู้ใช้
            throw new UncheckedIOException("สร้างไฟล์ PDF จาก template " + templateName + " ไม่สำเร็จ", ex);
        }
    }

    /**
     * เปิดไฟล์ฟอนต์จาก classpath ใหม่ทุกครั้งที่ builder ขอ
     * <p>
     * โยน IllegalStateException ถ้าหาไฟล์ไม่เจอ ไม่ปล่อยให้ส่ง null เข้าไป เพราะ
     * openhtmltopdf จะข้ามฟอนต์นั้นไปเงียบ ๆ แล้วได้ PDF ที่ตัวอักษรไทยหายทั้งใบ
     * ซึ่งกว่าจะรู้ตัวคือตอนผู้เช่าได้ใบเสร็จเปล่าไปแล้ว
     */
    private static InputStream fontStream(String path) {
        InputStream stream = PdfRenderer.class.getResourceAsStream(path);
        if (stream == null) {
            throw new IllegalStateException("หาไฟล์ฟอนต์ " + path + " ใน classpath ไม่เจอ");
        }
        return stream;
    }
}
