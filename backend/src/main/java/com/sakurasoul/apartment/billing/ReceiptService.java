package com.sakurasoul.apartment.billing;

import com.sakurasoul.apartment.billing.ReceiptDtos.CreateReceiptRequest;
import com.sakurasoul.apartment.billing.ReceiptDtos.ReceiptResponse;
import com.sakurasoul.apartment.billing.ReceiptDtos.UpdateReceiptRequest;
import com.sakurasoul.apartment.common.AppTime;
import com.sakurasoul.apartment.common.ConflictException;
import com.sakurasoul.apartment.common.Months;
import com.sakurasoul.apartment.common.NotFoundException;
import com.sakurasoul.apartment.extracharge.ChargeRecurrence;
import com.sakurasoul.apartment.lease.Lease;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Instant;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.List;
import java.util.Optional;
import java.util.Set;

@Service
public class ReceiptService {

    /** วันครบกำหนดตั้งต้นคือวันที่ 5 ของเดือนถัดจากเดือนที่เรียกเก็บ ตรงกับที่ดีไซน์ใบเสร็จเขียนไว้ */
    private static final int DEFAULT_DUE_DAY = 5;

    /**
     * ลองออกใบใหม่ได้กี่ครั้งเมื่อชนกับใบที่เพิ่งถูกบันทึกไปพร้อมกัน ดู isRetryable
     * <p>
     * ห้าครั้งเกินพอ เพราะแต่ละรอบจะไปนับใบของปีนั้นใหม่ซึ่งรวมใบที่ชนะไปแล้วด้วย
     * เลขที่ได้รอบถัดไปจึงเลื่อนขึ้นเสมอ ไม่ใช่การสุ่มใหม่แล้วหวังว่าจะไม่ชน
     * ที่ยังต้องมีเพดานเพราะถ้าวันหนึ่งชนไม่หยุดจริง ๆ ต้องได้ error ที่มองเห็น
     * ไม่ใช่คำขอที่ค้างวนอยู่ใน server จนหมด thread
     */
    private static final int MAX_ATTEMPTS = 5;

    private static final String RECEIPT_NO_PREFIX = "RC-";

    /** ข้อความเดียวกับที่ ApiExceptionHandler แปลจาก receipt_lease_month_uk ผู้ใช้เห็นประโยคเดียวไม่ว่าจะแพ้ทางไหน */
    private static final String SAME_MONTH_MESSAGE = "A receipt for this month has already been issued for this lease";

    private final ReceiptRepository receiptRepository;
    private final ReceiptLineRepository receiptLineRepository;
    private final LeaseAccounts leaseAccounts;
    private final ReceiptViews receiptViews;

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

    public ReceiptService(ReceiptRepository receiptRepository, ReceiptLineRepository receiptLineRepository,
            LeaseAccounts leaseAccounts, ReceiptViews receiptViews, PlatformTransactionManager transactionManager) {
        this.receiptRepository = receiptRepository;
        this.receiptLineRepository = receiptLineRepository;
        this.leaseAccounts = leaseAccounts;
        this.receiptViews = receiptViews;
        this.transactions = new TransactionTemplate(transactionManager);
        this.transactions.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    }

    /**
     * รายการใบเสร็จ กรองด้วย leaseId, status และเดือนได้ ส่งมาไม่ครบก็ได้
     * <p>
     * กรองในหน่วยความจำด้วยเหตุผลเดียวกับ LeaseService.list คือสามตัวกรองที่ใส่มา
     * ไม่ใส่มาก็ได้รวมกันเป็นแปดแบบ และหอนี้มี 24 ห้อง ใบเสร็จจึงโตปีละไม่เกินหลักร้อย
     * ถ้าวันหนึ่งข้อมูลโตกว่านี้จริงค่อยเปลี่ยนไปใช้ Specification
     * <p>
     * status รับเป็นข้อความเพื่อตอบข้อความในสัญญาเมื่อค่าไม่รู้จัก (ดู ReceiptStatus.parseFilter) กรองจากสถานะของใบเอง
     * <p>
     * อ่านแบบ REPEATABLE_READ เพราะ response ประกอบจากหลายคิวรี ต้องเห็นภาพเดียวกันทั้งก้อน ดู ReceiptViews
     */
    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public List<ReceiptResponse> list(Long leaseId, String status, String month) {
        ReceiptStatus statusFilter = ReceiptStatus.parseFilter(status);
        LocalDate billingMonth = (month == null || month.isBlank()) ? null : parseBillingMonth(month);

        return receiptViews.render(receiptRepository.findAllByOrderByIssuedAtDesc().stream()
                .filter(receipt -> leaseId == null || receipt.getLease().getId().equals(leaseId))
                .filter(receipt -> statusFilter == null || receipt.getStatus() == statusFilter)
                .filter(receipt -> billingMonth == null || receipt.getBillingMonth().equals(billingMonth))
                .toList());
    }

    /** อ่านแบบ REPEATABLE_READ เหตุผลเดียวกับ list */
    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public ReceiptResponse detail(Long id) {
        return receiptViews.render(loadOrThrow(id));
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
     * <p>
     * ค่าครั้งเดียว (SSK-165) เคยแข่งกันได้แบบเดียวกับเลขที่ ตั้งแต่ SSK-164 สองใบของสัญญาเดียวกันเข้าทีละใบด้วยล็อกของสัญญา
     * จึงไม่ชนกันแล้ว receipt_line_one_time_uk กับการลองใหม่ยังอยู่เป็นตาข่าย
     *
     * <h2>ยอดยกมาและดอกเบี้ย (SSK-164)</h2>
     * ใบเดิมทุกใบของสัญญาที่ยังค้างถูกรวมเป็นยอดยกมาของใบใหม่ แล้วชี้มาที่ใบใหม่ (carriedToReceiptId)
     * ดอกเบี้ยคิดจากต้นเงินคงเหลือของใบที่เลยกำหนดแล้ว ณ วันอ้างอิง (LateInterest.referenceDate) ตามอัตราที่สัญญาล็อกไว้
     * ใบของสัญญาต้องออกตามลำดับเดือน เพราะยอดยกมาของใบที่ออกไปแล้วถูกแช่แข็ง ใบที่แทรกเข้ามาทีหลังจะไม่ถูกนับ
     * รอบที่แพ้การแข่งเลขที่ถูก rollback ทั้งก้อนรวมการยกยอด รอบใหม่ล็อกและคิดใหม่ทั้งหมด
     */
    public ReceiptResponse create(CreateReceiptRequest request) {
        LocalDate billingMonth = parseBillingMonth(request.billingMonth());
        LocalDate dueDate = request.dueDate() != null ? request.dueDate() : defaultDueDate(billingMonth);

        for (int attempt = 1; ; attempt++) {
            try {
                return transactions.execute(status -> issueOnce(request, billingMonth, dueDate));
            } catch (DataIntegrityViolationException ex) {
                if (attempt >= MAX_ATTEMPTS || !isRetryable(ex)) {
                    throw ex;
                }
            }
        }
    }

    /**
     * แก้ไขหน่วยไฟ หน่วยน้ำ และเดือนที่เรียกเก็บของใบเสร็จ (SSK-155)
     * <p>
     * อัตราและเลขที่ใบเสร็จคงเดิม คำนวณยอดใหม่ด้วยอัตรา snapshot เดิมของใบนั้น ยอดยกมากับดอกเบี้ยที่แช่แข็งไว้ไม่เปลี่ยน
     * แก้ได้เฉพาะใบล่าสุดของสัญญาที่ยังไม่ถูกยกยอดและยังไม่มีการชำระ (SSK-163) ดู assertEditable
     * ลำดับการตรวจตามสัญญา: 404 → ถูกยกยอด 409 → มีการชำระ 409 → ไม่ใช่ใบล่าสุด 409 → ค่าในคำขอ 400
     * → เดือนซ้ำ 409 → เดือนไม่หลังใบก่อนหน้า 409
     * <p>
     * ล็อกทั้งสัญญาเหมือนการออกใบและการรับชำระ (LeaseAccounts.lock) การตัดสินว่าแก้ได้ไหมต้องไม่เปลี่ยนระหว่างนี้
     * saveAndFlush ให้ error จาก database ดังในเมธอดนี้ ไม่ใช่ตอน commit หลัง handler ทำงานไปแล้ว
     */
    @Transactional
    public ReceiptResponse update(Long id, UpdateReceiptRequest request) {
        Long leaseId = receiptRepository.findLeaseIdById(id)
                .orElseThrow(() -> new NotFoundException("receipt", id));
        LeaseAccount account = leaseAccounts.lock(leaseId).account();
        Receipt receipt = account.receipt(id);
        assertEditable(account, receipt);

        LocalDate billingMonth = parseBillingMonth(request.billingMonth());

        YearMonth currentMonth = YearMonth.from(AppTime.today());
        if (YearMonth.from(billingMonth).isAfter(currentMonth)) {
            throw new IllegalArgumentException("The billing month cannot be in the future");
        }

        LocalDate monthEnd = billingMonth.withDayOfMonth(billingMonth.lengthOfMonth());
        if (!receipt.getLease().overlaps(billingMonth, monthEnd)) {
            throw new IllegalArgumentException("The billing month is outside the lease period");
        }

        if (!billingMonth.equals(receipt.getBillingMonth()) && account.inMonth(billingMonth).isPresent()) {
            throw new ConflictException(SAME_MONTH_MESSAGE);
        }
        Optional<Receipt> previous = account.before(receipt);
        if (previous.isPresent() && !billingMonth.isAfter(previous.get().getBillingMonth())) {
            throw new ConflictException("The billing month must be after the previous receipt of this lease ("
                    + previous.get().billingMonthText() + ")");
        }

        receipt.update(billingMonth, request.electricUnits(), request.waterUnits(), Instant.now());
        receiptRepository.saveAndFlush(receipt);

        return receiptViews.render(receipt);
    }

    /**
     * แก้ได้เฉพาะใบล่าสุดที่ยังไม่ถูกยกยอดและยังไม่มีการชำระ
     * <ul>
     *   <li>ใบที่ถูกยกยอดแล้ว ยอดของมันอยู่ในบิลใหม่แล้ว แก้แล้วสองใบจะไม่ตรงกัน</li>
     *   <li>ใบที่มีการชำระ (นับเฉพาะที่ยังไม่ถูกยกเลิก) ยอดที่ตัดไปจะไม่ตรงกับยอดใหม่ ยกเลิกการชำระก่อนแล้วแก้ได้</li>
     *   <li>ใบที่ไม่ใช่ใบล่าสุดแต่ไม่ถูกยกยอดและไม่มีการชำระ (เกิดได้ทางเดียวคือใบยอดศูนย์) ห้ามด้วยเหตุผลเดียวกับการออกใบ
     *       ย้อนเดือน</li>
     * </ul>
     */
    private static void assertEditable(LeaseAccount account, Receipt receipt) {
        if (receipt.getCarriedToReceiptId() != null) {
            throw new ConflictException("This receipt was carried into "
                    + account.receipt(receipt.getCarriedToReceiptId()).getReceiptNo() + " and can no longer be edited");
        }
        if (account.hasActivePaymentsOn(receipt) || account.settledAmount(receipt).signum() > 0) {
            throw new ConflictException("Receipts with payments cannot be edited");
        }
        if (!account.isLatest(receipt)) {
            throw new ConflictException(laterMonthMessage(account.latest().orElseThrow()));
        }
    }

    private static String laterMonthMessage(Receipt latest) {
        return "A receipt for a later month (" + latest.billingMonthText() + ") has already been issued for this lease";
    }

    /**
     * แปลง "YYYY-MM" ที่หน้าเว็บส่งมาเป็นวันที่ 1 ของเดือนนั้น
     * <p>
     * ที่ต้องแปลงเองแทนที่จะให้ Jackson แปลงให้ เพราะ Jackson ที่อ่านไม่ออกจะตอบ
     * ข้อความอังกฤษของตัวเองซึ่งเอาไปโชว์ใต้ฟอร์มไม่ได้ ส่วนตรงนี้คุมข้อความเองได้
     */
    static LocalDate parseBillingMonth(String text) {
        return Months.parse(text, "The billing month must be in YYYY-MM format").atDay(1);
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

    /**
     * หนึ่งครั้งของการพยายามออกใบเสร็จ ทั้งก้อนอยู่ใน transaction เดียว ดูคอมเมนต์ที่ transactions
     * <p>
     * ล็อกสัญญากับใบทุกใบก่อนตัดสินใจ (LeaseAccounts.lock) ใบไหนล่าสุดและยอดค้างเท่าไหร่ต้องไม่เปลี่ยนจนกว่าจะ commit
     * การรับชำระที่เข้ามาพร้อมกันจึงเกิดก่อนหรือหลังการออกใบทั้งก้อน ยอดยกมาไม่มีทางนับเงินก้อนนั้นครึ่ง ๆ
     */
    private ReceiptResponse issueOnce(CreateReceiptRequest request, LocalDate billingMonth, LocalDate dueDate) {
        LeaseAccounts.Locked locked = leaseAccounts.lock(request.leaseId());
        Lease lease = locked.lease();
        LeaseAccount account = locked.account();

        LocalDate today = AppTime.today();
        if (YearMonth.from(billingMonth).isAfter(YearMonth.from(today))) {
            throw new IllegalArgumentException("The billing month cannot be in the future");
        }

        // เดือนที่สัญญาไม่ได้ครอบเลยแม้แต่วันเดียว คือเดือนที่ผู้เช่ายังไม่ได้เข้าอยู่หรือย้ายออกไปแล้ว
        // ใบเสร็จของเดือนแบบนั้นคือการเรียกเก็บเงินผิดคน และใบที่ออกไปแล้วลบไม่ได้แก้ไม่ได้
        // (ไม่มี endpoint ลบโดยตั้งใจ ส่วนใบลดหนี้ยังไม่ได้ตกลงกัน) จึงต้องกันตั้งแต่ตอนออก
        //
        // เทียบแบบ "ทับกันไหม" ไม่ใช่ "อยู่ในช่วงทั้งเดือนไหม" เพื่อให้เดือนแรกกับเดือนสุดท้าย
        // ที่ผู้เช่าอยู่ไม่เต็มเดือนยังออกใบได้ รวมถึงใบสุดท้ายของสัญญาที่ปิดไปแล้วด้วย
        LocalDate monthEnd = billingMonth.withDayOfMonth(billingMonth.lengthOfMonth());
        if (!lease.overlaps(billingMonth, monthEnd)) {
            throw new IllegalArgumentException("The billing month is outside the lease period");
        }

        // เช็คไว้เพื่อให้ได้ข้อความที่อ่านรู้เรื่อง ตัวกันซ้ำจริงคือ receipt_lease_month_uk
        if (account.inMonth(billingMonth).isPresent()) {
            throw new ConflictException(SAME_MONTH_MESSAGE);
        }
        Optional<Receipt> latest = account.latest();
        if (latest.isPresent() && latest.get().getBillingMonth().isAfter(billingMonth)) {
            throw new ConflictException(laterMonthMessage(latest.get()));
        }

        Receipt.CarryForward carry = account.carryForwardFor(YearMonth.from(billingMonth), today, lease.getLateTerms());
        Set<Long> billedOneTimeCharges =
                receiptLineRepository.findChargeIdsBilledToLease(lease.getId(), ChargeRecurrence.ONE_TIME);
        Receipt receipt = Receipt.issue(lease, billingMonth,
                request.electricUnits(), request.waterUnits(), dueDate, Instant.now(), billedOneTimeCharges, carry);
        receipt.numberedAs(nextReceiptNo());

        // บันทึกใบใหม่ก่อน ต้องได้ id และเป็นจุดที่ชนเลขที่ แล้วค่อยชี้ใบเดิมที่ยังค้างมาที่ใบนี้
        // รวมใบที่เคยชี้ไปบิลเดือนก่อน ส่วนใบที่ตัดครบแล้วไม่ถูกแตะ carriedToReceiptId ของมันเป็นประวัติ
        Receipt saved = receiptRepository.saveAndFlush(receipt);
        account.unpaid().forEach(unpaid -> unpaid.carryTo(saved.getId()));
        receiptRepository.flush();
        return receiptViews.render(saved);
    }

    /**
     * ชนกับใบที่เพิ่งบันทึกไปพร้อมกันแบบที่ลองใหม่แล้วผ่านได้หรือเปล่า ดูคอมเมนต์ของ create
     * <ul>
     *   <li>receipt_no_uk: เลขที่ซ้ำ รอบหน้านับใบที่ชนะด้วยจึงได้เลขถัดไป</li>
     *   <li>receipt_line_one_time_uk: ค่าครั้งเดียวถูกอีกใบของสัญญาเดียวกันเก็บไปแล้ว รอบหน้าจะไม่เก็บซ้ำ</li>
     * </ul>
     */
    private static boolean isRetryable(DataIntegrityViolationException ex) {
        String cause = ex.getMostSpecificCause().getMessage();
        return cause != null && (cause.contains("receipt_no_uk") || cause.contains("receipt_line_one_time_uk"));
    }

    private Receipt loadOrThrow(Long id) {
        return receiptRepository.findWithLeaseById(id)
                .orElseThrow(() -> new NotFoundException("receipt", id));
    }
}
