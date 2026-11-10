package com.sakurasoul.apartment.billing;

import com.sakurasoul.apartment.apartmentconfig.BankAccount;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/** บล็อกบัญชีรับเงินของ PDF และอีเมล (SSK-168) ใช้ตัวอย่างในสัญญา API ดู ContractExample */
class PaymentBlockTest {

    @Test
    @DisplayName("SSK-168 ใบล่าสุดที่ยังต้องจ่ายมีบล็อก ยอดรวม จ่ายแล้ว ยอดที่ต้องจ่าย บัญชี และ QR ของยอดที่ต้องจ่าย")
    void theBillStillDueGetsTheBlock() {
        ContractExample example = new ContractExample();

        PaymentBlock block = PaymentBlock.of(example.responseOf(example.november));

        assertThat(block.total()).isEqualTo("฿8,145.00");
        assertThat(block.paidSoFar()).isEqualTo("฿3,000.00");
        assertThat(block.amountDue()).isEqualTo("฿5,145.00");
        assertThat(block.bankName()).isEqualTo("Kasikornbank");
        assertThat(block.accountName()).isEqualTo("Sakura Soul Apartment");
        assertThat(block.accountNumber()).isEqualTo("012-3-45678-9");
        assertThat(block.promptPayPayload()).isEqualTo(
                "00020101021229370016A00000067701011101130066812345678530376454075145.005802TH630426B7");
        assertThat(block.qrCaption()).isEqualTo("Scan with a mobile banking app to pay ฿5,145.00");
        Map<String, String> pdf = block.pdfModel();
        assertThat(pdf.get("title")).isEqualTo("Payment details");
        assertThat(pdf.get("qr")).startsWith("data:image/png;base64,");
        assertThat(pdf.get("amountDue")).isEqualTo("฿5,145.00");
    }

    @Test
    @DisplayName("SSK-168 ยังไม่มีการชำระ ยอดจ่ายแล้วเป็น ฿0.00 ไม่ใช่ว่าง")
    void nothingPaidYetShowsZero() {
        ContractExample example = new ContractExample();
        example.voidPaymentOnNovember();

        PaymentBlock block = PaymentBlock.of(example.responseOf(example.november));

        assertThat(block.paidSoFar()).isEqualTo("฿0.00");
        assertThat(block.amountDue()).isEqualTo("฿8,145.00");
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
    @DisplayName("SSK-168 ใบที่ต้องจ่ายแต่ไม่มีสำเนาบัญชีไม่มีบล็อก ใบเก่าที่ครบแล้วหรือถูกยกยอดก็ไม่มี")
    void noBlockWithoutASnapshotOrOutsideTheBillDue() {
        ContractExample withoutBank = new ContractExample(null);
        assertThat(PaymentBlock.of(withoutBank.responseOf(withoutBank.november))).isNull();

        ContractExample example = new ContractExample();
        assertThat(PaymentBlock.of(example.responseOf(example.october))).isNull();
        example.voidPaymentOnNovember();
        assertThat(ReceiptStanding.of(example.responseOf(example.october))).isEqualTo(ReceiptStanding.CARRIED);
        assertThat(PaymentBlock.of(example.responseOf(example.october))).isNull();
    }

    @Test
    @DisplayName("SSK-168 toString ไม่พิมพ์เลขบัญชีหรือ payload")
    void toStringHidesTheNumbers() {
        ContractExample example = new ContractExample();

        assertThat(PaymentBlock.of(example.responseOf(example.november)).toString())
                .isEqualTo("PaymentBlock[hidden]");
    }
}
