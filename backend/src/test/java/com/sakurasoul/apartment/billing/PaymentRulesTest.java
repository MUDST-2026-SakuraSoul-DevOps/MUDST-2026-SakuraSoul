package com.sakurasoul.apartment.billing;

import com.sakurasoul.apartment.billing.PaymentDtos.RecordPaymentRequest;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.NullSource;
import org.junit.jupiter.params.provider.ValueSource;

import java.math.BigDecimal;
import java.time.LocalDate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** ค่าในคำขอรับชำระ (SSK-163) ทุกข้อความในตาราง error ของสัญญา API พร้อมค่าขอบและลำดับการตรวจ */
class PaymentRulesTest {

    private static final LocalDate TODAY = LocalDate.of(2026, 12, 3);

    @Test
    @DisplayName("SSK-163 ค่าที่ถูกผ่าน ยอดปัดสองตำแหน่งแบบครึ่งขึ้น ข้อความตัดช่องว่างหัวท้าย ช่องว่างล้วนเป็น null")
    void aValidRequestIsNormalised() {
        PaymentRules.Valid valid = PaymentRules.check(
                new RecordPaymentRequest(new BigDecimal("3000.005"), " 2026-12-01 ", "TRANSFER", "  KBANK 0012 ", "   "),
                TODAY);

        assertThat(valid.amount()).isEqualTo(new BigDecimal("3000.01"));
        assertThat(valid.paidOn()).isEqualTo(LocalDate.of(2026, 12, 1));
        assertThat(valid.method()).isEqualTo(PaymentMethod.TRANSFER);
        assertThat(valid.reference()).isEqualTo("KBANK 0012");
        assertThat(valid.note()).isNull();
    }

    @ParameterizedTest
    @NullAndEmptySource
    @DisplayName("SSK-163 ไม่ส่งวันที่ได้รับเงินคือวันนี้ตามเวลาไทย")
    void aMissingPaymentDateMeansToday(String paidOn) {
        assertThat(PaymentRules.check(request("100", paidOn, "CASH"), TODAY).paidOn()).isEqualTo(TODAY);
    }

    @ParameterizedTest(name = "amount {0}")
    @NullSource
    @ValueSource(strings = {"0", "-1", "0.004"})
    @DisplayName("SSK-163 ยอดที่ไม่ส่ง ศูนย์ ติดลบ หรือปัดแล้วเป็นศูนย์ ไม่ผ่าน")
    void anAmountThatIsNotPositiveIsRejected(String amount) {
        assertRejected(request(amount, null, "CASH"), "Amount must be greater than 0");
    }

    @ParameterizedTest(name = "method \"{0}\"")
    @NullAndEmptySource
    @ValueSource(strings = {"cash", "PROMPTPAY", "Bank transfer"})
    @DisplayName("SSK-163 ช่องทางต้องเป็นหนึ่งในสี่ค่าตามสัญญา ตัวพิมพ์ต้องตรง ข้อความของหน้าเว็บเดิมต้องแปลงก่อนส่ง")
    void anUnknownMethodIsRejected(String method) {
        assertRejected(request("100", null, method), "Payment method must be CASH, TRANSFER, QR or OTHER");
    }

    @ParameterizedTest(name = "paidOn \"{0}\"")
    @ValueSource(strings = {"2026/12/01", "2026-12-1", "+2026-12-01", "2026-02-30", "yesterday"})
    @DisplayName("SSK-163 วันที่ต้องเป็น YYYY-MM-DD ที่มีจริง")
    void aMalformedPaymentDateIsRejected(String paidOn) {
        assertRejected(request("100", paidOn, "CASH"), "The payment date must be in YYYY-MM-DD format");
    }

    @Test
    @DisplayName("SSK-163 วันนี้ผ่าน พรุ่งนี้ไม่ผ่าน ย้อนหลังไกลแค่ไหนก็ได้")
    void aPaymentDateCannotBeInTheFuture() {
        assertThat(PaymentRules.check(request("100", "2026-12-03", "CASH"), TODAY).paidOn()).isEqualTo(TODAY);
        assertThat(PaymentRules.check(request("100", "2020-01-01", "CASH"), TODAY).paidOn())
                .isEqualTo(LocalDate.of(2020, 1, 1));
        assertRejected(request("100", "2026-12-04", "CASH"), "The payment date cannot be in the future");
    }

    /** นับเป็นตัวอักษรแบบ VARCHAR อีโมจิหนึ่งตัวคือหนึ่งตัวอักษรแม้ String ของ Java นับเป็นสอง */
    @Test
    @DisplayName("SSK-163 เลขอ้างอิงยาวได้ 100 ตัวอักษร โน้ตยาวได้ 500 ตัวอักษร")
    void theReferenceAndTheNoteHaveALimit() {
        assertThat(PaymentRules.check(withTexts("ก".repeat(100), "😀".repeat(500)), TODAY).note()).hasSize(1000);
        assertRejected(withTexts("ก".repeat(101), null), "The reference must be 100 characters or fewer");
        assertRejected(withTexts(null, "a".repeat(501)), "The note must be 500 characters or fewer");
    }

    @Test
    @DisplayName("SSK-163 ผิดหลายช่องได้ข้อความของช่องแรกตามลำดับ amount, method, paidOn, reference, note")
    void theFirstWrongFieldWins() {
        assertRejected(new RecordPaymentRequest(BigDecimal.ZERO, "bad", "bad", "x".repeat(101), null),
                "Amount must be greater than 0");
        assertRejected(new RecordPaymentRequest(BigDecimal.TEN, "bad", "bad", "x".repeat(101), null),
                "Payment method must be CASH, TRANSFER, QR or OTHER");
        assertRejected(new RecordPaymentRequest(BigDecimal.TEN, "bad", "QR", "x".repeat(101), null),
                "The payment date must be in YYYY-MM-DD format");
        assertRejected(new RecordPaymentRequest(BigDecimal.TEN, null, "QR", "x".repeat(101), "x".repeat(501)),
                "The reference must be 100 characters or fewer");
    }

    @Test
    @DisplayName("SSK-163 ข้อความช่องทางของ /pay แบบเดิมตัดช่องว่าง ว่างเป็น null และยาวได้ไม่เกินช่อง payment_method ของใบ")
    void theOldPayTextFitsTheReceiptColumn() {
        assertThat(PaymentRules.payInFullText(null)).isNull();
        assertThat(PaymentRules.payInFullText("  ")).isNull();
        assertThat(PaymentRules.payInFullText(" Cash ")).isEqualTo("Cash");
        assertThat(PaymentRules.payInFullText("x".repeat(50))).hasSize(50);
        assertThatThrownBy(() -> PaymentRules.payInFullText("x".repeat(51)))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("The payment method must be 50 characters or fewer");
    }

    private static void assertRejected(RecordPaymentRequest request, String message) {
        assertThatThrownBy(() -> PaymentRules.check(request, TODAY))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage(message);
    }

    private static RecordPaymentRequest request(String amount, String paidOn, String method) {
        return new RecordPaymentRequest(amount == null ? null : new BigDecimal(amount), paidOn, method, null, null);
    }

    private static RecordPaymentRequest withTexts(String reference, String note) {
        return new RecordPaymentRequest(new BigDecimal("100"), null, "CASH", reference, note);
    }
}
