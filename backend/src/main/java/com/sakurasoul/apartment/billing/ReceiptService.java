package com.sakurasoul.apartment.billing;

import com.sakurasoul.apartment.billing.ReceiptDtos.CreateReceiptRequest;
import com.sakurasoul.apartment.billing.ReceiptDtos.ReceiptResponse;
import com.sakurasoul.apartment.common.AppTime;
import com.sakurasoul.apartment.common.ConflictException;
import com.sakurasoul.apartment.common.NotFoundException;
import com.sakurasoul.apartment.lease.Lease;
import com.sakurasoul.apartment.lease.LeaseRepository;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Instant;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.format.DateTimeParseException;
import java.util.List;

@Service
public class ReceiptService {

    /** วันครบกำหนดตั้งต้นคือวันที่ 5 ของเดือนถัดจากเดือนที่เรียกเก็บ ตรงกับที่ดีไซน์ใบเสร็จเขียนไว้ */
    private static final int DEFAULT_DUE_DAY = 5;

    /**
     * ลองออกเลขที่ใบเสร็จใหม่ได้กี่ครั้งเมื่อชนกับใบที่เพิ่งถูกบันทึกไปพร้อมกัน
     * <p>
     * ห้าครั้งเกินพอ เพราะแต่ละรอบจะไปนับใบของปีนั้นใหม่ซึ่งรวมใบที่ชนะไปแล้วด้วย
     * เลขที่ได้รอบถัดไปจึงเลื่อนขึ้นเสมอ ไม่ใช่การสุ่มใหม่แล้วหวังว่าจะไม่ชน
     * ที่ยังต้องมีเพดานเพราะถ้าวันหนึ่งชนไม่หยุดจริง ๆ ต้องได้ error ที่มองเห็น
     * ไม่ใช่คำขอที่ค้างวนอยู่ใน server จนหมด thread
     */
    private static final int MAX_NUMBER_ATTEMPTS = 5;

    private static final String RECEIPT_NO_PREFIX = "RC-";

    private final ReceiptRepository receiptRepository;
    private final LeaseRepository leaseRepository;

    /**
     * ใช้ TransactionTemplate แทน @Transactional บน create() เพราะการลองใหม่ต้องเกิด
     * "นอก" transaction ที่เพิ่งพัง
     * <p>
     * พอ constraint ที่ database ดังขึ้นมา transaction นั้นถูกทำเครื่องหมายให้ rollback
     * ไปแล้ว จะเขียนอะไรต่อในนั้นไม่ได้อีกเลย ถ้าดัก DataIntegrityViolationException
     * ไว้ในเมธอดที่ติด @Transactional แล้ววนลูปลองใหม่ คำสั่งรอบถัดไปจะพังทุกครั้ง
     * ด้วย error คนละเรื่อง (UnexpectedRollbackException) ซึ่งไล่หาสาเหตุยากมาก
     * <p>
     * ตั้งเป็น REQUIRES_NEW ไม่ใช่ REQUIRED เพื่อให้แต่ละรอบเป็น transaction ของตัวเอง
     * จริง ๆ ถึงวันหนึ่งจะมีคนเรียก create() จากข้างใน transaction อื่นก็ตาม
     */
    private final TransactionTemplate transactions;

    public ReceiptService(ReceiptRepository receiptRepository, LeaseRepository leaseRepository,
            PlatformTransactionManager transactionManager) {
        this.receiptRepository = receiptRepository;
        this.leaseRepository = leaseRepository;
        this.transactions = new TransactionTemplate(transactionManager);
        this.transactions.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    }

    /**
     * รายการใบเสร็จ กรองด้วย leaseId, status และเดือนได้ ส่งมาไม่ครบก็ได้
     * <p>
     * กรองในหน่วยความจำด้วยเหตุผลเดียวกับ LeaseService.list คือสามตัวกรองที่ใส่มา
     * ไม่ใส่มาก็ได้รวมกันเป็นแปดแบบ และหอนี้มี 24 ห้อง ใบเสร็จจึงโตปีละไม่เกินหลักร้อย
     * ถ้าวันหนึ่งข้อมูลโตกว่านี้จริงค่อยเปลี่ยนไปใช้ Specification
     */
    @Transactional(readOnly = true)
    public List<ReceiptResponse> list(Long leaseId, ReceiptStatus status, String month) {
        LocalDate billingMonth = (month == null || month.isBlank()) ? null : parseBillingMonth(month);

        return receiptRepository.findAllByOrderByIssuedAtDesc().stream()
                .filter(receipt -> leaseId == null || receipt.getLease().getId().equals(leaseId))
                .filter(receipt -> status == null || receipt.getStatus() == status)
                .filter(receipt -> billingMonth == null || receipt.getBillingMonth().equals(billingMonth))
                .map(ReceiptResponse::of)
                .toList();
    }

    @Transactional(readOnly = true)
    public ReceiptResponse detail(Long id) {
        return ReceiptResponse.of(loadOrThrow(id));
    }

    /**
     * ออกใบเสร็จของเดือนหนึ่งให้สัญญาใบหนึ่ง (US-10)
     *
     * <h2>การแข่งกันของเลขที่ใบเสร็จ</h2>
     * เลขที่มาจากการนับใบของปีนั้นแล้วบวกหนึ่ง ซึ่งสองคำขอที่เข้ามาพร้อมกันจะนับได้
     * เลขเดียวกันทั้งคู่ ตัวกันซ้ำจริงคือ constraint receipt_no_uk ใน V9 ฝั่งนี้จึงต้อง
     * ดักเฉพาะการชนที่ constraint นั้นแล้วออกเลขใหม่ให้ใบที่แพ้ ไม่ใช่โยน 409 ใส่ผู้ใช้
     * เพราะการที่คนอื่นออกใบเสร็จพร้อมกันไม่ใช่ความผิดของคำขอนี้ และใบนี้ยังออกได้อยู่
     * แค่ต้องเปลี่ยนเลข
     * <p>
     * ส่วนการชนที่ receipt_lease_month_uk (ออกใบของเดือนเดียวกันซ้ำ) ต้องปล่อยให้
     * ทะลุขึ้นไปเป็น 409 ทันที ห้ามลองใหม่ เพราะลองกี่รอบก็ชนเหมือนเดิม และผู้ใช้ต้อง
     * รู้ว่าใบของเดือนนี้มีอยู่แล้ว ข้อความไทยของสองเส้นทางนี้เท่ากัน ทั้งเส้นที่เช็คเจอเอง
     * และเส้นที่ ApiExceptionHandler.constraintMessage แปลชื่อ constraint ออกมา
     * ผู้ใช้จึงเห็นประโยคเดียวกันไม่ว่าจะแพ้ทางไหน
     */
    public ReceiptResponse create(CreateReceiptRequest request) {
        LocalDate billingMonth = parseBillingMonth(request.billingMonth());
        LocalDate dueDate = request.dueDate() != null ? request.dueDate() : defaultDueDate(billingMonth);

        for (int attempt = 1; ; attempt++) {
            try {
                return transactions.execute(status -> issueOnce(request, billingMonth, dueDate));
            } catch (DataIntegrityViolationException ex) {
                if (attempt >= MAX_NUMBER_ATTEMPTS || !isReceiptNoClash(ex)) {
                    throw ex;
                }
            }
        }
    }

    /**
     * บันทึกว่าใบนี้ชำระแล้ว (US-10)
     * <p>
     * อ่านผ่าน findForUpdateById ซึ่งล็อกแถวไว้ ไม่ใช่ findWithLeaseById ธรรมดา เพราะ
     * การเช็ค "ชำระแล้วหรือยัง" ใน markPaid เป็นการเช็คในหน่วยความจำ สองคำขอที่กด
     * พร้อมกันจะผ่านการเช็คทั้งคู่แล้วใบหลังเขียนทับวันที่ชำระของใบแรกเงียบ ๆ
     * ตัวกันของจริงจึงเป็นล็อกที่ database ดูเหตุผลเต็มที่ ReceiptRepository
     * <p>
     * ลำดับสองบรรทัดนี้สลับกันไม่ได้ ต้องล็อกก่อนแล้วค่อยอ่านเพื่อประกอบ response
     * ถ้าอ่านก่อน ตัวที่ล็อกได้ทีหลังจะเป็นก้อนเดิมใน persistence context ซึ่งเป็นค่าเก่า
     * <p>
     * ใช้ saveAndFlush ให้การเขียนเกิดตั้งแต่ยังอยู่ในเมธอดนี้ ด้วยเหตุผลเดียวกับ
     * LeaseService.terminate คือถ้าปล่อยไป flush ตอน commit ข้างนอก error จาก
     * database จะโผล่หลัง handler ทำงานไปแล้ว ผู้เรียกจะได้ 500 แทนรหัสที่ตกลงกันไว้
     */
    @Transactional
    public ReceiptResponse pay(Long id, String paymentMethod) {
        Receipt receipt = receiptRepository.findForUpdateById(id)
                .orElseThrow(() -> new NotFoundException("ใบเสร็จ", id));

        receipt.markPaid(trimToNull(paymentMethod), Instant.now());
        receiptRepository.saveAndFlush(receipt);

        return ReceiptResponse.of(loadOrThrow(id));
    }

    /**
     * แปลง "YYYY-MM" ที่หน้าเว็บส่งมาเป็นวันที่ 1 ของเดือนนั้น
     * <p>
     * ที่ต้องแปลงเองแทนที่จะให้ Jackson แปลงให้ เพราะ Jackson ที่อ่านไม่ออกจะตอบ
     * ข้อความอังกฤษของตัวเองซึ่งเอาไปโชว์ใต้ฟอร์มไม่ได้ ส่วนตรงนี้คุมข้อความไทยได้เอง
     */
    static LocalDate parseBillingMonth(String text) {
        try {
            return YearMonth.parse(text.trim()).atDay(1);
        } catch (DateTimeParseException ex) {
            throw new IllegalArgumentException("รูปแบบเดือนต้องเป็น YYYY-MM");
        }
    }

    /** วันที่ 5 ของเดือนถัดไป เช่น รอบบิลเดือน 2026-09 ครบกำหนด 2026-10-05 */
    static LocalDate defaultDueDate(LocalDate billingMonth) {
        return billingMonth.plusMonths(1).withDayOfMonth(DEFAULT_DUE_DAY);
    }

    /** เลขที่ถัดไปของปีนี้ เช่น ออกไปแล้ว 12 ใบในปี 2026 ใบถัดไปคือ RC-2026-0013 */
    String nextReceiptNo() {
        String prefix = RECEIPT_NO_PREFIX + AppTime.today().getYear() + "-";
        long issuedThisYear = receiptRepository.countByReceiptNoStartingWith(prefix);
        return prefix + String.format("%04d", issuedThisYear + 1);
    }

    /** หนึ่งครั้งของการพยายามออกใบเสร็จ ทั้งก้อนอยู่ใน transaction เดียว ดูคอมเมนต์ที่ transactions */
    private ReceiptResponse issueOnce(CreateReceiptRequest request, LocalDate billingMonth, LocalDate dueDate) {
        Lease lease = leaseRepository.findById(request.leaseId())
                .orElseThrow(() -> new NotFoundException("สัญญา", request.leaseId()));

        // เดือนที่สัญญาไม่ได้ครอบเลยแม้แต่วันเดียว คือเดือนที่ผู้เช่ายังไม่ได้เข้าอยู่หรือย้ายออกไปแล้ว
        // ใบเสร็จของเดือนแบบนั้นคือการเรียกเก็บเงินผิดคน และใบที่ออกไปแล้วลบไม่ได้แก้ไม่ได้
        // (ไม่มี endpoint ลบโดยตั้งใจ ส่วนใบลดหนี้ยังไม่ได้ตกลงกัน) จึงต้องกันตั้งแต่ตอนออก
        //
        // เทียบแบบ "ทับกันไหม" ไม่ใช่ "อยู่ในช่วงทั้งเดือนไหม" เพื่อให้เดือนแรกกับเดือนสุดท้าย
        // ที่ผู้เช่าอยู่ไม่เต็มเดือนยังออกใบได้ รวมถึงใบสุดท้ายของสัญญาที่ปิดไปแล้วด้วย
        LocalDate monthEnd = billingMonth.withDayOfMonth(billingMonth.lengthOfMonth());
        if (!lease.overlaps(billingMonth, monthEnd)) {
            throw new IllegalArgumentException("เดือนที่เรียกเก็บอยู่นอกช่วงสัญญา");
        }

        // เช็คไว้เพื่อให้ได้ข้อความที่อ่านรู้เรื่อง ตัวกันซ้ำจริงคือ receipt_lease_month_uk
        if (receiptRepository.existsByLeaseIdAndBillingMonth(lease.getId(), billingMonth)) {
            throw new ConflictException("ออกใบเสร็จของเดือนนี้ให้สัญญานี้ไปแล้ว");
        }

        Receipt receipt = Receipt.issue(lease, billingMonth,
                request.electricUnits(), request.waterUnits(), dueDate, Instant.now());
        receipt.numberedAs(nextReceiptNo());

        return ReceiptResponse.of(receiptRepository.saveAndFlush(receipt));
    }

    /** ชนเรื่องเลขที่ใบเสร็จซ้ำหรือเปล่า ถ้าใช่ออกเลขใหม่แล้วลองอีกครั้งได้ */
    private static boolean isReceiptNoClash(DataIntegrityViolationException ex) {
        String cause = ex.getMostSpecificCause().getMessage();
        return cause != null && cause.contains("receipt_no_uk");
    }

    private Receipt loadOrThrow(Long id) {
        return receiptRepository.findWithLeaseById(id)
                .orElseThrow(() -> new NotFoundException("ใบเสร็จ", id));
    }

    /** ช่องทางการจ่ายที่เป็นช่องว่างล้วนเก็บเป็น null กฎเดียวกับอีเมลใน TenantService */
    private static String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
