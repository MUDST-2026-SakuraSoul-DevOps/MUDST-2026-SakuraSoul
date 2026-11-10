package com.sakurasoul.apartment.billing;

import com.sakurasoul.apartment.billing.PaymentDtos.PaymentResponse;
import com.sakurasoul.apartment.common.Money;
import com.sakurasoul.apartment.lease.Lease;
import com.sakurasoul.apartment.pdf.DocumentFormat;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

/**
 * รูปร่างของ request กับ response ของใบเสร็จ ตกลงกับหน้าเว็บไว้ใน
 * docs/api-contract-billing.md ชื่อฟิลด์ต้องตรงกับที่เขียนไว้ที่นั่น
 * <p>
 * ฝั่งหน้าเว็บยังไม่ได้ต่อ API ตัวนี้ ตอนนี้ป็อปอัป Generate Receipt
 * (frontend/src/components/GenerateReceiptModal.tsx) ยังใช้ค่าคงที่ SAMPLE_RECEIPT อยู่
 * รูปของ items ในไฟล์นี้จึงถูกทำให้ตรงกับ ReceiptLineItem ของป็อปอัปตัวนั้นเป๊ะ ๆ
 * (item, detail, usageValue, usageUnit, rate, amount) เวลาต่อ API จริงจะได้ลบแค่
 * SAMPLE_RECEIPT ทิ้งแล้วเสียบข้อมูลจริงเข้าไปแทน ไม่ต้องรื้อ layout ของใบเสร็จ
 */
public final class ReceiptDtos {

    /** หน่วยของมิเตอร์ทั้งน้ำและไฟ ใช้คำเดียวกับที่ป็อปอัป Generate Receipt โชว์อยู่ */
    private static final String USAGE_UNIT = "units";

    private ReceiptDtos() {
    }

    /**
     * body ของ POST /api/receipts
     * <p>
     * billingMonth เป็นสตริง "YYYY-MM" ไม่ใช่ LocalDate เพราะสิ่งที่ผู้ใช้เลือกคือเดือน
     * ไม่ใช่วัน ถ้าประกาศเป็น LocalDate ฝั่งหน้าเว็บจะต้องเดาเองว่าต้องเติมวันที่เป็นอะไร
     * แล้วสองฝั่งจะเดาไม่ตรงกัน การแปลงเป็นวันที่ 1 ของเดือนทำที่ ReceiptService ที่เดียว
     * <p>
     * หน่วยไฟกับหน่วยน้ำบังคับทั้งคู่ ไม่ได้ตกไปเป็น 0 ให้เองเวลาไม่ส่งมา เพราะใบเสร็จที่
     * ค่าน้ำค่าไฟเป็นศูนย์โดยไม่มีใครตั้งใจ คือใบที่หอเก็บเงินขาดไปทั้งเดือนโดยไม่มีอะไรฟ้อง
     * เหตุผลเดียวกับที่ terminate บังคับ endDate แทนที่จะเดาวันนี้ให้ (ดู TerminateLeaseRequest)
     */
    public record CreateReceiptRequest(
            @NotNull(message = "Please choose the lease")
            Long leaseId,

            @NotBlank(message = "Please choose the billing month")
            String billingMonth,

            @NotNull(message = "Please enter the electricity units")
            @PositiveOrZero(message = "Electricity units cannot be negative")
            BigDecimal electricUnits,

            @NotNull(message = "Please enter the water units")
            @PositiveOrZero(message = "Water units cannot be negative")
            BigDecimal waterUnits,

            /** ไม่บังคับ ไม่ส่งมาให้ตกไปเป็นวันที่ 5 ของเดือนถัดจากเดือนที่เรียกเก็บ */
            LocalDate dueDate) {
    }

    /**
     * body ของ PUT /api/receipts/{id} (SSK-155)
     * <p>
     * แก้ได้เฉพาะหน่วยไฟ หน่วยน้ำ และเดือนที่เรียกเก็บ อัตราทั้งหมดล็อกตามเดิม
     */
    public record UpdateReceiptRequest(
            @NotBlank(message = "Please choose the billing month")
            String billingMonth,

            @NotNull(message = "Please enter the electricity units")
            @PositiveOrZero(message = "Electricity units cannot be negative")
            BigDecimal electricUnits,

            @NotNull(message = "Please enter the water units")
            @PositiveOrZero(message = "Water units cannot be negative")
            BigDecimal waterUnits) {
    }

    /**
     * body ของ POST /api/receipts/{id}/pay มีช่องเดียวและไม่บังคับ
     * <p>
     * ต่างจาก terminate ที่บังคับวันที่ เพราะช่องทางการจ่ายเป็นข้อมูลประกอบ ไม่ใช่สิ่งที่
     * ทำให้ใบเสร็จเปลี่ยนสถานะ หอนี้รับเงินสดหน้าเคาน์เตอร์เป็นหลักซึ่งไม่มีอะไรให้ระบุ
     * ถ้าบังคับ แอดมินจะพิมพ์คำว่า "-" ลงไปทุกใบซึ่งแย่กว่าปล่อยว่าง
     */
    public record PayReceiptRequest(String paymentMethod) {
    }

    /**
     * หนึ่งบรรทัดในตารางรายการของใบเสร็จ
     * <p>
     * usageValue, usageUnit และ rate เป็น null ได้ สำหรับบรรทัดที่เป็นยอดเหมาจ่าย
     * (ค่าเช่า ค่าส่วนกลาง ค่าอินเทอร์เน็ต ค่าใช้จ่ายพิเศษ) หน้าเว็บโชว์เป็นขีดกลางเมื่อเป็น null
     * ตามที่ป็อปอัป Generate Receipt ทำอยู่แล้ว
     * <p>
     * chargeId มีเฉพาะบรรทัดค่าใช้จ่ายพิเศษ (SSK-165) เป็น id ของรายการต้นทางในห้อง บรรทัดมาตรฐานเป็น null
     */
    public record ReceiptItem(
            String item,
            String detail,
            BigDecimal usageValue,
            String usageUnit,
            BigDecimal rate,
            BigDecimal amount,
            Long chargeId) {

        static ReceiptItem flat(String item, BigDecimal amount) {
            return new ReceiptItem(item, null, null, null, null, amount, null);
        }

        static ReceiptItem metered(String item, BigDecimal usageValue, BigDecimal rate, BigDecimal amount) {
            return new ReceiptItem(item, null, usageValue, USAGE_UNIT, rate, amount, null);
        }

        /** ชื่อรายการเป็นชื่อบรรทัด ความถี่ ("Monthly" / "One-time") อยู่ในช่อง detail แบบ backend จำลอง */
        static ReceiptItem extraCharge(ReceiptLine line) {
            return new ReceiptItem(line.getLabel(), line.getRecurrence().label(), null, null, null,
                    line.getAmount(), line.getChargeId());
        }

        /** ยอดค้างที่ยกมา (SSK-164) detail คือเลขที่ของใบที่ถูกยกมา หลายใบคั่นด้วย ", " */
        static ReceiptItem previousBalance(Receipt receipt) {
            return new ReceiptItem("Previous balance", receipt.getPreviousBalanceReceipts(), null, null, null,
                    receipt.getPreviousBalance(), null);
        }

        /** ดอกเบี้ยค้างชำระ (SSK-164) detail บอกที่มา เช่น "1.50% of ฿3,000.00" */
        static ReceiptItem lateInterest(Receipt receipt) {
            String detail = Money.round(receipt.getInterestRatePercent()).toPlainString() + "% of "
                    + DocumentFormat.money(receipt.getInterestPrincipal());
            return new ReceiptItem("Late interest", detail, null, null, null, receipt.getInterestAmount(), null);
        }
    }

    /**
     * สำเนาบัญชีรับเงิน ณ วันที่ออกใบ ชื่อฟิลด์ตามสัญญา API จองไว้ให้ SSK-168 (V22) เติม
     * ก่อนหน้านั้น bank ของทุกใบเป็น null รูปของ response จึงไม่ต้องเปลี่ยนอีกรอบ
     */
    public record ReceiptBank(
            String bankName,
            String accountName,
            String accountNumber,
            String promptPayId) {
    }

    public record ReceiptResponse(
            Long id,
            String receiptNo,
            Long leaseId,
            String roomNumber,
            String tenantName,
            /**
             * อีเมลของผู้เช่าตามสัญญา null ได้เพราะช่องอีเมลไม่บังคับ (SSK-143)
             * ป็อปอัป Send Invoices ใช้บอกล่วงหน้าว่าใบไหนจะถูกข้าม ส่วน ReceiptMailer ใช้เป็นผู้รับ
             * ส่งมาด้วยเหตุผลเดียวกับ tenantName คือหน้าเว็บจะได้ไม่ต้องโหลดรายชื่อผู้เช่ามาเทียบเอง
             */
            String tenantEmail,
            /** "YYYY-MM" ไม่ใช่วันที่เต็ม ตรงกับที่ request รับเข้ามา */
            String billingMonth,
            Instant issuedAt,
            LocalDate dueDate,
            ReceiptStatus status,
            List<ReceiptItem> items,
            BigDecimal totalAmount,
            Instant paidAt,
            String paymentMethod,
            /** ส่งอีเมลใบนี้สำเร็จครั้งล่าสุดเมื่อไหร่ null คือยังไม่เคยส่ง */
            Instant lastSentAt,
            int sentCount,

            /*
             * ยอดสองมุมของใบ (SSK-163, SSK-164) ความหมายของแต่ละฟิลด์อยู่ในสัญญา API หัวข้อ "ยอดของใบ แยกเป็นสองมุม"
             * มุมบิล: chargesAmount + previousBalance + interestAmount = totalAmount, paidAmount, balanceDue
             * มุมของใบเอง: settledAmount, outstandingAmount ซึ่ง status ตัดสินจากมุมนี้
             */
            /** ใบของเดือนล่าสุดของสัญญา ใบเดียวที่รับชำระได้ */
            boolean latest,
            BigDecimal chargesAmount,
            BigDecimal previousBalance,
            BigDecimal interestAmount,
            BigDecimal paidAmount,
            /** totalAmount - paidAmount มีค่าเฉพาะใบล่าสุด ใบอื่นเป็น null */
            BigDecimal balanceDue,
            BigDecimal settledAmount,
            BigDecimal outstandingAmount,
            /** เฉพาะใบล่าสุด วันครบกำหนดของใบเก่าสุดที่ยังค้าง ไม่มีหนี้เป็น null */
            LocalDate oldestUnpaidDueDate,
            /** เฉพาะใบล่าสุด balanceDue > 0 และวันนี้ (เวลาไทย) เลย oldestUnpaidDueDate แล้ว */
            boolean overdue,
            /** id ของบิลที่รวมยอดค้างของใบนี้ไปแล้ว ใบที่ยังไม่ถูกยกเป็น null */
            Long carriedToReceiptId,
            /** การชำระที่บันทึกบนบิลนี้ รวมที่ยกเลิก เรียงตามลำดับที่บันทึก */
            List<PaymentResponse> payments,
            /** null จนกว่า SSK-168 จะเติม ดู ReceiptBank */
            ReceiptBank bank,
            /** ข้อความของ QR PromptPay null จนกว่า SSK-168 จะเติม */
            String promptPayPayload) {

        /**
         * ประกอบจากใบกับบัญชีของสัญญา ผู้เรียกคือ ReceiptViews ซึ่งโหลดบัญชีให้ครบ
         * <p>
         * เลขห้องอ่านจากสำเนาในสัญญา (SSK-180) ปรับผังตึกหรือเปลี่ยนเลขห้องทีหลัง ใบเสร็จเก่าต้องยังเป็นห้องเดิม
         * ทั้ง PDF ใบเสร็จและอีเมลอ่านจาก response ตัวนี้ จึงตามไปด้วยกันหมด
         *
         * @param today วันนี้ตามเวลาไทย ใช้ตัดสิน overdue
         */
        static ReceiptResponse of(Receipt receipt, LeaseAccount account, LocalDate today) {
            Lease lease = receipt.getLease();
            boolean latest = account.isLatest(receipt);
            return new ReceiptResponse(receipt.getId(), receipt.getReceiptNo(),
                    lease.getId(), lease.getRoomSnapshot().getRoomNumber(), lease.getTenant().getFullName(),
                    lease.getTenant().getEmail(),
                    receipt.billingMonthText(), receipt.getIssuedAt(), receipt.getDueDate(),
                    receipt.getStatus(), itemsOf(receipt), receipt.getTotalAmount(),
                    receipt.getPaidAt(), receipt.getPaymentMethod(),
                    receipt.getLastSentAt(), receipt.getSentCount(),
                    latest, receipt.chargesAmount(), receipt.getPreviousBalance(), receipt.getInterestAmount(),
                    account.paidAmount(receipt), latest ? account.balanceDue() : null,
                    account.settledAmount(receipt), account.outstandingAmount(receipt),
                    latest ? account.oldestUnpaidDueDate().orElse(null) : null,
                    latest && account.isOverdue(today),
                    receipt.getCarriedToReceiptId(),
                    account.paymentsOn(receipt).stream().map(PaymentResponse::of).toList(),
                    null, null);
        }

        /**
         * บรรทัดของใบ ผลรวมเท่ากับ totalAmount เสมอ
         * <ol>
         *   <li>บรรทัดมาตรฐานห้าบรรทัดที่ประกอบใหม่จากคอลัมน์ของ receipt คือค่าเช่า ค่าส่วนกลาง ค่าอินเทอร์เน็ต ค่าไฟ ค่าน้ำ
         *       เหมือนกันทุกใบจึงไม่ได้เก็บซ้ำเป็นแถว</li>
         *   <li>ค่าใช้จ่ายพิเศษ (SSK-165) ซึ่งไม่ตายตัว เก็บในตาราง receipt_line</li>
         *   <li>"Previous balance" กับ "Late interest" (SSK-164) เฉพาะใบที่มี มาจากคอลัมน์ของ receipt ที่แช่แข็งตอนออก</li>
         * </ol>
         * รูปร่าง JSON ที่หน้าเว็บเห็นไม่เปลี่ยน เพราะ items เป็น array มาตั้งแต่วันแรก
         * <p>
         * บรรทัดค่าส่วนกลางกับค่าอินเทอร์เน็ตส่งไปเสมอถึงจะเป็นศูนย์ ใบเสร็จเป็นเอกสาร
         * ที่ต้องอ่านแล้วรู้ว่า "รายการนี้คิดเท่าไหร่" การซ่อนบรรทัดที่เป็นศูนย์ทำให้ผู้เช่า
         * แยกไม่ออกว่าหอไม่คิดเงิน หรือระบบลืมคิด ส่วนยอดยกมากับดอกเบี้ยไม่ใช่รายการที่หอคิดทุกเดือน
         * ใบที่ไม่มีจึงไม่มีสองบรรทัดนี้
         */
        static List<ReceiptItem> itemsOf(Receipt receipt) {
            List<ReceiptItem> items = new ArrayList<>(List.of(
                    ReceiptItem.flat("Room rent", receipt.getMonthlyRent()),
                    ReceiptItem.flat("Common area fee", receipt.getCommonAreaFee()),
                    ReceiptItem.flat("Internet", receipt.getInternetFee()),
                    ReceiptItem.metered("Electricity", receipt.getElectricUnits(),
                            receipt.getElectricRatePerUnit(), receipt.getElectricAmount()),
                    ReceiptItem.metered("Water", receipt.getWaterUnits(),
                            receipt.getWaterRatePerUnit(), receipt.getWaterAmount())));
            receipt.getLines().forEach(line -> items.add(ReceiptItem.extraCharge(line)));
            if (receipt.getPreviousBalance().signum() > 0) {
                items.add(ReceiptItem.previousBalance(receipt));
            }
            if (receipt.getInterestAmount().signum() > 0) {
                items.add(ReceiptItem.lateInterest(receipt));
            }
            return List.copyOf(items);
        }
    }

    /**
     * body ของ POST /api/receipts/send (SSK-143)
     * <p>
     * ไม่ติด bean validation ไว้ที่นี่ ReceiptDispatchService ตรวจเองแบบเดียวกับ ApartmentConfigRules
     * เพราะกฎต้องดูหลังตัด id ซ้ำแล้ว (ส่ง [3, 3] ถือเป็นหนึ่งใบ) ซึ่ง annotation บนฟิลด์ทำไม่ได้
     */
    public record SendReceiptsRequest(List<Long> receiptIds) {
    }

    /** เหตุผลที่ใบหนึ่งไม่ถูกส่ง ชื่อค่าคือสิ่งที่หน้าเว็บเห็นใน JSON */
    public enum SkipReason {
        /** ผู้เช่าของใบนี้ไม่มีอีเมล */
        NO_EMAIL,
        /** เมลเซิร์ฟเวอร์ปฏิเสธใบนี้ หลังจากใบก่อนหน้าในคำขอเดียวกันออกไปได้แล้ว */
        SEND_FAILED
    }

    /** ใบที่เมลเซิร์ฟเวอร์รับไปแล้ว sentCount คือจำนวนครั้งหลังนับครั้งนี้ด้วย */
    public record SentReceipt(
            Long receiptId,
            String receiptNo,
            String tenantName,
            String email,
            Instant sentAt,
            int sentCount) {
    }

    public record SkippedReceipt(
            Long receiptId,
            String receiptNo,
            String tenantName,
            SkipReason reason) {

        static SkippedReceipt of(ReceiptResponse receipt, SkipReason reason) {
            return new SkippedReceipt(receipt.id(), receipt.receiptNo(), receipt.tenantName(), reason);
        }
    }

    /**
     * คำตอบของ POST /api/receipts/send ทั้งสองรายการเรียงตามลำดับที่ขอมา
     * <p>
     * ตอบ 200 แม้บางใบถูกข้าม เพราะคำขอทำงานครบตามที่ขอ ใบไหนไม่ออกดูได้จาก skipped
     * ถ้าทั้งคำขอส่งไม่ออกเลยเพราะเมลเซิร์ฟเวอร์ล่ม จะเป็น 503 แทน ไม่ใช่ 200 ที่ skipped เต็มรายการ
     */
    public record SendReceiptsResponse(List<SentReceipt> sent, List<SkippedReceipt> skipped) {
    }
}
