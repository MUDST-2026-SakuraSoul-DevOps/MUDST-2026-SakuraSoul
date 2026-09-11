package com.sakurasoul.apartment.billing;

import com.sakurasoul.apartment.billing.ReceiptDtos.ReceiptItem;
import com.sakurasoul.apartment.billing.ReceiptDtos.ReceiptResponse;
import com.sakurasoul.apartment.common.NotFoundException;
import com.sakurasoul.apartment.pdf.PdfDocument;
import com.sakurasoul.apartment.pdf.PdfRenderer;
import com.sakurasoul.apartment.pdf.ThaiFormat;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * ทำไฟล์ PDF ของใบเสร็จหนึ่งใบ (US-10 ปุ่ม Download ในป็อปอัป Generate Receipt)
 * <p>
 * แยกจาก ReceiptService เพราะคนละเรื่องกัน ตัวนั้นดูแลกฎการออกใบและการคิดเงิน
 * ตัวนี้ดูแลการพิมพ์ใบที่ออกไปแล้วลงกระดาษ ถ้ารวมกันคลาสเดียว การแก้ layout ของ
 * ใบเสร็จกับการแก้สูตรคิดเงินจะแตะไฟล์เดียวกันตลอด ซึ่งเป็นสองงานที่คนละคนทำ
 * <p>
 * ค่าทุกตัวถูกฟอร์แมตเป็นข้อความไทยตั้งแต่ใน Java แล้วส่งเข้า template เป็นสตริง
 * ล้วน ๆ (ดูเหตุผลที่ {@link ThaiFormat}) template จึงมีหน้าที่เดียวคือจัดวาง
 */
@Service
public class ReceiptPdfService {

    /** ขีดกลางสำหรับบรรทัดที่ไม่มีหน่วยหรืออัตรา ใช้สัญลักษณ์เดียวกับที่หน้าเว็บโชว์ */
    private static final String NONE = "-";

    private final ReceiptRepository receiptRepository;
    private final PdfRenderer pdfRenderer;

    public ReceiptPdfService(ReceiptRepository receiptRepository, PdfRenderer pdfRenderer) {
        this.receiptRepository = receiptRepository;
        this.pdfRenderer = pdfRenderer;
    }

    /**
     * อ่านใบเสร็จแล้ว render เป็น PDF
     * <p>
     * ทั้งก้อนอยู่ใน transaction เดียวเพราะต้องแตะห้องกับผู้เช่าที่โหลดแบบ LAZY
     * และ application.yml ปิด open-in-view ไว้ การแตะนอก transaction จะพังทันที
     * <p>
     * ชื่อไฟล์ใช้เลขที่ใบเสร็จตรง ๆ เช่น RC-2026-0001.pdf เพื่อให้แอดมินที่ดาวน์โหลด
     * ไว้หลายใบเรียงในโฟลเดอร์แล้วอ่านออกว่าใบไหนเป็นใบไหน โดยไม่ต้องเปิดทีละไฟล์
     */
    @Transactional(readOnly = true)
    public PdfDocument render(Long id) {
        Receipt receipt = receiptRepository.findWithLeaseById(id)
                .orElseThrow(() -> new NotFoundException("ใบเสร็จ", id));

        byte[] content = pdfRenderer.render("pdf/receipt", modelOf(receipt));
        return new PdfDocument(receipt.getReceiptNo() + ".pdf", content);
    }

    /**
     * ประกอบตัวแปรที่ template อ่าน
     * <p>
     * ดึงบรรทัดรายการมาจาก ReceiptResponse ตัวเดียวกับที่ API ตอบ ไม่ได้ประกอบใหม่
     * เพื่อให้ใบเสร็จบนกระดาษกับที่หน้าเว็บโชว์มีบรรทัดชุดเดียวกันเสมอ วันที่มีคนเพิ่ม
     * บรรทัดใหม่ (เช่นค่าเครื่องใช้ไฟฟ้าของ US-17) จะได้ขึ้นทั้งสองที่พร้อมกัน
     * ไม่ใช่ขึ้นแต่บนหน้าจอแล้วหายไปจากใบที่ผู้เช่าได้รับ
     */
    private static Map<String, Object> modelOf(Receipt receipt) {
        ReceiptResponse response = ReceiptResponse.of(receipt);

        List<Map<String, String>> lines = new ArrayList<>();
        for (ReceiptItem item : response.items()) {
            Map<String, String> line = new LinkedHashMap<>();
            line.put("item", item.item());
            line.put("usage", usageText(item.usageValue(), item.usageUnit()));
            line.put("rate", item.rate() == null ? NONE : ThaiFormat.money(item.rate()));
            line.put("amount", ThaiFormat.money(item.amount()));
            lines.add(line);
        }

        Map<String, Object> model = new LinkedHashMap<>();
        model.put("receiptNo", receipt.getReceiptNo());
        model.put("issuedDate", ThaiFormat.date(receipt.getIssuedAt()));
        model.put("tenantName", response.tenantName());
        model.put("roomNumber", response.roomNumber());
        model.put("billingMonth", ThaiFormat.monthYear(receipt.getBillingMonth()));
        model.put("dueDate", ThaiFormat.date(receipt.getDueDate()));
        model.put("items", lines);
        model.put("totalAmount", ThaiFormat.money(receipt.getTotalAmount()));
        model.put("paid", receipt.getStatus() == ReceiptStatus.PAID);
        model.put("paidDate", receipt.getPaidAt() == null ? "" : ThaiFormat.date(receipt.getPaidAt()));
        model.put("paymentMethod", receipt.getPaymentMethod() == null
                ? "" : "(" + receipt.getPaymentMethod() + ")");
        return model;
    }

    /** "120.00 units" หรือขีดกลางเมื่อบรรทัดนั้นเป็นยอดเหมาจ่ายที่ไม่มีมิเตอร์ */
    private static String usageText(BigDecimal usageValue, String usageUnit) {
        return usageValue == null ? NONE : ThaiFormat.money(usageValue) + " " + usageUnit;
    }
}
