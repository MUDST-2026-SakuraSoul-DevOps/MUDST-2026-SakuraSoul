package com.sakurasoul.apartment.promptpay;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * payload ของ QR PromptPay (SSK-168)
 * <p>
 * ข้อความที่คาดหวังทุกตัวคิดแยกจากโค้ดนี้สองทาง คือสคริปต์ Python ตอนออกแบบ กับ generatePromptPayPayload
 * ของหน้าเว็บ (frontend/src/domain/paymentPhase2.ts) ที่รันด้วย node ได้ตรงกันทุกตัว
 * ส่วนการสแกนด้วยแอปธนาคารจริงตาม AC ของการ์ดเป็นการทดสอบด้วยมือ
 */
class PromptPayPayloadTest {

    private static final PromptPayId MOBILE = PromptPayId.parse("0812345678");

    @ParameterizedTest(name = "{0} บาท")
    @CsvSource({
        // ตัวอย่างในสัญญา API (docs/api-contract-payments-phase2.md)
        "5145.00, 00020101021229370016A00000067701011101130066812345678530376454075145.005802TH630426B7",
        // ใบ 5,000 จ่ายแล้ว 2,000 ตามคอมเมนต์ของทีมใน SSK-168
        "3000.00, 00020101021229370016A00000067701011101130066812345678530376454073000.005802TH6304F1A9",
        // ยอดใน AC ของการ์ด
        "8145.00, 00020101021229370016A00000067701011101130066812345678530376454078145.005802TH6304F2CD",
        "5000.00, 00020101021229370016A00000067701011101130066812345678530376454075000.005802TH630493E5",
        // CRC ที่ขึ้นต้นด้วยศูนย์
        "1.00,    00020101021229370016A00000067701011101130066812345678530376454041.005802TH630403CF",
        "0.50,    00020101021229370016A00000067701011101130066812345678530376454040.505802TH6304760F",
        // ยอดสูงสุดของ NUMERIC(10,2)
        "99999999.99, 00020101021229370016A000000677010111011300668123456785303764541199999999.995802TH6304ED3F"
    })
    @DisplayName("SSK-168 payload ของเบอร์มือถือตรงกับค่าที่คิดแยกไว้ทุกตัวอักษร")
    void aMobilePayloadMatchesTheIndependentVectors(BigDecimal amount, String expected) {
        assertThat(PromptPayPayload.of(MOBILE, amount)).isEqualTo(expected);
    }

    @Test
    @DisplayName("SSK-168 เลขประจำตัว 13 หลักอยู่ในช่องย่อย 02 ไม่ใช่ 01")
    void aThirteenDigitIdGoesUnderSubTag02() {
        assertThat(PromptPayPayload.of(PromptPayId.parse("1234567890123"), new BigDecimal("8145.00")))
                .isEqualTo("00020101021229370016A00000067701011102131234567890123530376454078145.005802TH630414CD");
    }

    @Test
    @DisplayName("SSK-168 ลำดับช่องตายตัว ขึ้นต้นด้วย 00 ปิดท้ายด้วย CRC ของทุกอย่างก่อนหน้า")
    void theFieldsComeInTheFixedOrderWithTheCrcLast() {
        String payload = PromptPayPayload.of(MOBILE, new BigDecimal("3000"));

        List<String[]> fields = topLevelFields(payload);

        assertThat(fields).extracting(field -> field[0]).containsExactly("00", "01", "29", "53", "54", "58", "63");
        assertThat(fields).extracting(field -> field[1])
                .containsExactly("01", "12", "0016A00000067701011101130066812345678", "764", "3000.00", "TH",
                        Crc16Ccitt.hex(payload.substring(0, payload.length() - 4)));
    }

    @ParameterizedTest(name = "{0} → {1}")
    @CsvSource({"3000, 3000.00", "8145.00, 8145.00", "0.5, 0.50", "3E+3, 3000.00", "1234567.8, 1234567.80",
        "1000000, 1000000.00", "0.125, 0.13"})
    @DisplayName("SSK-168 จำนวนเงินมีทศนิยมสองตำแหน่งเสมอ ไม่มีจุลภาคหรือรูปวิทยาศาสตร์ ปัดครึ่งขึ้นแบบเงินทั้งระบบ")
    void theAmountHasTwoDecimalsAndNoGrouping(BigDecimal amount, String expected) {
        assertThat(PromptPayPayload.amountText(amount)).isEqualTo(expected);
    }

    @ParameterizedTest(name = "{0}")
    @ValueSource(strings = {"0", "0.00", "0.004", "-1"})
    @DisplayName("SSK-168 ยอดที่ไม่เกิน 0 (หลังปัด) ไม่ออก QR และข้อความไม่มีเลข PromptPay")
    void aZeroOrNegativeAmountIsRejected(String amount) {
        assertThatThrownBy(() -> PromptPayPayload.of(MOBILE, new BigDecimal(amount)))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("QR amount must be greater than 0")
                .message().doesNotContain("812345678");
    }

    @Test
    @DisplayName("SSK-168 ไม่มียอดหรือยอดเกิน NUMERIC(10,2) ไม่ออก QR")
    void aMissingOrTooLargeAmountIsRejected() {
        assertThatThrownBy(() -> PromptPayPayload.of(MOBILE, null))
                .hasMessage(PromptPayPayload.AMOUNT_MESSAGE);
        assertThatThrownBy(() -> PromptPayPayload.of(MOBILE, new BigDecimal("100000000.00")))
                .hasMessage(PromptPayPayload.TOO_LARGE_MESSAGE);
    }

    /** แยก payload ชั้นนอกเป็นคู่ (เลขช่อง, ค่า) ตามความยาวสองหลักของแต่ละช่อง */
    private static List<String[]> topLevelFields(String payload) {
        List<String[]> fields = new ArrayList<>();
        int at = 0;
        while (at < payload.length()) {
            String tag = payload.substring(at, at + 2);
            int length = Integer.parseInt(payload.substring(at + 2, at + 4));
            fields.add(new String[] {tag, payload.substring(at + 4, at + 4 + length)});
            at += 4 + length;
        }
        return fields;
    }
}
