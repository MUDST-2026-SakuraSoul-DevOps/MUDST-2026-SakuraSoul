package com.sakurasoul.apartment.billing;

import com.sakurasoul.apartment.apartmentconfig.ApartmentConfigDtos.BankAccountResponse;
import com.sakurasoul.apartment.billing.ReceiptDtos.ReceiptResponse;
import com.sakurasoul.apartment.pdf.DocumentFormat;
import com.sakurasoul.apartment.promptpay.PromptPayQr;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * บล็อก "Payment details" ของใบที่ต้องจ่าย (SSK-168) ใช้ทั้ง PDF และอีเมล ข้อความของสองที่จึงตรงกันเสมอ
 * <p>
 * มีเฉพาะใบล่าสุดที่ยังมียอดต้องจ่าย (DUE) และมีสำเนาบัญชี ใบที่ถูกยกยอดไม่แสดงบัญชีเพราะต้องจ่ายตามบิลใหม่
 * และสำเนาของใบเก่าอาจเป็นบัญชีเดิมที่เลิกใช้แล้ว ใบที่จ่ายครบไม่มีอะไรต้องจ่าย (ตัดสิน 11 พ.ย.)
 * ส่วน bank ใน JSON ยังส่งทุกใบที่มีสำเนา
 * <p>
 * บล็อกมีแค่บัญชีกับ QR ยอดรวม จ่ายแล้ว และยอดที่ต้องจ่าย (ข้อสรุปของทีมใน SSK-168 ให้แสดงคู่กัน) อยู่ในส่วนยอดของแต่ละเอกสาร
 * คือตารางกับบรรทัดสถานะของ PDF และบรรทัดยอดของอีเมล ไม่พิมพ์ซ้ำในบล็อก ใบที่มียอดยกมาจะได้ยังจบในหน้าเดียว
 *
 * @param amountDue        balanceDue ที่จัดรูปแล้ว เท่ากับยอดใน QR
 * @param promptPayPayload null เมื่อสำเนาบัญชีไม่มี PromptPay บล็อกนี้จึงไม่มี QR
 */
record PaymentBlock(
        String amountDue,
        String bankName,
        String accountName,
        String accountNumber,
        String promptPayPayload) {

    static final String TITLE = "Payment details";

    /** null เมื่อใบนี้ไม่ใช่ใบที่ต้องจ่ายหรือไม่มีสำเนาบัญชี */
    static PaymentBlock of(ReceiptResponse receipt) {
        BankAccountResponse bank = receipt.bank();
        if (bank == null || ReceiptStanding.of(receipt) != ReceiptStanding.DUE) {
            return null;
        }
        return new PaymentBlock(DocumentFormat.money(receipt.balanceDue()),
                bank.bankName(), bank.accountName(), bank.accountNumber(), receipt.promptPayPayload());
    }

    /** บอกยอดใน QR ใต้ภาพ ผู้เช่าเห็นก่อนสแกนว่าจะจ่ายเท่าไหร่ สั้นพอให้อยู่บรรทัดเดียวใต้ภาพ */
    String qrCaption() {
        return "Scan to pay " + amountDue;
    }

    /**
     * ตัวแปรของ template PDF เป็นสตริงล้วนแบบเดียวกับบรรทัดรายการ qr เป็นภาพ PNG แบบ data: URI
     * หรือสตริงว่างเมื่อไม่มี PromptPay template จึงไม่ต้องรู้จัก record
     */
    Map<String, String> pdfModel() {
        Map<String, String> model = new LinkedHashMap<>();
        model.put("title", TITLE);
        model.put("bankName", bankName);
        model.put("accountName", accountName);
        model.put("accountNumber", accountNumber);
        model.put("qr", promptPayPayload == null ? "" : PromptPayQr.dataUri(promptPayPayload));
        model.put("qrCaption", qrCaption());
        return model;
    }

    /**
     * บล็อกเดียวกันในอีเมลแบบข้อความธรรมดา ทุกบรรทัดลงท้ายด้วยตัวขึ้นบรรทัด
     * <p>
     * อีเมลไม่ฝังรูป QR เพราะเป็นข้อความธรรมดา (ไม่ใช่ HTML) และมีไฟล์แนบได้ไฟล์เดียว บรรทัดสุดท้ายจึงบอกให้สแกน QR
     * ใน PDF ที่แนบมา ซึ่งทำจาก response ตัวเดียวกัน ยอดในอีเมลกับใน QR จึงตรงกันเสมอ (ตัดสิน 11 พ.ย.)
     */
    String emailText() {
        StringBuilder text = new StringBuilder()
                .append(TITLE).append('\n')
                .append("Bank: ").append(bankName).append('\n')
                .append("Account name: ").append(accountName).append('\n')
                .append("Account number: ").append(accountNumber).append('\n');
        if (promptPayPayload != null) {
            text.append("PromptPay QR: scan the QR code in the attached PDF to pay ").append(amountDue).append('\n');
        }
        return text.toString();
    }

    /** ไม่พิมพ์ค่า เพราะมีเลขบัญชีและ payload ที่มีเลข PromptPay */
    @Override
    public String toString() {
        return "PaymentBlock[hidden]";
    }
}
