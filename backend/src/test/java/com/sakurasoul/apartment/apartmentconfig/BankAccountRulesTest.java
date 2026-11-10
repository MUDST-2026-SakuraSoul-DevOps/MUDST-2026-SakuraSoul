package com.sakurasoul.apartment.apartmentconfig;

import com.sakurasoul.apartment.apartmentconfig.ApartmentConfigDtos.BankAccountRequest;
import com.sakurasoul.apartment.promptpay.PromptPayId;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * กฎของบัญชีรับเงิน (SSK-168) ข้อความตามตาราง error ใน docs/api-contract-payments-phase2.md
 * ลำดับการตรวจ ค่าขอบ และการที่ข้อความไม่มีค่าที่ส่งมา
 */
class BankAccountRulesTest {

    private static final String BANK = "Kasikornbank";
    private static final String NAME = "Sakura Soul Apartment";
    private static final String NUMBER = "012-3-45678-9";
    private static final String PROMPT_PAY = "081-234-5678";

    @Test
    @DisplayName("SSK-168 บัญชีครบสามช่องพร้อม PromptPay ผ่าน เลขบัญชีเก็บตามที่กรอก PromptPay เก็บเป็นตัวเลขล้วน")
    void aFullAccountWithPromptPayIsAccepted() {
        BankAccountRequest request = new BankAccountRequest(BANK, NAME, NUMBER, PROMPT_PAY);

        assertThat(BankAccountRules.validate(request)).isNull();
        BankAccount account = BankAccountRules.toBankAccount(request);
        assertThat(account.getBankName()).isEqualTo(BANK);
        assertThat(account.getAccountName()).isEqualTo(NAME);
        assertThat(account.getAccountNumber()).isEqualTo("012-3-45678-9");
        assertThat(account.promptPayId()).isEqualTo(PromptPayId.parse("0812345678"));
    }

    @Test
    @DisplayName("SSK-168 บัญชีที่ไม่มี PromptPay ผ่าน ใบเสร็จจะมีบล็อกบัญชีแต่ไม่มี QR")
    void anAccountWithoutPromptPayIsAccepted() {
        BankAccountRequest request = new BankAccountRequest(BANK, NAME, NUMBER, null);

        assertThat(BankAccountRules.validate(request)).isNull();
        assertThat(BankAccountRules.toBankAccount(request).promptPayId()).isNull();
    }

    @ParameterizedTest(name = "\"{0}\"")
    @ValueSource(strings = {"", "   ", "\u00a0"})
    @DisplayName("SSK-168 ว่างทั้งสี่ช่อง (null ว่าง หรือช่องว่างล้วน) ผ่าน คือเลิกแสดงบัญชีบนใบใหม่")
    void allFieldsBlankClearsTheAccount(String blank) {
        assertThat(BankAccountRules.validate(new BankAccountRequest(null, null, null, null))).isNull();
        BankAccountRequest request = new BankAccountRequest(blank, blank, blank, blank);

        assertThat(BankAccountRules.validate(request)).isNull();
        assertThat(BankAccountRules.toBankAccount(request)).isNull();
    }

    @Test
    @DisplayName("SSK-168 ช่องว่างหัวท้าย (รวม NBSP ที่ติดมาจากการก๊อป) ถูกตัดก่อนเก็บ")
    void surroundingWhitespaceIsTrimmed() {
        BankAccountRequest request = new BankAccountRequest(" Kasikornbank\u00a0", "\u00a0Sakura Soul Apartment ",
                " 012-3-45678-9 ", " 0812345678 ");

        assertThat(BankAccountRules.validate(request)).isNull();
        BankAccount account = BankAccountRules.toBankAccount(request);
        assertThat(account).isEqualTo(BankAccount.of(BANK, NAME, NUMBER, PromptPayId.parse("0812345678")));
    }

    @ParameterizedTest(name = "{0} | {1} | {2}")
    @CsvSource(nullValues = "null", value = {
        "Kasikornbank, null, null",
        "null, Sakura Soul Apartment, null",
        "null, null, 012-3-45678-9",
        "Kasikornbank, Sakura Soul Apartment, null",
        "Kasikornbank, null, 012-3-45678-9",
        "null, Sakura Soul Apartment, 012-3-45678-9"
    })
    @DisplayName("SSK-168 ส่งบัญชีมาหนึ่งหรือสองช่องไม่ผ่าน ต้องครบสามช่อง")
    void aPartialAccountIsRejected(String bankName, String accountName, String accountNumber) {
        assertThat(BankAccountRules.validate(new BankAccountRequest(bankName, accountName, accountNumber, null)))
                .isEqualTo("Please fill in the bank name, account name and account number together");
    }

    @Test
    @DisplayName("SSK-168 PromptPay ที่ไม่มีบัญชีเลยไม่ผ่าน แต่ถ้ามีบัญชีบางช่องได้ข้อความให้กรอกบัญชีให้ครบก่อน")
    void aPromptPayIdNeedsTheAccountFirst() {
        assertThat(BankAccountRules.validate(new BankAccountRequest(null, " ", "", PROMPT_PAY)))
                .isEqualTo("Please fill in the bank account before the PromptPay ID");
        assertThat(BankAccountRules.validate(new BankAccountRequest(BANK, null, null, PROMPT_PAY)))
                .isEqualTo(BankAccountRules.TOGETHER_MESSAGE);
    }

    /**
     * ตัวขึ้นบรรทัดปลอมบรรทัดในอีเมลได้ ส่วน U+FFFF U+FFFE กับ surrogate ที่ไม่มีคู่ทำให้ PDF ของทุกใบที่คัดลอกชื่อนี้ไปพังถาวร
     * (ลองบน docker compose แล้ว PDF กับการส่งอีเมลของใบนั้นได้ 500)
     */
    @ParameterizedTest(name = "{0}")
    @ValueSource(strings = {"Kasikorn\nbank", "Kasikorn\rbank", "Kasikorn\tbank", "Kasikorn\u2028bank",
        "Kasikorn\uffffbank", "Kasikorn\ufffebank", "Kasikorn\ud800bank"})
    @DisplayName("SSK-168 ชื่อธนาคารหรือชื่อบัญชีที่มีตัวขึ้นบรรทัดหรือตัวที่พิมพ์ลง PDF ไม่ได้ไม่ผ่าน")
    void aNameThatIsNotOnePrintableLineIsRejected(String name) {
        assertThat(BankAccountRules.validate(new BankAccountRequest(name, NAME, NUMBER, null)))
                .isEqualTo("Bank name and account name must be one line of printable text");
        assertThat(BankAccountRules.validate(new BankAccountRequest(BANK, name, NUMBER, null)))
                .isEqualTo(BankAccountRules.PRINTABLE_MESSAGE);
    }

    @Test
    @DisplayName("SSK-168 ชื่อภาษาไทยกับอีโมจิ (surrogate ที่ครบคู่) ผ่าน")
    void thaiNamesAndCompleteSurrogatePairsAreAccepted() {
        assertThat(BankAccountRules.validate(new BankAccountRequest("ธนาคารกสิกรไทย",
                "หอพักซากุระ \ud83c\udf38", NUMBER, null))).isNull();
    }

    @Test
    @DisplayName("SSK-168 ชื่อยาวได้ 100 ตัวอักษร (นับตัวอักษรไทยทีละตัว) เกินไม่ผ่าน")
    void namesAreLimitedToOneHundredCharacters() {
        String hundred = "ก".repeat(100);
        String tooLong = "ก".repeat(101);

        assertThat(BankAccountRules.validate(new BankAccountRequest(hundred, hundred, NUMBER, null))).isNull();
        assertThat(BankAccountRules.validate(new BankAccountRequest(tooLong, NAME, NUMBER, null)))
                .isEqualTo("Bank name must be 100 characters or fewer");
        assertThat(BankAccountRules.validate(new BankAccountRequest(BANK, tooLong, NUMBER, null)))
                .isEqualTo("Account name must be 100 characters or fewer");
    }

    @ParameterizedTest(name = "\"{0}\"")
    @ValueSource(strings = {"0123456789", "012-3-45678-9", "012 3 45678 9", "123456789012345", "1-2-3-4-5-6-7-8-9-0-1-2-3-4-5"})
    @DisplayName("SSK-168 เลขบัญชีตัวเลข 10 ถึง 15 หลัก คั่นด้วยขีดหรือเว้นวรรคได้ ยาวรวมไม่เกิน 30 ตัว")
    void anAccountNumberOfTenToFifteenDigitsIsAccepted(String number) {
        assertThat(BankAccountRules.validate(new BankAccountRequest(BANK, NAME, number, null))).isNull();
    }

    @ParameterizedTest(name = "\"{0}\"")
    @ValueSource(strings = {"123456789", "1234567890123456", "0123456789x", "012.345.6789", "012/3/45678/9",
        "0 1 2 3 4 5 6 7 8 9 - - - - - -"})
    @DisplayName("SSK-168 เลขบัญชีที่หลักไม่ถึง 10 เกิน 15 มีตัวอื่นปน หรือยาวเกิน 30 ตัวไม่ผ่าน")
    void anyOtherAccountNumberIsRejected(String number) {
        assertThat(BankAccountRules.validate(new BankAccountRequest(BANK, NAME, number, null)))
                .isEqualTo("Account number must contain 10 to 15 digits");
    }

    @ParameterizedTest(name = "\"{0}\"")
    @ValueSource(strings = {"812345678", "081 234 5678", "+66812345678", "08123456789"})
    @DisplayName("SSK-168 PromptPay ผิดรูปแบบได้ข้อความตามสัญญา")
    void aMalformedPromptPayIdIsRejected(String promptPayId) {
        assertThat(BankAccountRules.validate(new BankAccountRequest(BANK, NAME, NUMBER, promptPayId)))
                .isEqualTo("PromptPay ID must be a 10-digit phone number or a 13-digit ID");
    }

    @Test
    @DisplayName("SSK-168 ข้อความทุกตัวไม่มีค่าที่ส่งมา เลขบัญชีกับ PromptPay จึงไม่หลุดไปใน response หรือ log")
    void noMessageEchoesTheInput() {
        assertThat(BankAccountRules.validate(new BankAccountRequest(BANK, NAME, "7390015528x", null)))
                .doesNotContain("7390015528");
        assertThat(BankAccountRules.validate(new BankAccountRequest(BANK, NAME, NUMBER, "09173001559")))
                .doesNotContain("0917300155");
    }
}
