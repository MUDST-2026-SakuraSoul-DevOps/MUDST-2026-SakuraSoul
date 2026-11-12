package com.sakurasoul.apartment.billing;

import com.sakurasoul.apartment.apartmentconfig.BankAccount;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/** บล็อกบัญชีรับเงินของ PDF และอีเมล (SSK-168) ใช้ตัวอย่างในสัญญา API ดู ContractExample */
class PaymentBlockTest {

    @Test
    @DisplayName("SSK-168 ใบล่าสุดที่ยังต้องจ่ายมีบล็อก บัญชี และ QR ของยอดที่ต้องจ่าย พร้อมยอดใต้รูป")
    void theBillStillDueGetsTheBlock() {
        ContractExample example = new ContractExample();

        PaymentBlock block = PaymentBlock.of(example.responseOf(example.november));

        assertThat(block.amountDue()).isEqualTo("฿5,145.00");
        assertThat(block.bankName()).isEqualTo("Kasikornbank");
        assertThat(block.accountName()).isEqualTo("Sakura Soul Apartment");
        assertThat(block.accountNumber()).isEqualTo("012-3-45678-9");
        assertThat(block.promptPayPayload()).isEqualTo(
                "00020101021229370016A00000067701011101130066812345678530376454075145.005802TH630426B7");
        assertThat(block.qrCaption()).isEqualTo("Scan to pay ฿5,145.00");
        Map<String, String> pdf = block.pdfModel();
        assertThat(pdf).containsEntry("title", "Payment details")
                .containsEntry("bankName", "Kasikornbank")
                .containsEntry("qrCaption", "Scan to pay ฿5,145.00");
        assertThat(pdf.get("qr")).startsWith("data:image/png;base64,");
    }

    @Test
    @DisplayName("SSK-168 ยกเลิกการชำระแล้วยอดใต้ QR กลับเป็นยอดเต็มของบิล")
    void theAmountUnderTheQrFollowsTheBalanceDue() {
        ContractExample example = new ContractExample();
        example.voidPaymentOnNovember();

        PaymentBlock block = PaymentBlock.of(example.responseOf(example.november));

        assertThat(block.amountDue()).isEqualTo("฿8,145.00");
        assertThat(block.qrCaption()).isEqualTo("Scan to pay ฿8,145.00");
    }

    @Test
    @DisplayName("SSK-168 สำเนาบัญชีที่ไม่มี PromptPay มีบล็อกบัญชีแต่ไม่มี QR")
    void anAccountWithoutPromptPayHasNoQr() {
        ContractExample example = new ContractExample(
                BankAccount.of("Siam Commercial Bank", "Sakura Soul Apartment", "405-1-23456-7", null));

        PaymentBlock block = PaymentBlock.of(example.responseOf(example.november));

        assertThat(block.bankName()).isEqualTo("Siam Commercial Bank");
        assertThat(block.promptPayPayload()).isNull();
        assertThat(block.pdfModel().get("qr")).isEmpty();
    }

    @Test
    @DisplayName("SSK-168 ใบที่ต้องจ่ายแต่ไม่มีสำเนาบัญชีไม่มีบล็อก")
    void noBlockWithoutASnapshot() {
        ContractExample withoutBank = new ContractExample(null);

        assertThat(PaymentBlock.of(withoutBank.responseOf(withoutBank.november))).isNull();
    }

    /** ใบ ต.ค. มีสำเนาบัญชีด้วย ใบเก่าจึงไม่มีบล็อกเพราะสถานะของใบ ไม่ใช่เพราะไม่มีสำเนา */
    @Test
    @DisplayName("SSK-168 ใบเก่าที่ครบแล้วหรือถูกยกยอดไม่มีบล็อกแม้จะมีสำเนาบัญชี (ตัดสิน 11 พ.ย.)")
    void noBlockOnAnOlderReceiptEvenWithASnapshot() {
        ContractExample example = new ContractExample(ContractExample.BANK, ContractExample.BANK);
        assertThat(example.responseOf(example.october).bank()).isNotNull();
        assertThat(ReceiptStanding.of(example.responseOf(example.october))).isEqualTo(ReceiptStanding.SETTLED);
        assertThat(PaymentBlock.of(example.responseOf(example.october))).isNull();

        example.voidPaymentOnNovember();

        assertThat(ReceiptStanding.of(example.responseOf(example.october))).isEqualTo(ReceiptStanding.CARRIED);
        assertThat(PaymentBlock.of(example.responseOf(example.october))).isNull();
    }

    @Test
    @DisplayName("SSK-168 บล็อกในอีเมลเป็นข้อความธรรมดา บอกบัญชีแล้วให้สแกน QR ใน PDF ที่แนบด้วยยอดเดียวกับ QR")
    void theEmailTextPointsAtTheQrInTheAttachedPdf() {
        ContractExample example = new ContractExample();

        assertThat(PaymentBlock.of(example.responseOf(example.november)).emailText()).isEqualTo("""
                Payment details
                Bank: Kasikornbank
                Account name: Sakura Soul Apartment
                Account number: 012-3-45678-9
                PromptPay QR: scan the QR code in the attached PDF to pay ฿5,145.00
                """);
    }

    @Test
    @DisplayName("SSK-168 บัญชีที่ไม่มี PromptPay ไม่มีบรรทัดให้สแกน QR ในอีเมล")
    void theEmailTextWithoutPromptPayHasNoQrLine() {
        ContractExample example = new ContractExample(
                BankAccount.of("Siam Commercial Bank", "Sakura Soul Apartment", "405-1-23456-7", null));

        assertThat(PaymentBlock.of(example.responseOf(example.november)).emailText())
                .endsWith("Account number: 405-1-23456-7\n")
                .doesNotContain("PromptPay");
    }

    @Test
    @DisplayName("SSK-168 toString ไม่พิมพ์เลขบัญชีหรือ payload")
    void toStringHidesTheNumbers() {
        ContractExample example = new ContractExample();

        assertThat(PaymentBlock.of(example.responseOf(example.november)).toString())
                .isEqualTo("PaymentBlock[hidden]");
    }
}
