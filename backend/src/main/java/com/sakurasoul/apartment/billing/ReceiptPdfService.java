package com.sakurasoul.apartment.billing;

import com.sakurasoul.apartment.billing.ReceiptDtos.ReceiptResponse;
import com.sakurasoul.apartment.common.NotFoundException;
import com.sakurasoul.apartment.pdf.PdfDocument;
import com.sakurasoul.apartment.pdf.PdfRenderer;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

import java.util.Map;

/**
 * ทำไฟล์ PDF ของใบเสร็จหนึ่งใบ (US-10 ปุ่ม Download ในป็อปอัป Generate Receipt)
 * <p>
 * แยกจาก ReceiptService เพราะคนละเรื่องกัน ตัวนั้นดูแลกฎการออกใบและการคิดเงิน
 * ตัวนี้ดูแลการพิมพ์ใบที่ออกไปแล้วลงกระดาษ ถ้ารวมกันคลาสเดียว การแก้ layout ของ
 * ใบเสร็จกับการแก้สูตรคิดเงินจะแตะไฟล์เดียวกันตลอด ซึ่งเป็นสองงานที่คนละคนทำ
 * <p>
 * ตัวแปรของแต่ละใบประกอบที่ {@link ReceiptDocumentModel} ที่เดียว ใช้ร่วมกับไฟล์พิมพ์รวม (SSK-169)
 */
@Service
public class ReceiptPdfService {

    /** หน้าตาของใบอยู่ที่ pdf/receipt-sheet.html ที่เดียว template นี้แค่ห่อ fragment ของใบหนึ่งใบ */
    static final String SINGLE_TEMPLATE = "pdf/receipt";

    private final ReceiptRepository receiptRepository;
    private final ReceiptViews receiptViews;
    private final PdfRenderer pdfRenderer;

    public ReceiptPdfService(ReceiptRepository receiptRepository, ReceiptViews receiptViews, PdfRenderer pdfRenderer) {
        this.receiptRepository = receiptRepository;
        this.receiptViews = receiptViews;
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
     * <p>
     * อ่านแบบ REPEATABLE_READ เหตุผลเดียวกับ ReceiptService.detail
     */
    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public PdfDocument render(Long id) {
        Receipt receipt = receiptRepository.findWithLeaseById(id)
                .orElseThrow(() -> new NotFoundException("receipt", id));
        return render(receiptViews.render(receipt));
    }

    /**
     * ทำ PDF จาก response ที่ประกอบไว้แล้ว ทุกค่าที่พิมพ์อยู่ใน response จึงไม่ต้องอ่านฐานข้อมูลอีก
     * <p>
     * การส่งอีเมล (ReceiptDispatchService) ใช้ตัวนี้ให้เนื้อความกับไฟล์แนบมาจากภาพเดียวกัน ถ้าอ่านใบใหม่ตอนทำไฟล์
     * การรับชำระที่เกิดระหว่างส่งหลายใบจะทำให้อีเมลบอกยอดหนึ่ง แต่ไฟล์แนบบอกอีกยอด
     */
    public PdfDocument render(ReceiptResponse response) {
        byte[] content = pdfRenderer.render(SINGLE_TEMPLATE, Map.of("receipt", ReceiptDocumentModel.of(response)));
        return new PdfDocument(response.receiptNo() + ".pdf", content);
    }
}
