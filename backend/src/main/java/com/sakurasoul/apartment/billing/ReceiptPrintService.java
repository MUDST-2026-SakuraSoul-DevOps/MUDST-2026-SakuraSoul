package com.sakurasoul.apartment.billing;

import com.sakurasoul.apartment.billing.ReceiptDtos.PrintReceiptsRequest;
import com.sakurasoul.apartment.billing.ReceiptDtos.ReceiptResponse;
import com.sakurasoul.apartment.common.NotFoundException;
import com.sakurasoul.apartment.pdf.PdfDocument;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.LocalDate;
import java.time.YearMonth;
import java.util.List;
import java.util.Set;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;

/**
 * พิมพ์ใบเสร็จหลายใบเป็น PDF ไฟล์เดียว (SSK-169) ตามสัญญา API หัวข้อ "พิมพ์ใบเสร็จรวม"
 * <p>
 * สามขั้น ตรวจคำขอ (PrintSelection ยังไม่แตะฐานข้อมูล) → อ่านใบทั้งหมดใน transaction เดียว → render นอก transaction
 * <ul>
 *   <li>อ่านแบบ REPEATABLE_READ อ่านอย่างเดียว ยอดของแต่ละใบประกอบจากหลายคิวรี (ReceiptViews) ต้องเห็นภาพเดียวกัน
 *       การนับกับการโหลดของทั้งเดือนก็ตรงกัน และ id ที่หาไม่เจอถูกจับในภาพเดียวกับที่พิมพ์ ไฟล์จึงไม่มีทางขาดใบเงียบ ๆ</li>
 *   <li>render หลังปิด transaction ทุกอย่างที่พิมพ์อยู่ใน ReceiptResponse แล้ว การ render หนึ่งร้อยหน้าไม่ควรถือ connection
 *       ของ Hikari ไว้ระหว่างนั้น แบบเดียวกับ ReceiptDispatchService</li>
 * </ul>
 * ใบทุกสถานะพิมพ์ได้ หน้าของแต่ละใบเหมือนไฟล์ใบเดี่ยวของใบนั้น QR จึงขึ้นเฉพาะใบล่าสุดที่ยังต้องจ่าย (SSK-168)
 */
@Service
public class ReceiptPrintService {

    private static final Logger log = LoggerFactory.getLogger(ReceiptPrintService.class);

    private final ReceiptRepository receiptRepository;
    private final ReceiptViews receiptViews;
    private final ReceiptPdfService receiptPdfService;
    private final TransactionTemplate readTransaction;

    public ReceiptPrintService(ReceiptRepository receiptRepository, ReceiptViews receiptViews,
            ReceiptPdfService receiptPdfService, PlatformTransactionManager transactionManager) {
        this.receiptRepository = receiptRepository;
        this.receiptViews = receiptViews;
        this.receiptPdfService = receiptPdfService;
        this.readTransaction = new TransactionTemplate(transactionManager);
        this.readTransaction.setReadOnly(true);
        this.readTransaction.setIsolationLevel(TransactionDefinition.ISOLATION_REPEATABLE_READ);
    }

    /** request เป็น null ได้ (POST ที่ไม่มี body) ได้ข้อความเดียวกับไม่ส่งอะไรมาเลย */
    public PdfDocument print(PrintReceiptsRequest request) {
        PrintSelection selection = PrintSelection.of(request);
        List<ReceiptResponse> receipts = readTransaction.execute(status -> load(selection));

        long started = System.nanoTime();
        PdfDocument pdf = receiptPdfService.renderAll(receipts, selection.fileName());
        // ตัวเลขที่ AC ของการ์ดให้วัด ไม่มีเลขที่ใบ ชื่อ หรือบัญชีใน log
        log.info("พิมพ์ใบเสร็จรวม {} ใบ ขนาด {} ไบต์ render ใช้ {} ms", receipts.size(), pdf.content().length,
                TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - started));
        return pdf;
    }

    private List<ReceiptResponse> load(PrintSelection selection) {
        List<Receipt> receipts = selection.byIds()
                ? byIds(selection.receiptIds())
                : byMonth(selection.month(), selection.status());
        return receiptViews.render(receipts.stream().sorted(ReceiptPrintOrder.BY_ROOM_THEN_MONTH).toList());
    }

    /** ทุก id ต้องมีจริง ขาดใบไหนตอบ 404 บอกทุกใบที่ขาด ไม่พิมพ์ไฟล์ที่ไม่ครบ */
    private List<Receipt> byIds(List<Long> ids) {
        List<Receipt> found = receiptRepository.findWithLeaseByIdIn(ids);
        if (found.size() < ids.size()) {
            Set<Long> foundIds = found.stream().map(Receipt::getId).collect(Collectors.toSet());
            throw new NotFoundException(PrintSelection.notFoundMessage(
                    ids.stream().filter(id -> !foundIds.contains(id)).toList()));
        }
        return found;
    }

    /** นับก่อนโหลด เดือนที่ไม่มีใบตามตัวกรองตอบ 400 ไม่ทำ PDF เปล่า เกินเพดานถูกปฏิเสธก่อนโหลดทั้งเดือนขึ้นมา */
    private List<Receipt> byMonth(YearMonth month, ReceiptStatus status) {
        LocalDate firstDay = month.atDay(1);
        long count = status == null
                ? receiptRepository.countByBillingMonth(firstDay)
                : receiptRepository.countByBillingMonthAndStatus(firstDay, status);
        if (count == 0) {
            throw new IllegalArgumentException(PrintSelection.noneMessage(month));
        }
        if (count > PrintSelection.MAX_RECEIPTS) {
            throw new IllegalArgumentException(PrintSelection.TOO_MANY);
        }
        return status == null
                ? receiptRepository.findWithLeaseByBillingMonth(firstDay)
                : receiptRepository.findWithLeaseByBillingMonthAndStatus(firstDay, status);
    }
}
