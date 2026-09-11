package com.sakurasoul.apartment.billing;

import com.sakurasoul.apartment.common.ConflictException;
import com.sakurasoul.apartment.lease.Lease;
import com.sakurasoul.apartment.lease.LeaseCharges;
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
import jakarta.persistence.Table;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.LocalDate;

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

    /**
     * คอลัมน์เงินทุกตัวเป็น NUMERIC(10,2) ปัดเองก่อนเก็บให้ตรงกับที่ database เก็บจริง
     * ไม่งั้นยอดที่ตอบกลับตอนสร้างกับยอดที่ GET ได้รอบถัดไปจะไม่เท่ากัน
     * เหตุผลเดียวกับ MONEY_SCALE ใน LeaseService
     */
    private static final int MONEY_SCALE = 2;

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

    @Column(name = "total_amount", nullable = false, precision = 10, scale = 2)
    private BigDecimal totalAmount;

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

    protected Receipt() {
    }

    /**
     * ออกใบเสร็จของเดือนหนึ่งให้สัญญาใบหนึ่ง คัดลอกอัตราทั้งชุดจากสัญญามาเก็บไว้ในใบนี้
     * แล้วคิดยอดให้เสร็จตั้งแต่ตอนออก
     * <p>
     * สูตรคือ ค่าเช่า + ค่าส่วนกลาง + ค่าอินเทอร์เน็ต + (หน่วยไฟ x อัตราค่าไฟ)
     * + (หน่วยน้ำ x อัตราค่าน้ำ) ปัดครึ่งขึ้นให้เหลือสองตำแหน่งทุกยอด
     * <p>
     * ปัดทีละยอดก่อนแล้วค่อยบวกรวม ไม่ได้บวกดิบแล้วปัดทีเดียวตอนท้าย เพราะยอดย่อย
     * แต่ละบรรทัดถูกพิมพ์ลงใบเสร็จให้ผู้เช่าอ่านด้วย ถ้าปัดทีเดียวตอนท้าย ผลรวมของ
     * ตัวเลขที่พิมพ์อยู่บนกระดาษจะไม่เท่ากับยอดรวมที่พิมพ์อยู่บรรทัดล่างสุด
     * <p>
     * ยังไม่มีเลขที่ใบเสร็จตอนนี้ ต้องเรียก {@link #numberedAs(String)} ต่อก่อนบันทึก
     * ดูเหตุผลที่เมธอดนั้น
     */
    public static Receipt issue(Lease lease, LocalDate billingMonth, BigDecimal electricUnits,
            BigDecimal waterUnits, LocalDate dueDate, Instant issuedAt) {
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

        receipt.electricAmount = round(receipt.electricUnits.multiply(receipt.electricRatePerUnit));
        receipt.waterAmount = round(receipt.waterUnits.multiply(receipt.waterRatePerUnit));
        receipt.totalAmount = round(receipt.monthlyRent
                .add(receipt.commonAreaFee)
                .add(receipt.internetFee)
                .add(receipt.electricAmount)
                .add(receipt.waterAmount));

        receipt.issuedAt = issuedAt;
        receipt.dueDate = dueDate;
        receipt.status = ReceiptStatus.PENDING;
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
     * บันทึกว่าผู้เช่าจ่ายแล้ว (US-10 ปุ่ม Paid ในหน้า Payment Management)
     * <p>
     * โยน 409 เมื่อจ่ายซ้ำแทนที่จะเขียนทับวันที่จ่ายเดิมเงียบ ๆ เพราะการกดซ้ำมักเกิดจาก
     * กดปุ่มสองครั้งหรือเปิดหน้าเว็บค้างไว้สองแท็บ ถ้าเขียนทับ วันที่ชำระจริงจะหายไป
     * โดยไม่มีใครรู้ตัว ซึ่งเป็นข้อมูลที่ใช้ยืนยันกับผู้เช่าตอนมีปัญหา
     * <p>
     * paymentMethod ว่างได้ หอนี้รับเงินสดหน้าเคาน์เตอร์เป็นหลัก ซึ่งไม่มีอะไรให้ระบุ
     */
    public void markPaid(String paymentMethod, Instant paidAt) {
        if (status == ReceiptStatus.PAID) {
            throw new ConflictException("ใบเสร็จนี้ชำระแล้ว");
        }
        this.status = ReceiptStatus.PAID;
        this.paidAt = paidAt;
        this.paymentMethod = paymentMethod;
    }

    /** เดือนที่เรียกเก็บในรูปแบบที่สัญญา API กำหนด คือ YYYY-MM ไม่ใช่วันที่เต็ม */
    public String billingMonthText() {
        return String.format("%04d-%02d", billingMonth.getYear(), billingMonth.getMonthValue());
    }

    /** ปัดให้ตรงกับที่ NUMERIC(10,2) เก็บจริง ดูเหตุผลที่ MONEY_SCALE */
    private static BigDecimal round(BigDecimal value) {
        return value.setScale(MONEY_SCALE, RoundingMode.HALF_UP);
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
}
