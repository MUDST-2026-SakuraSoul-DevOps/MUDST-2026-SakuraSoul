package com.sakurasoul.apartment.promptpay;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** เลข PromptPay (SSK-168) รูปแบบที่รับ การแปลงเป็นปลายทางของ payload และการไม่พิมพ์เลขออกมา */
class PromptPayIdTest {

    @ParameterizedTest(name = "\"{0}\"")
    @ValueSource(strings = {"0812345678", "081-234-5678", " 0812345678 ", " 0812345678 "})
    @DisplayName("SSK-168 เบอร์มือถือ 10 หลักขึ้นต้นด้วย 0 มีขีดหรือช่องว่างหัวท้ายได้ ปลายทางเปลี่ยน 0 เป็น 0066")
    void aMobileNumberBecomesTheThaiCountryCodeTarget(String raw) {
        PromptPayId id = PromptPayId.parse(raw);

        assertThat(id.kind()).isEqualTo(PromptPayId.Kind.MOBILE);
        assertThat(id.digits()).isEqualTo("0812345678");
        assertThat(id.target()).isEqualTo("0066812345678");
        assertThat(id.kind().subTag()).isEqualTo("01");
    }

    @ParameterizedTest(name = "\"{0}\"")
    @ValueSource(strings = {"1234567890123", "1-2345-67890-12-3"})
    @DisplayName("SSK-168 เลขประจำตัว 13 หลักใช้เป็นปลายทางตรง ๆ ในช่องย่อย 02")
    void aThirteenDigitIdIsUsedAsItIs(String raw) {
        PromptPayId id = PromptPayId.parse(raw);

        assertThat(id.kind()).isEqualTo(PromptPayId.Kind.NATIONAL_ID);
        assertThat(id.digits()).isEqualTo("1234567890123");
        assertThat(id.target()).isEqualTo("1234567890123");
        assertThat(id.kind().subTag()).isEqualTo("02");
    }

    @ParameterizedTest(name = "\"{0}\"")
    @NullAndEmptySource
    @ValueSource(strings = {
        "   ",
        "812345678",        // 9 หลัก
        "1812345678",       // 10 หลักที่ไม่ขึ้นต้นด้วย 0
        "08123456789",      // 11 หลัก
        "081234567890",     // 12 หลัก
        "12345678901234",   // 14 หลัก
        "081 234 5678",     // เว้นวรรคกลางเลข สัญญาให้คั่นด้วยขีดเท่านั้น
        "+66812345678",
        "08123456ab",
        "０８１２３４５６７８" // ตัวเลขเต็มความกว้าง
    })
    @DisplayName("SSK-168 รูปแบบอื่นได้ข้อความตามสัญญา API")
    void anythingElseIsRejectedWithTheContractMessage(String raw) {
        assertThatThrownBy(() -> PromptPayId.parse(raw))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("PromptPay ID must be a 10-digit phone number or a 13-digit ID");
    }

    @Test
    @DisplayName("SSK-168 toString บอกแค่ชนิด ข้อความ error ไม่มีเลขที่ส่งมา log จึงไม่มีเลขหลุด")
    void theNumberNeverShowsUpInTextMeantForLogs() {
        assertThat(PromptPayId.parse("0812345678")).hasToString("PromptPayId[MOBILE]");
        assertThat(PromptPayId.parse("1234567890123")).hasToString("PromptPayId[NATIONAL_ID]");
        assertThatThrownBy(() -> PromptPayId.parse("08123456789"))
                .message().doesNotContain("0812345678");
    }

    @Test
    @DisplayName("SSK-168 เลขเดียวกันที่เขียนต่างกันเท่ากัน")
    void theSameNumberWrittenDifferentlyIsEqual() {
        assertThat(PromptPayId.parse("081-234-5678"))
                .isEqualTo(PromptPayId.parse("0812345678"))
                .hasSameHashCodeAs(PromptPayId.parse("0812345678"))
                .isNotEqualTo(PromptPayId.parse("0812345679"));
    }
}
