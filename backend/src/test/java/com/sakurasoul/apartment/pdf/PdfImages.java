package com.sakurasoul.apartment.pdf;

import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDResources;
import org.apache.pdfbox.pdmodel.graphics.PDXObject;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;

import java.awt.image.BufferedImage;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.util.ArrayList;
import java.util.List;

/**
 * ภาพที่ฝังอยู่ในไฟล์ PDF ทุกหน้า อ่านด้วย PDFBox ตัวที่มากับ openhtmltopdf (SSK-168)
 * <p>
 * อ่านภาพต้นฉบับที่ฝังไว้ ไม่ใช่ภาพที่ render หน้ากระดาษออกมา จึงถอดรหัส QR ได้ตรงตามที่วาด
 * ไม่ขึ้นกับความละเอียดตอนพิมพ์
 */
public final class PdfImages {

    private PdfImages() {
    }

    public static List<BufferedImage> of(byte[] pdf) {
        return byPage(pdf).stream().flatMap(List::stream).toList();
    }

    /** ภาพของแต่ละหน้าแยกกัน (SSK-169) ใช้เช็คว่า QR ของใบหนึ่งอยู่บนหน้าของใบนั้นในไฟล์พิมพ์รวม */
    public static List<List<BufferedImage>> byPage(byte[] pdf) {
        List<List<BufferedImage>> pages = new ArrayList<>();
        try (PDDocument document = PDDocument.load(pdf)) {
            for (PDPage page : document.getPages()) {
                List<BufferedImage> images = new ArrayList<>();
                PDResources resources = page.getResources();
                for (COSName name : resources.getXObjectNames()) {
                    PDXObject xObject = resources.getXObject(name);
                    if (xObject instanceof PDImageXObject image) {
                        images.add(image.getImage());
                    }
                }
                pages.add(images);
            }
        } catch (IOException ex) {
            throw new UncheckedIOException(ex);
        }
        return pages;
    }
}
