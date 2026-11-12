package com.sakurasoul.apartment.billing;

import com.sakurasoul.apartment.apartmentconfig.ApartmentConfigDtos.BankAccountResponse;
import com.sakurasoul.apartment.billing.PaymentDtos.PaymentResponse;
import com.sakurasoul.apartment.billing.ReceiptDtos.ReceiptItem;
import com.sakurasoul.apartment.billing.ReceiptDtos.ReceiptResponse;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/** รูปของใบเสร็จที่ตอบกลับ (SSK-163, SSK-164, SSK-168) ตัวเลขตรงกับตัวอย่าง JSON ในสัญญา API ดู ContractExample */
class ReceiptResponseTest {

    private final ContractExample example = new ContractExample();

    @Test
    @DisplayName("SSK-163 ใบล่าสุดตอบยอดทั้งสองมุมตามตัวอย่างในสัญญา เงินบนบิลนี้ถูกตัดเข้าใบเก่า ใบนี้จึงยัง PENDING")
    void theLatestBillMatchesTheContractExample() {
        ReceiptResponse response = example.responseOf(example.november);

        assertThat(response.latest()).isTrue();
        assertThat(response.chargesAmount()).isEqualByComparingTo("5100.00");
        assertThat(response.previousBalance()).isEqualByComparingTo("3000.00");
        assertThat(response.interestAmount()).isEqualByComparingTo("45.00");
        assertThat(response.totalAmount()).isEqualByComparingTo("8145.00");
        assertThat(response.paidAmount()).isEqualByComparingTo("3000.00");
        assertThat(response.balanceDue()).isEqualByComparingTo("5145.00");
        assertThat(response.settledAmount()).isEqualByComparingTo("0.00");
        assertThat(response.outstandingAmount()).isEqualByComparingTo("5145.00");
        assertThat(response.status()).isEqualTo(ReceiptStatus.PENDING);
        assertThat(response.oldestUnpaidDueDate()).isEqualTo(LocalDate.of(2026, 12, 5));
        assertThat(response.overdue()).isFalse();
        assertThat(response.carriedToReceiptId()).isNull();
        assertThat(response.carriedToReceiptNo()).isNull();
        assertThat(response.paidOn()).isNull();
        assertThat(response.payments()).containsExactly(new PaymentResponse(31L, new BigDecimal("3000.00"),
                LocalDate.of(2026, 12, 1), PaymentMethod.TRANSFER, "KBANK 0012", null,
                Instant.parse("2026-12-01T03:12:44.120Z"), null));
        assertThat(response.bank()).isEqualTo(new BankAccountResponse("Kasikornbank", "Sakura Soul Apartment",
                "012-3-45678-9", "0812345678"));
        // ข้อความ QR ตัวอย่างในสัญญา จำนวนเงินคือ balanceDue ไม่ใช่ totalAmount
        assertThat(response.promptPayPayload()).isEqualTo(
                "00020101021229370016A00000067701011101130066812345678530376454075145.005802TH630426B7");
    }

    @Test
    @DisplayName("SSK-168 QR ตามยอดที่ยังต้องจ่าย ยกเลิกการชำระแล้ว QR กลับเป็นยอดเต็มของบิล 8,145.00")
    void theQrFollowsTheBalanceDue() {
        example.voidPaymentOnNovember();

        assertThat(example.responseOf(example.november).promptPayPayload()).isEqualTo(
                "00020101021229370016A00000067701011101130066812345678530376454078145.005802TH6304F2CD");
    }

    @Test
    @DisplayName("SSK-168 ใบที่ไม่ใช่ใบล่าสุดไม่มี QR ทั้งตอนครบแล้วและตอนถูกยกยอด ใบที่ออกก่อนตั้งบัญชีไม่มีบัญชี")
    void anOlderReceiptHasNoQr() {
        assertThat(example.responseOf(example.october).bank()).isNull();
        assertThat(example.responseOf(example.october).promptPayPayload()).isNull();

        example.voidPaymentOnNovember();

        assertThat(ReceiptStanding.of(example.responseOf(example.october))).isEqualTo(ReceiptStanding.CARRIED);
        assertThat(example.responseOf(example.october).promptPayPayload()).isNull();
    }

    @Test
    @DisplayName("SSK-168 toString ของใบไม่พิมพ์ QR หรือบัญชี เพราะทั้งสองมีเลขของเจ้าของหอ")
    void toStringHidesTheBankAndTheQr() {
        assertThat(example.responseOf(example.november).toString())
                .isEqualTo("ReceiptResponse[RC-2026-0012]")
                .doesNotContain("0066812345678", "012-3-45678-9");
    }

    @Test
    @DisplayName("SSK-164 บรรทัดยอดยกมากับดอกเบี้ยต่อท้ายใบ พร้อมที่มาในช่อง detail ผลรวมของบรรทัดเท่ายอดบิล")
    void theCarriedLinesComeLastAndAddUpToTheTotal() {
        List<ReceiptItem> items = example.responseOf(example.november).items();

        assertThat(items).extracting(ReceiptItem::item).containsExactly(
                "Room rent", "Common area fee", "Internet", "Electricity", "Water", "Previous balance", "Late interest");
        assertThat(items.get(5)).isEqualTo(new ReceiptItem("Previous balance", "RC-2026-0011", null, null, null,
                new BigDecimal("3000.00"), null));
        assertThat(items.get(6)).isEqualTo(new ReceiptItem("Late interest", "1.50% of ฿3,000.00", null, null, null,
                new BigDecimal("45.00"), null));
        assertThat(items.stream().map(ReceiptItem::amount).reduce(BigDecimal.ZERO, BigDecimal::add))
                .isEqualByComparingTo(example.november.getTotalAmount());
    }

    @Test
    @DisplayName("SSK-164 ใบที่ถูกยกยอดชี้ไปบิลใหม่ด้วย id และเลขที่ ไม่ใช่ใบล่าสุดจึงไม่มี balanceDue ตัดครบจากเงินบนบิลอื่น")
    void aCarriedReceiptShowsWhereItsBalanceWent() {
        ReceiptResponse response = example.responseOf(example.october);

        assertThat(response.latest()).isFalse();
        assertThat(response.carriedToReceiptId()).isEqualTo(12L);
        assertThat(response.carriedToReceiptNo()).isEqualTo("RC-2026-0012");
        assertThat(response.balanceDue()).isNull();
        assertThat(response.oldestUnpaidDueDate()).isNull();
        assertThat(response.paidAmount()).isEqualByComparingTo("2000.00");
        assertThat(response.settledAmount()).isEqualByComparingTo("5000.00");
        assertThat(response.outstandingAmount()).isEqualByComparingTo("0.00");
        assertThat(response.status()).isEqualTo(ReceiptStatus.PAID);
        assertThat(response.payments()).extracting(PaymentResponse::id).containsExactly(30L);
        assertThat(response.items()).hasSize(5);
    }

    /** ใบ ต.ค. ครบเพราะการชำระ 31 ซึ่งบันทึกบนใบ พ.ย. วันที่จ่ายของใบจึงมาจากการชำระก้อนนั้น ไม่ใช่ก้อนบนใบตัวเอง */
    @Test
    @DisplayName("SSK-163 paidOn คือวันที่ได้รับเงินของการชำระที่ทำให้ใบครบ แม้ก้อนนั้นจะบันทึกบนบิลอื่น ใบที่ยังไม่ครบไม่มี")
    void paidOnComesFromThePaymentThatSettledTheReceipt() {
        assertThat(example.responseOf(example.october).paidOn()).isEqualTo(LocalDate.of(2026, 12, 1));

        example.voidPaymentOnNovember();

        assertThat(example.responseOf(example.october).paidOn()).isNull();
    }

    @Test
    @DisplayName("SSK-163 เกินกำหนดเฉพาะใบล่าสุด และนับจากวันถัดจากวันครบกำหนดของใบเก่าสุดที่ยังค้าง")
    void onlyTheLatestBillIsOverdue() {
        LeaseAccount account = example.account();
        LocalDate afterDue = LocalDate.of(2026, 12, 6);

        assertThat(ReceiptResponse.of(example.november, account, LocalDate.of(2026, 12, 5)).overdue()).isFalse();
        assertThat(ReceiptResponse.of(example.november, account, afterDue).overdue()).isTrue();
        assertThat(ReceiptResponse.of(example.october, account, afterDue).overdue()).isFalse();
    }

    @Test
    @DisplayName("SSK-163 การชำระที่ยกเลิกแล้วยังอยู่ในรายการของบิลพร้อมเวลาที่ยกเลิก แต่ไม่นับในยอดที่จ่าย")
    void aVoidedPaymentIsListedButNotCounted() {
        example.voidPaymentOnNovember();

        ReceiptResponse response = example.responseOf(example.november);

        assertThat(response.payments()).singleElement().satisfies(payment -> {
            assertThat(payment.id()).isEqualTo(31L);
            assertThat(payment.voidedAt()).isEqualTo(Instant.parse("2026-12-02T03:00:00Z"));
        });
        assertThat(response.paidAmount()).isEqualByComparingTo("0.00");
        assertThat(response.balanceDue()).isEqualByComparingTo("8145.00");
        assertThat(response.oldestUnpaidDueDate()).isEqualTo(LocalDate.of(2026, 11, 5));
    }
}
