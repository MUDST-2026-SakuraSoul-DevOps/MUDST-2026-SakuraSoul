package com.sakurasoul.apartment.billing;

import com.sakurasoul.apartment.billing.ReceiptDtos.ReceiptResponse;
import com.sakurasoul.apartment.billing.ReceiptDtos.SendReceiptsRequest;
import com.sakurasoul.apartment.billing.ReceiptDtos.SendReceiptsResponse;
import com.sakurasoul.apartment.billing.ReceiptDtos.SentReceipt;
import com.sakurasoul.apartment.billing.ReceiptDtos.SkipReason;
import com.sakurasoul.apartment.billing.ReceiptDtos.SkippedReceipt;
import com.sakurasoul.apartment.common.MailUnavailableException;
import com.sakurasoul.apartment.common.NotFoundException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.mail.MailException;
import org.springframework.mail.MailPreparationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * ส่งใบเสร็จทางอีเมลพร้อมไฟล์ PDF (SSK-143 ส่วน backend ของ SSK-130)
 * <p>
 * แยกจาก ReceiptService เพราะคนละเรื่องกัน ตัวนั้นดูแลการออกใบกับการคิดเงิน ตัวนี้ดูแลการส่งใบที่ออกไปแล้ว
 * และต้องคุยกับบริการภายนอก (Mailpit) ซึ่งพังได้ในแบบที่ database ไม่พัง
 *
 * <h2>ทำไมไม่มี @Transactional ทั้งเมธอด</h2>
 * การส่งอีเมลย้อนกลับไม่ได้ ถ้าส่งอยู่ข้างใน transaction เดียวกับการบันทึก แล้ว transaction มา rollback ทีหลัง
 * ผู้เช่าจะได้อีเมลไปแล้วแต่ระบบบันทึกว่ายังไม่ส่ง และการถือ transaction ค้างไว้ระหว่างรอ SMTP ก็ล็อกแถวไว้นาน
 * โดยไม่จำเป็น จึงแยกเป็นช่วงสั้น ๆ คืออ่านใบทั้งหมดใน transaction แบบอ่านอย่างเดียว ส่งอีเมลนอก transaction
 * แล้วบันทึกว่าส่งแล้วทีละใบใน transaction ของใบนั้นเอง ใบที่ออกไปแล้วจึงถูกบันทึกทันที ไม่หายไปพร้อมใบถัดไปที่พัง
 */
@Service
public class ReceiptDispatchService {

    /**
     * ส่งได้กี่ใบต่อคำขอ ทุกใบต้อง render PDF ก่อนส่ง (ใบแรกหลังสตาร์ตช้าเป็นพิเศษเพราะต้องโหลดฟอนต์)
     * คำขอที่ใหญ่เกินจะค้างนานจนหน้าเว็บคิดว่าพัง หอนี้มี 24 ห้อง ใบค้างทั้งตึกจึงไม่เคยใกล้เพดานนี้
     */
    static final int MAX_RECEIPTS_PER_REQUEST = 100;

    private static final Logger log = LoggerFactory.getLogger(ReceiptDispatchService.class);

    private final ReceiptRepository receiptRepository;
    private final ReceiptPdfService receiptPdfService;
    private final ReceiptMailer receiptMailer;

    /** อ่านใบทั้งหมดพร้อมสัญญา ห้อง และผู้เช่าให้เสร็จก่อนเริ่มส่ง ดูคอมเมนต์ของคลาส */
    private final TransactionTemplate readTransaction;

    /**
     * บันทึกว่าส่งแล้วทีละใบ ตั้งเป็น REQUIRES_NEW ด้วยเหตุผลเดียวกับ ReceiptService.transactions
     * คือแต่ละใบต้องเป็น transaction ของตัวเองจริง ๆ ถึงวันหนึ่งจะมีคนเรียกจากข้างใน transaction อื่นก็ตาม
     */
    private final TransactionTemplate writeTransaction;

    public ReceiptDispatchService(ReceiptRepository receiptRepository, ReceiptPdfService receiptPdfService,
            ReceiptMailer receiptMailer, PlatformTransactionManager transactionManager) {
        this.receiptRepository = receiptRepository;
        this.receiptPdfService = receiptPdfService;
        this.receiptMailer = receiptMailer;
        this.readTransaction = new TransactionTemplate(transactionManager);
        this.readTransaction.setReadOnly(true);
        this.writeTransaction = new TransactionTemplate(transactionManager);
        this.writeTransaction.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    }

    /**
     * POST /api/receipts/send ส่งใบที่แอดมินเลือก ตามลำดับที่เลือก
     * <p>
     * ถ้ามี id ไหนไม่พบ ตอบ 404 ก่อนส่งใบไหนทั้งนั้น ผู้ใช้จะได้ไม่ต้องเดาว่าส่งไปแล้วกี่ใบ
     */
    public SendReceiptsResponse send(SendReceiptsRequest request) {
        List<Long> ids = requestedIds(request);
        List<ReceiptResponse> targets = readTransaction.execute(status -> load(ids));
        return dispatch(targets);
    }

    /**
     * รอบเตือนรายเดือนของงานตั้งเวลา (billingschedule.BillingScheduleService) ส่งทุกใบที่ยัง PENDING
     * รวมใบที่เลยกำหนดแล้ว ใบใหม่สุดก่อน ด้วยกฎชุดเดียวกับ send ใบที่จ่ายแล้วไม่ส่ง ผู้เช่าไม่มีอีเมลถูกข้าม
     * <p>
     * ไม่มีเพดาน 100 ใบเหมือนคำขอจากหน้าเว็บ เพราะไม่มีใครรอคำตอบอยู่ และใบค้างทั้งตึก 24 ห้องไม่เคยใกล้เพดานนั้น
     */
    public SendReceiptsResponse sendAllPending() {
        List<ReceiptResponse> targets = readTransaction.execute(status ->
                receiptRepository.findAllByStatusOrderByIssuedAtDesc(ReceiptStatus.PENDING).stream()
                        .map(ReceiptResponse::of)
                        .toList());
        return dispatch(targets);
    }

    /**
     * ตัด id ว่างกับ id ซ้ำ (เก็บตัวแรกไว้ ลำดับไม่เปลี่ยน) แล้วตรวจจำนวน
     * <p>
     * ตรวจหลังตัดซ้ำ เพราะ [3, 3] คือหนึ่งใบ ไม่ใช่สอง ข้อความเขียนไว้ให้ผู้ใช้อ่าน ตรงกับตาราง error
     * ใน docs/api-contract-billing.md และ backend จำลองของหน้าเว็บ
     */
    static List<Long> requestedIds(SendReceiptsRequest request) {
        List<Long> ids = request == null || request.receiptIds() == null
                ? List.of()
                : request.receiptIds().stream().filter(Objects::nonNull).distinct().toList();
        if (ids.isEmpty()) {
            throw new IllegalArgumentException("Please choose at least one receipt");
        }
        if (ids.size() > MAX_RECEIPTS_PER_REQUEST) {
            throw new IllegalArgumentException(
                    "You can send at most " + MAX_RECEIPTS_PER_REQUEST + " receipts at a time");
        }
        return ids;
    }

    /**
     * ส่งทีละใบแล้วรายงานผลรายใบ ใบที่ผู้เช่าไม่มีอีเมลถูกข้ามโดยไม่ต้องลองส่ง
     *
     * <h2>เมื่อไหร่ตอบ 503 เมื่อไหร่ตอบ 200 ที่มีใบ SEND_FAILED</h2>
     * ถ้าเมลเซิร์ฟเวอร์ติดต่อไม่ได้ตั้งแต่ใบแรกที่จะส่ง โยน MailUnavailableException ให้ทั้งคำขอเป็น 503
     * ซึ่งรับประกันว่าไม่มีใบไหนออกไป แต่ถ้าออกไปได้แล้วอย่างน้อยหนึ่งใบ ห้ามโยน เพราะผู้ใช้จะเข้าใจว่า
     * ไม่มีอะไรออกไปแล้วกดส่งซ้ำ ผู้เช่าที่ได้ไปแล้วจะได้ฉบับเดิมอีก จึงรายงานใบที่เหลือเป็น SEND_FAILED แทน
     * <p>
     * ประกอบอีเมลของใบไหนไม่ได้ (MailPreparationException) เป็นปัญหาของใบนั้นใบเดียว ไม่ใช่ของเมลเซิร์ฟเวอร์
     * จึงข้ามเป็น SEND_FAILED เสมอ ไม่เอาไปตอบว่าเมลเซิร์ฟเวอร์ติดต่อไม่ได้
     */
    SendReceiptsResponse dispatch(List<ReceiptResponse> targets) {
        List<SentReceipt> sent = new ArrayList<>();
        List<SkippedReceipt> skipped = new ArrayList<>();

        for (ReceiptResponse receipt : targets) {
            if (receipt.tenantEmail() == null) {
                skipped.add(SkippedReceipt.of(receipt, SkipReason.NO_EMAIL));
                continue;
            }

            try {
                receiptMailer.send(receipt, receiptPdfService.render(receipt.id()));
            } catch (MailPreparationException ex) {
                log.warn("ประกอบอีเมลของใบเสร็จ {} ไม่ได้ ข้ามใบนี้", receipt.receiptNo(), ex);
                skipped.add(SkippedReceipt.of(receipt, SkipReason.SEND_FAILED));
                continue;
            } catch (MailException ex) {
                if (sent.isEmpty()) {
                    log.warn("ส่งอีเมลใบเสร็จ {} ไม่ออก และยังไม่มีใบไหนในคำขอนี้ออกไป ตอบ 503",
                            receipt.receiptNo(), ex);
                    throw new MailUnavailableException(ex);
                }
                log.warn("ส่งอีเมลใบเสร็จ {} ไม่ออก หลังจากส่งใบก่อนหน้าไปแล้ว {} ใบ",
                        receipt.receiptNo(), sent.size(), ex);
                skipped.add(SkippedReceipt.of(receipt, SkipReason.SEND_FAILED));
                continue;
            }

            sent.add(markSent(receipt));
        }

        return new SendReceiptsResponse(sent, skipped);
    }

    /** อ่านใบตามลำดับที่ขอ ถ้าไม่พบสักใบให้ 404 ทั้งคำขอ ทำงานใน readTransaction */
    private List<ReceiptResponse> load(List<Long> ids) {
        Map<Long, Receipt> byId = receiptRepository.findWithLeaseByIdIn(ids).stream()
                .collect(Collectors.toMap(Receipt::getId, Function.identity()));

        List<ReceiptResponse> targets = new ArrayList<>();
        for (Long id : ids) {
            Receipt receipt = byId.get(id);
            if (receipt == null) {
                throw new NotFoundException("receipt", id);
            }
            targets.add(ReceiptResponse.of(receipt));
        }
        return targets;
    }

    /**
     * บันทึกว่าใบนี้ส่งแล้ว หลังเมลเซิร์ฟเวอร์รับอีเมลไปแล้วเท่านั้น
     * <p>
     * อ่านผ่าน findForUpdateById ที่ล็อกแถวไว้ เพราะ sentCount นับเพิ่มจากค่าที่อ่านมา สองคำขอที่ส่งใบเดียวกัน
     * พร้อมกันจะนับทับกันเหลือครั้งเดียว ถ้าไม่ล็อก (เหตุผลเดียวกับ ReceiptService.pay)
     * <p>
     * ตัดเวลาเหลือระดับมิลลิวินาทีก่อนเก็บ เวลาที่ตอบกลับตอนส่งกับเวลาที่ GET ได้ทีหลังจะได้เป็นค่าเดียวกัน
     * (PostgreSQL เก็บละเอียดแค่ไมโครวินาที ส่วน Instant.now() อาจละเอียดกว่านั้น)
     */
    private SentReceipt markSent(ReceiptResponse receipt) {
        Instant sentAt = Instant.now().truncatedTo(ChronoUnit.MILLIS);
        Receipt stamped = writeTransaction.execute(status -> {
            Receipt locked = receiptRepository.findForUpdateById(receipt.id())
                    .orElseThrow(() -> new NotFoundException("receipt", receipt.id()));
            locked.markSent(sentAt);
            return receiptRepository.saveAndFlush(locked);
        });
        return new SentReceipt(receipt.id(), receipt.receiptNo(), receipt.tenantName(), receipt.tenantEmail(),
                stamped.getLastSentAt(), stamped.getSentCount());
    }
}
