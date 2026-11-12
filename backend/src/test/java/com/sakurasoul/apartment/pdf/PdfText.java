package com.sakurasoul.apartment.pdf;

import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDResources;
import org.apache.pdfbox.text.PDFTextStripper;
import org.apache.pdfbox.text.TextPosition;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.util.ArrayList;
import java.util.List;

/**
 * อ่านข้อความ ตำแหน่งตัวอักษร และฟอนต์ของ PDF ทีละหน้า ด้วย PDFBox ตัวที่มากับ openhtmltopdf (SSK-169)
 * <p>
 * ใช้เทียบไฟล์พิมพ์รวมกับไฟล์ใบเดี่ยว ข้อความเทียบแบบรวมช่องว่างทุกแบบเป็นช่องเดียว
 * ตำแหน่งปัดเหลือทศนิยมหนึ่งตำแหน่งของ point จึงเทียบกันตรง ๆ ได้โดยไม่ติดเศษจากการคำนวณ
 */
public final class PdfText {

    /** ตัวอักษรหนึ่งตัวกับตำแหน่งบนหน้า (point จากมุมซ้ายบน) */
    public record Glyph(String text, float x, float y) {
    }

    private PdfText() {
    }

    public static int pages(byte[] pdf) {
        try (PDDocument document = PDDocument.load(pdf)) {
            return document.getNumberOfPages();
        } catch (IOException ex) {
            throw new UncheckedIOException(ex);
        }
    }

    /** ข้อความของหน้าที่ page (เริ่มที่ 1) ช่องว่างทุกแบบรวมเป็นช่องเดียว */
    public static String textOfPage(byte[] pdf, int page) {
        try (PDDocument document = PDDocument.load(pdf)) {
            PDFTextStripper stripper = new PDFTextStripper();
            stripper.setStartPage(page);
            stripper.setEndPage(page);
            return stripper.getText(document).replaceAll("\\s+", " ").trim();
        } catch (IOException ex) {
            throw new UncheckedIOException(ex);
        }
    }

    /** ตัวอักษรทุกตัวของหน้าที่ page ตามลำดับที่ PDFBox อ่าน พร้อมตำแหน่งที่ปัดแล้ว */
    public static List<Glyph> glyphsOfPage(byte[] pdf, int page) {
        List<Glyph> glyphs = new ArrayList<>();
        try (PDDocument document = PDDocument.load(pdf)) {
            PDFTextStripper stripper = new PDFTextStripper() {
                @Override
                protected void writeString(String text, List<TextPosition> positions) {
                    for (TextPosition position : positions) {
                        glyphs.add(new Glyph(position.getUnicode(), round(position.getXDirAdj()),
                                round(position.getYDirAdj())));
                    }
                }
            };
            stripper.setStartPage(page);
            stripper.setEndPage(page);
            stripper.getText(document);
        } catch (IOException ex) {
            throw new UncheckedIOException(ex);
        }
        return glyphs;
    }

    /** ชื่อฟอนต์ที่หน้าที่ page ใช้ ฟอนต์ไทยต้องมี Sarabun ทุกหน้า */
    public static List<String> fontNamesOfPage(byte[] pdf, int page) {
        List<String> names = new ArrayList<>();
        try (PDDocument document = PDDocument.load(pdf)) {
            PDResources resources = document.getPage(page - 1).getResources();
            for (COSName name : resources.getFontNames()) {
                names.add(resources.getFont(name).getName());
            }
        } catch (IOException ex) {
            throw new UncheckedIOException(ex);
        }
        return names;
    }

    private static float round(float value) {
        return Math.round(value * 10) / 10f;
    }
}
