package com.sakurasoul.apartment.billing;

import com.sakurasoul.apartment.common.Money;
import com.sakurasoul.apartment.common.Months;
import com.sakurasoul.apartment.lease.Lease;
import com.sakurasoul.apartment.lease.LeaseCharges;
import com.sakurasoul.apartment.lease.LeaseExtraCharge;
import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
import jakarta.persistence.Table;
import org.hibernate.annotations.BatchSize;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Set;

/**
 * ใบเสร็จหนึ่งใบของสัญญาหนึ่งใบในหนึ่งเดือน (US-10)
 *
 * <h2>ทำไมถึงคัดลอกอัตรามาเก็บทั้งชุด</h2>
 * US-16-S3 บังคับว่าใบเสร็จต้องเก็บ snapshot ของอัตราที่ใช้ตอนออกใบไว้ในตัวเอง
 * ห้ามอ้างอิงกลับไปที่ apartment_config ตอนแสดงผล ไม่งั้นพอแอดมินเปลี่ยนอัตรา
 * ใบเสร็จเก่าทุกใบจะเปลี่ยนยอดตามไปด้วย ซึ่งผิดทั้งทางบัญชีและทางกฎหมาย
 * <p>
 * ต้นทางของอัตราที่คัดลอกมาคือ "สัญญา" ไม่ใช่ apartment_config เพราะสัญญาล็อกอัตรา
 * ของตัวเองไว้ตั้งแต่วันเซ็นอยู่แล้ว (ดู {@link LeaseCharges}) ใบเสร็จจึงไม่เคยแตะ
 * ตาราง apartment_config เลยแม้แต่ตอนออกใบใหม่ และต้องคัดลอกซ้ำอีกชั้นที่นี่
 * เพราะสัญญาใบเดิมยังถูกแก้อัตราได้ทีหลังผ่าน PUT /api/leases/{id}
 * ใบที่ออกไปแล้วต้องไม่ขยับตาม
 * <p>
 * ถือ Lease เป็น association ไม่ใช่ id เปล่า ๆ เพราะ response ของใบเสร็จต้องส่งเลขห้อง
 * กับชื่อผู้เช่าไปด้วย โหลดแบบ LAZY แล้วแตะตอนแปลงเป็น DTO ซึ่งยังอยู่ใน transaction เดิม
 * (application.yml ปิด open-in-view ไว้ การแตะนอก transaction จะพังทันทีให้เห็น)
 */
@Entity
@Table(name = "receipt")
public class Receipt {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** RC-<ปี ค.ศ.>-<ลำดับ 4 หลัก> ผู้ออกเลขคือ ReceiptService ดูเหตุผลที่ numberedAs() */
    @Column(name = "receipt_no", nullable = false, length = 20)
    private String receiptNo;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "lease_id", nullable = false)
    private Lease lease;

    /** วันที่ 1 ของเดือนที่เรียกเก็บเสมอ บังคับด้วย receipt_month_first_day_ck ใน V9 */
    @Column(name = "billing_month", nullable = false)
    private LocalDate billingMonth;

    @Column(name = "electric_units", nullable = false, precision = 10, scale = 2)
    private BigDecimal electricUnits;

    @Column(name = "water_units", nullable = false, precision = 10, scale = 2)
    private BigDecimal waterUnits;

    @Column(name = "monthly_rent", nullable = false, precision = 10, scale = 2)
    private BigDecimal monthlyRent;

    @Column(name = "electric_rate_per_unit", nullable = false, precision = 10, scale = 2)
    private BigDecimal electricRatePerUnit;

    @Column(name = "water_rate_per_unit", nullable = false, precision = 10, scale = 2)
    private BigDecimal waterRatePerUnit;

    @Column(name = "common_area_fee", nullable = false, precision = 10, scale = 2)
    private BigDecimal commonAreaFee;

    @Column(name = "internet_fee", nullable = false, precision = 10, scale = 2)
    private BigDecimal internetFee;

    @Column(name = "electric_amount", nullable = false, precision = 10, scale = 2)
    private BigDecimal electricAmount;

    @Column(name = "water_amount", nullable = false, precision = 10, scale = 2)
    private BigDecimal waterAmount;

    /**
     * ยอดที่พิมพ์บนบิล = ค่าใช้จ่ายเดือนนี้ + ยอดยกมา + ดอกเบี้ย (V21 เปลี่ยนความหมาย ใบที่ออกก่อนนั้นสองยอดหลังเป็น 0)
     * ค่าใช้จ่ายเดือนนี้ไม่เก็บเป็นคอลัมน์ ดู {@link #chargesAmount()}
     */
    @Column(name = "total_amount", nullable = false, precision = 10, scale = 2)
    private BigDecimal totalAmount;

    /**
     * ยอดค้างของใบก่อนหน้าทุกใบของสัญญานี้ (ต้นเงินกับดอกเบี้ยที่ยังค้าง) ณ ตอนออกใบนี้ แช่แข็งไว้ (SSK-164)
     * ส่งอีเมลซ้ำ ดาวน์โหลด PDF ซ้ำ หรือเปิดวันไหนก็ได้ตัวเลขเดิม
     */
    @Column(name = "previous_balance", nullable = false, precision = 10, scale = 2)
    private BigDecimal previousBalance;

    /** เลขที่ของใบที่ถูกยกมา คั่นด้วย ", " เป็น detail ของบรรทัด Previous balance ไม่มียอดยกมาเป็น null */
    @Column(name = "previous_balance_receipts")
    private String previousBalanceReceipts;

    /** ดอกเบี้ยค้างชำระที่คิดในใบนี้ตอนออก (SSK-164) */
    @Column(name = "interest_amount", nullable = false, precision = 10, scale = 2)
    private BigDecimal interestAmount;

    /** ต้นเงินที่เลยกำหนดซึ่งเป็นฐานของดอกเบี้ย สำหรับ detail "1.50% of ฿3,000.00" */
    @Column(name = "interest_principal", nullable = false, precision = 10, scale = 2)
    private BigDecimal interestPrincipal;

    /** อัตราดอกเบี้ยต่อเดือนที่คัดลอกจากสัญญาลงใบ หลักเดียวกับอัตราค่าน้ำไฟ */
    @Column(name = "interest_rate_percent", nullable = false, precision = 5, scale = 2)
    private BigDecimal interestRatePercent;

    /**
     * บิลล่าสุดที่รวมยอดค้างของใบนี้ไว้แล้ว (SSK-164) ถูกชี้ต่อไปบิลใหม่กว่าทุกครั้งที่ออกบิลขณะที่ใบนี้ยังค้าง
     * เป็น id เปล่าเหมือน ReceiptLine.leaseId ใบที่ไม่เคยค้างตอนออกบิลถัดไปเป็น null
     */
    @Column(name = "carried_to_receipt_id")
    private Long carriedToReceiptId;

    @Column(name = "issued_at", nullable = false)
    private Instant issuedAt;

    @Column(name = "due_date", nullable = false)
    private LocalDate dueDate;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 10)
    private ReceiptStatus status;

    @Column(name = "paid_at")
    private Instant paidAt;

    @Column(name = "payment_method", length = 50)
    private String paymentMethod;

    /** ส่งอีเมลใบนี้สำเร็จครั้งล่าสุดเมื่อไหร่ (SSK-143) null คือยังไม่เคยส่ง */
    @Column(name = "last_sent_at")
    private Instant lastSentAt;

    /** ส่งอีเมลใบนี้สำเร็จไปแล้วกี่ครั้ง ผูกกับ lastSentAt ด้วย receipt_sent_ck ใน V14 */
    @Column(name = "sent_count", nullable = false)
    private int sentCount;

    /**
     * บรรทัดค่าใช้จ่ายพิเศษ (SSK-165) ต่อจากบรรทัดมาตรฐานห้าบรรทัด ดู ReceiptLine
     * <p>
     * {@link BatchSize} เพราะรายการใบเสร็จอ่านบรรทัดของทุกใบ ให้โหลดของหลายใบในคิวรีเดียว ไม่ใช่คิวรีละใบ
     */
    @OneToMany(mappedBy = "receipt", cascade = CascadeType.PERSIST)
    @OrderBy("id")
    @BatchSize(size = 50)
    private List<ReceiptLine> lines = new ArrayList<>();

    protected Receipt() {
    }

    /**
     * ออกใบเสร็จของเดือนหนึ่งให้สัญญาใบหนึ่ง คัดลอกอัตราทั้งชุดจากสัญญามาเก็บไว้ในใบนี้
     * แล้วคิดยอดให้เสร็จตั้งแต่ตอนออก สูตรอยู่ที่ {@link #recalculate()}
     * <p>
     * ค่าใช้จ่ายพิเศษ (SSK-165) คือสำเนาในสัญญาที่ถึงรอบของเดือนนี้ ดูกฎที่ LeaseExtraCharge.isDueIn
     * billedOneTimeChargeIds คือค่าครั้งเดียวที่ใบก่อน ๆ ของสัญญานี้เก็บไปแล้ว ซึ่งรู้ได้จากใบเหล่านั้นเท่านั้น
     * ผู้เรียกจึงต้องหามาให้ (ReceiptService อ่านจาก receipt_line)
     * <p>
     * ยังไม่มีเลขที่ใบเสร็จตอนนี้ ต้องเรียก {@link #numberedAs(String)} ต่อก่อนบันทึก
     * ดูเหตุผลที่เมธอดนั้น
     * <p>
     * ยอดยกมากับฐานของดอกเบี้ย (SSK-164) มาจากบัญชีของสัญญา (LeaseAccount.carryForwardFor) ดอกเบี้ยคิดที่นี่ครั้งเดียว
     * แล้วเก็บไว้ การแก้ใบทีหลังไม่แตะสามยอดนี้ ใบที่ค่าใช้จ่ายกับดอกเบี้ยเป็นศูนย์ไม่มีอะไรต้องจ่าย จึง PAID ตั้งแต่ออก
     */
    public static Receipt issue(Lease lease, LocalDate billingMonth, BigDecimal electricUnits,
            BigDecimal waterUnits, LocalDate dueDate, Instant issuedAt, Set<Long> billedOneTimeChargeIds,
            CarryForward carry) {
        LeaseCharges charges = lease.getCharges();

        Receipt receipt = new Receipt();
        receipt.lease = lease;
        receipt.billingMonth = billingMonth.withDayOfMonth(1);
        receipt.electricUnits = round(electricUnits);
        receipt.waterUnits = round(waterUnits);

        receipt.monthlyRent = round(lease.getMonthlyRent());
        receipt.electricRatePerUnit = round(charges.getElectricRatePerUnit());
        receipt.waterRatePerUnit = round(charges.getWaterRatePerUnit());
        receipt.commonAreaFee = round(charges.getCommonAreaFee());
        receipt.internetFee = round(charges.getInternetFee());

        YearMonth month = YearMonth.from(receipt.billingMonth);
        for (LeaseExtraCharge charge : lease.extraChargesDueIn(month, billedOneTimeChargeIds)) {
            receipt.lines.add(ReceiptLine.of(receipt, charge));
        }
        receipt.previousBalance = round(carry.previousBalance());
        receipt.previousBalanceReceipts = carry.receiptNumbers();
        receipt.interestPrincipal = round(carry.interestPrincipal());
        receipt.interestRatePercent = round(carry.ratePercent());
        receipt.interestAmount = LateInterest.of(receipt.interestPrincipal, receipt.interestRatePercent);
        receipt.recalculate();

        receipt.issuedAt = issuedAt;
        receipt.dueDate = dueDate;
        receipt.applySettlement(BigDecimal.ZERO, issuedAt, null);
        return receipt;
    }

    /**
     * ติดเลขที่ใบเสร็จให้ใบนี้ก่อนบันทึก
     * <p>
     * แยกออกมาจาก issue() เพราะเลขที่เป็นลำดับของทั้งปี ไม่ใช่ค่าที่คำนวณจากใบนี้ใบเดียว
     * ต้องไปนับใบที่ออกไปแล้วก่อน ซึ่งเป็นงานของ ReceiptService ที่ถือ repository อยู่
     * และเพราะคำขอที่ชนกันจะต้องออกเลขใหม่แล้วลองบันทึกอีกครั้ง เมธอดนี้จึงเรียกซ้ำได้
     */
    public void numberedAs(String receiptNo) {
        this.receiptNo = receiptNo;
    }

    /**
     * ยกยอดค้างของใบนี้ไปรวมในบิลใหม่ (SSK-164) ตัวเลขและสถานะของใบนี้ไม่เปลี่ยน ใบที่ยังค้างจากบิลเดือนก่อน
     * ถูกชี้ต่อมาที่บิลใหม่นี้ ไม่นับซ้ำ เพราะยอดยกมาของบิลใหม่คิดจากยอดค้างของทุกใบ ไม่ใช่จากบิลเดือนก่อน
     */
    public void carryTo(Long laterReceiptId) {
        this.carriedToReceiptId = laterReceiptId;
    }

    /**
     * ปรับสถานะตามเงินที่ถูกตัดเข้าใบนี้แล้วทั้งหมด (SSK-163) ที่เดียวที่เปลี่ยนสถานะ เวลาที่จ่าย และช่องทาง
     * <ul>
     *   <li>ตัดครบ ({@link #ownAmount()}) เป็น PAID ใบที่ PAID อยู่แล้วไม่ถูกเขียนทับเวลาที่จ่ายเดิม</li>
     *   <li>ตัดไปบางส่วนเป็น PARTIAL ยังไม่ถูกตัดเลยเป็น PENDING ทั้งสองแบบล้างเวลาที่จ่ายกับช่องทาง (เช่นหลังยกเลิกการชำระ)</li>
     * </ul>
     * ตัดเกินยอดของใบคือบั๊กของเรา (IllegalStateException) ตัวตัดยอดไม่มีวันให้เกิน
     *
     * @param settledAt เวลาที่บันทึกการชำระที่ทำให้ใบนี้ครบ
     * @param method    ข้อความช่องทางของการชำระครั้งนั้น (label ของ PaymentMethod หรือข้อความที่ส่งมากับ /pay แบบเดิม)
     */
    public void applySettlement(BigDecimal settledAmount, Instant settledAt, String method) {
        BigDecimal outstanding = ownAmount().subtract(settledAmount);
        if (outstanding.signum() < 0) {
            throw new IllegalStateException("Receipt " + receiptNo + " was settled with " + settledAmount
                    + " but only owes " + ownAmount());
        }
        if (outstanding.signum() == 0) {
            if (status != ReceiptStatus.PAID) {
                this.status = ReceiptStatus.PAID;
                this.paidAt = settledAt;
                this.paymentMethod = method;
            }
            return;
        }
        this.status = settledAmount.signum() > 0 ? ReceiptStatus.PARTIAL : ReceiptStatus.PENDING;
        this.paidAt = null;
        this.paymentMethod = null;
    }

    /**
     * แก้ไขหน่วยไฟ หน่วยน้ำ และเดือนที่เรียกเก็บ (SSK-155)
     * <p>
     * แก้ได้เมื่อไหร่ (ใบล่าสุดที่ยังไม่มีการชำระและยังไม่ถูกยกยอด) ต้องรู้ทั้งสัญญา ReceiptService จึงเป็นคนตัดสิน
     * เลขที่ใบเสร็จและอัตราที่ snapshot ไว้ในใบนี้ตั้งแต่ตอนออกห้ามเปลี่ยน ยอดคิดใหม่ด้วยอัตราเดิมของใบนี้
     * ยอดยกมาและดอกเบี้ยที่แช่แข็งตอนออกไม่เปลี่ยน
     * <p>
     * บรรทัดค่าใช้จ่ายพิเศษคงตามที่ออกไว้และยังรวมอยู่ในยอด ถึงจะเปลี่ยนเดือนที่เรียกเก็บก็ไม่คิดใหม่ว่าเดือนใหม่
     * ถึงรอบรายการไหน แบบเดียวกับ backend จำลองของหน้าเว็บ การแก้ใบนี้มีไว้แก้หน่วยหรือเดือนที่กรอกผิด
     * ยอดของใบที่ยังไม่มีการชำระเปลี่ยนเป็นศูนย์หรือเลิกเป็นศูนย์ได้ สถานะจึงถูกปรับตามด้วย
     */
    public void update(LocalDate newBillingMonth, BigDecimal newElectricUnits, BigDecimal newWaterUnits,
            Instant updatedAt) {
        this.billingMonth = newBillingMonth.withDayOfMonth(1);
        this.electricUnits = round(newElectricUnits);
        this.waterUnits = round(newWaterUnits);
        recalculate();
        this.dueDate = ReceiptService.defaultDueDate(this.billingMonth);
        applySettlement(BigDecimal.ZERO, updatedAt, null);
    }

    /**
     * คิดค่าไฟ ค่าน้ำ และยอดรวมจากหน่วยกับอัตราที่เก็บในใบนี้ ที่เดียวที่มีสูตรยอดรวม ใช้ทั้งตอนออกและตอนแก้
     * <p>
     * สูตรคือ ค่าเช่า + ค่าส่วนกลาง + ค่าอินเทอร์เน็ต + (หน่วยไฟ x อัตราค่าไฟ) + (หน่วยน้ำ x อัตราค่าน้ำ)
     * + ค่าใช้จ่ายพิเศษทุกบรรทัด + ยอดยกมา + ดอกเบี้ย (SSK-164) ปัดครึ่งขึ้นให้เหลือสองตำแหน่งทุกยอด
     * <p>
     * ปัดทีละยอดก่อนแล้วค่อยบวกรวม ไม่ได้บวกดิบแล้วปัดทีเดียวตอนท้าย เพราะยอดย่อย
     * แต่ละบรรทัดถูกพิมพ์ลงใบเสร็จให้ผู้เช่าอ่านด้วย ถ้าปัดทีเดียวตอนท้าย ผลรวมของ
     * ตัวเลขที่พิมพ์อยู่บนกระดาษจะไม่เท่ากับยอดรวมที่พิมพ์อยู่บรรทัดล่างสุด
     * ยอดของบรรทัดค่าใช้จ่ายพิเศษปัดมาแล้วตั้งแต่ตอนตั้งรายการ
     */
    private void recalculate() {
        this.electricAmount = round(this.electricUnits.multiply(this.electricRatePerUnit));
        this.waterAmount = round(this.waterUnits.multiply(this.waterRatePerUnit));
        BigDecimal extraCharges = lines.stream()
                .map(ReceiptLine::getAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        this.totalAmount = round(this.monthlyRent
                .add(this.commonAreaFee)
                .add(this.internetFee)
                .add(this.electricAmount)
                .add(this.waterAmount)
                .add(extraCharges)
                .add(this.previousBalance)
                .add(this.interestAmount));
    }

    /** ค่าใช้จ่ายของเดือนนี้ คือห้าบรรทัดมาตรฐานรวมค่าใช้จ่ายพิเศษ ไม่รวมยอดยกมากับดอกเบี้ย */
    public BigDecimal chargesAmount() {
        return totalAmount.subtract(previousBalance).subtract(interestAmount);
    }

    /**
     * สิ่งที่ใบนี้ต้องถูกตัดให้ครบ คือค่าใช้จ่ายเดือนนี้กับดอกเบี้ยที่ใบนี้คิด ไม่รวมยอดยกมา
     * เพราะยอดยกมาเป็นยอดค้างของใบเก่าซึ่งถูกตัดที่ใบเก่าเอง ถ้านับที่นี่อีกจะนับซ้ำ
     */
    public BigDecimal ownAmount() {
        return totalAmount.subtract(previousBalance);
    }

    /**
     * บันทึกว่าส่งอีเมลใบนี้ให้ผู้เช่าสำเร็จแล้วอีกหนึ่งครั้ง (SSK-143)
     * <p>
     * ส่งซ้ำได้เสมอและนับเพิ่มทุกครั้ง ต่างจากการรับชำระที่จ่ายครบแล้วรับซ้ำไม่ได้ เพราะการส่งซ้ำเป็นเรื่องปกติ
     * (ผู้เช่าบอกว่าไม่ได้รับ หรือรอบเตือนรายเดือนส่งใบค้างเดิมอีกรอบ) สิ่งที่ต้องกันคือการส่งซ้ำ
     * โดยไม่รู้ตัว ซึ่งหน้าเว็บกันด้วยการโชว์จำนวนครั้งก่อนกด ไม่ใช่การห้ามที่นี่
     * <p>
     * เรียกหลังเมลเซิร์ฟเวอร์รับอีเมลไปแล้วเท่านั้น ถ้าเรียกก่อนแล้วส่งไม่ออก ใบนี้จะนับว่าส่งแล้วทั้งที่ผู้เช่าไม่ได้อะไรเลย
     */
    public void markSent(Instant sentAt) {
        this.lastSentAt = sentAt;
        this.sentCount++;
    }

    /** เดือนที่เรียกเก็บในรูปแบบที่สัญญา API กำหนด คือ YYYY-MM ไม่ใช่วันที่เต็ม */
    public String billingMonthText() {
        return Months.format(billingMonth);
    }

    /** ปัดให้ตรงกับที่ NUMERIC(10,2) เก็บจริง ดูเหตุผลที่ {@link Money} */
    private static BigDecimal round(BigDecimal value) {
        return Money.round(value);
    }

    public Long getId() {
        return id;
    }

    public String getReceiptNo() {
        return receiptNo;
    }

    public Lease getLease() {
        return lease;
    }

    public LocalDate getBillingMonth() {
        return billingMonth;
    }

    public BigDecimal getElectricUnits() {
        return electricUnits;
    }

    public BigDecimal getWaterUnits() {
        return waterUnits;
    }

    public BigDecimal getMonthlyRent() {
        return monthlyRent;
    }

    public BigDecimal getElectricRatePerUnit() {
        return electricRatePerUnit;
    }

    public BigDecimal getWaterRatePerUnit() {
        return waterRatePerUnit;
    }

    public BigDecimal getCommonAreaFee() {
        return commonAreaFee;
    }

    public BigDecimal getInternetFee() {
        return internetFee;
    }

    public BigDecimal getElectricAmount() {
        return electricAmount;
    }

    public BigDecimal getWaterAmount() {
        return waterAmount;
    }

    public BigDecimal getTotalAmount() {
        return totalAmount;
    }

    public BigDecimal getPreviousBalance() {
        return previousBalance;
    }

    public String getPreviousBalanceReceipts() {
        return previousBalanceReceipts;
    }

    public BigDecimal getInterestAmount() {
        return interestAmount;
    }

    public BigDecimal getInterestPrincipal() {
        return interestPrincipal;
    }

    public BigDecimal getInterestRatePercent() {
        return interestRatePercent;
    }

    public Long getCarriedToReceiptId() {
        return carriedToReceiptId;
    }

    public Instant getIssuedAt() {
        return issuedAt;
    }

    public LocalDate getDueDate() {
        return dueDate;
    }

    public ReceiptStatus getStatus() {
        return status;
    }

    public Instant getPaidAt() {
        return paidAt;
    }

    public String getPaymentMethod() {
        return paymentMethod;
    }

    public Instant getLastSentAt() {
        return lastSentAt;
    }

    public int getSentCount() {
        return sentCount;
    }

    public List<ReceiptLine> getLines() {
        return Collections.unmodifiableList(lines);
    }

    /**
     * ยอดยกมากับฐานของดอกเบี้ยของบิลใหม่ (SSK-164) คิดโดย LeaseAccount.carryForwardFor
     *
     * @param receiptNumbers เลขที่ของใบที่ถูกยกมา คั่นด้วย ", " ไม่มียอดยกมาเป็น null
     */
    public record CarryForward(BigDecimal previousBalance, String receiptNumbers, BigDecimal interestPrincipal,
            BigDecimal ratePercent) {

        /** บิลแรกของสัญญา หรือสัญญาที่ไม่มีอะไรค้าง */
        public static final CarryForward NONE =
                new CarryForward(BigDecimal.ZERO, null, BigDecimal.ZERO, BigDecimal.ZERO);
    }
}
