package com.sakurasoul.apartment.billing;

import com.sakurasoul.apartment.billing.ReceiptDtos.ReceiptItem;
import com.sakurasoul.apartment.billing.ReceiptDtos.ReceiptResponse;
import com.sakurasoul.apartment.pdf.DocumentFormat;

import java.math.BigDecimal;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * ตัวแปรของใบเสร็จหนึ่งใบที่ fragment "sheet" ใน pdf/receipt-sheet.html อ่าน (SSK-169)
 * <p>
 * แยกออกมาจาก ReceiptPdfService ให้ไฟล์ใบเดี่ยวกับไฟล์พิมพ์รวมประกอบหน้าของแต่ละใบจากที่เดียว
 * สองเอกสารจึงพิมพ์ใบเดียวกันออกมาเหมือนกันทุกบรรทัด
 * <p>
 * ค่าทุกตัวถูกฟอร์แมตเป็นข้อความตั้งแต่ใน Java แล้ว (ดูเหตุผลที่ {@link DocumentFormat}) template มีหน้าที่เดียวคือจัดวาง
 * เป็น map ไม่ใช่ record เพราะ toString ที่ record สร้างให้จะพิมพ์เลขบัญชีกับ payload ของ QR (SSK-168)
 */
final class ReceiptDocumentModel {

    /** ขีดกลางสำหรับบรรทัดที่ไม่มีหน่วยหรืออัตรา ใช้สัญลักษณ์เดียวกับที่หน้าเว็บโชว์ */
    private static final String NONE = "-";

    private ReceiptDocumentModel() {
    }

    /**
     * ประกอบตัวแปรของใบหนึ่งใบ
     * <p>
     * ดึงบรรทัดรายการมาจาก ReceiptResponse ตัวเดียวกับที่ API ตอบ ไม่ได้ประกอบใหม่
     * เพื่อให้ใบเสร็จบนกระดาษกับที่หน้าเว็บโชว์มีบรรทัดชุดเดียวกันเสมอ วันที่มีคนเพิ่ม
     * บรรทัดใหม่ (เช่นค่าเครื่องใช้ไฟฟ้าของ US-17) จะได้ขึ้นทั้งสองที่พร้อมกัน
     * ไม่ใช่ขึ้นแต่บนหน้าจอแล้วหายไปจากใบที่ผู้เช่าได้รับ
     */
    static Map<String, Object> of(ReceiptResponse response) {
        List<Map<String, String>> lines = new ArrayList<>();
        for (ReceiptItem item : response.items()) {
            Map<String, String> line = new LinkedHashMap<>();
            line.put("item", item.item());
            // ตัวเล็กใต้ชื่อรายการเฉพาะบรรทัดยอดยกมากับดอกเบี้ย (เลขที่ใบที่ยกมา และฐานของดอกเบี้ย) ผู้เช่าต้องเห็นที่มา
            // บรรทัดมาตรฐานไม่มี detail ส่วนบรรทัดค่าใช้จ่ายพิเศษ (มี chargeId) ยังพิมพ์แบบเดิม
            line.put("detail", item.chargeId() == null && item.detail() != null ? item.detail() : "");
            line.put("usage", usageText(item.usageValue(), item.usageUnit()));
            line.put("rate", item.rate() == null ? NONE : DocumentFormat.money(item.rate()));
            line.put("amount", DocumentFormat.money(item.amount()));
            lines.add(line);
        }

        Map<String, Object> model = new LinkedHashMap<>();
        model.put("receiptNo", response.receiptNo());
        model.put("issuedDate", DocumentFormat.date(response.issuedAt()));
        model.put("tenantName", response.tenantName());
        model.put("roomNumber", response.roomNumber());
        model.put("billingMonth", DocumentFormat.monthYear(YearMonth.parse(response.billingMonth()).atDay(1)));
        model.put("dueDate", DocumentFormat.date(response.dueDate()));
        model.put("items", lines);
        model.put("totalAmount", DocumentFormat.money(response.totalAmount()));

        // บล็อกสถานะสามแบบเหมือนแม่แบบอีเมล ตัวเลขของบิลแช่แข็ง ส่วนยอดที่จ่ายกับยอดคงเหลือเป็นค่า ณ ตอนสร้างไฟล์
        model.put("statusLine", statusLine(response));

        // บัญชีรับเงินกับ QR (SSK-168) เฉพาะใบที่ต้องจ่ายและมีสำเนาบัญชี บล็อกเดียวกับในอีเมล ดู PaymentBlock
        PaymentBlock payment = PaymentBlock.of(response);
        model.put("payment", payment == null ? null : payment.pdfModel());
        return model;
    }

    /**
     * ประโยคใต้ยอดรวม สามแบบตามชนิดของใบ (ReceiptStanding) เหมือนแม่แบบอีเมล
     * <p>
     * ประกอบเป็นประโยคเดียวตั้งแต่ใน Java ตามหลักของคลาสนี้ ถ้าแตกเป็น span ซ้อนใน template
     * openhtmltopdf วางข้อความคงที่กับค่าที่เติมคนละลำดับ ข้อความที่คัดลอกจาก PDF จะสลับกัน
     */
    static String statusLine(ReceiptResponse response) {
        return switch (ReceiptStanding.of(response)) {
            case DUE -> (response.paidAmount().signum() > 0
                    ? "Paid " + DocumentFormat.money(response.paidAmount()) + ". Balance due "
                            + DocumentFormat.money(response.balanceDue()) + ". "
                    : "Not paid yet. ")
                    + "Please pay by " + DocumentFormat.date(response.dueDate());
            case CARRIED -> "Unpaid balance carried to " + response.carriedToReceiptNo();
            case SETTLED -> "Paid on " + ReceiptMailer.paidDate(response)
                    + (response.paymentMethod() == null ? "" : " (" + response.paymentMethod() + ")");
        };
    }

    /** "120 units" หรือขีดกลางเมื่อบรรทัดนั้นเป็นยอดเหมาจ่ายที่ไม่มีมิเตอร์ */
    private static String usageText(BigDecimal usageValue, String usageUnit) {
        return usageValue == null ? NONE : DocumentFormat.units(usageValue) + " " + usageUnit;
    }
}
