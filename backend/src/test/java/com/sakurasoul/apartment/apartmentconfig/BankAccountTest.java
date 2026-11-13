package com.sakurasoul.apartment.apartmentconfig;

import com.sakurasoul.apartment.apartmentconfig.ApartmentConfigDtos.BankAccountRequest;
import com.sakurasoul.apartment.apartmentconfig.ApartmentConfigDtos.BankAccountResponse;
import com.sakurasoul.apartment.promptpay.PromptPayId;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * บัญชีรับเงินหนึ่งชุดกับรูปของมันใน request และ response (SSK-168)
 * <p>
 * toString ทุกตัวต้องไม่พิมพ์เลขบัญชีหรือ PromptPay เพราะ Spring พิมพ์ body ด้วย toString ตอนเปิด log ระดับละเอียด
 * และ record ที่ toString ปกติจะพิมพ์ทุกช่อง เทสนี้เช็คตรง ๆ ไม่พึ่งว่า log จะตัดข้อความตรงไหน
 */
class BankAccountTest {

    private static final BankAccount ACCOUNT = BankAccount.of("Kasikornbank", "Sakura Soul Apartment",
            "739-0-01552-8", PromptPayId.parse("0917300155"));

    @Test
    @DisplayName("SSK-168 toString ของบัญชี request และ response ไม่พิมพ์ค่าใดเลย")
    void noToStringPrintsTheNumbers() {
        assertThat(ACCOUNT).hasToString("BankAccount[hidden]");
        assertThat(new BankAccountRequest("Kasikornbank", "Sakura Soul Apartment", "739-0-01552-8", "0917300155"))
                .hasToString("BankAccountRequest[hidden]");
        assertThat(BankAccountResponse.of(ACCOUNT)).hasToString("BankAccountResponse[hidden]");
    }

    @Test
    @DisplayName("SSK-168 response ของบัญชีตอบ PromptPay เป็นตัวเลขล้วน และ null เข้า null ออก")
    void theResponseCarriesTheDigitsAndNullMeansNoAccount() {
        assertThat(BankAccountResponse.of(ACCOUNT)).isEqualTo(new BankAccountResponse("Kasikornbank",
                "Sakura Soul Apartment", "739-0-01552-8", "0917300155"));
        assertThat(BankAccountResponse.of(BankAccount.of("Kasikornbank", "Sakura Soul Apartment", "739-0-01552-8", null))
                .promptPayId()).isNull();
        assertThat(BankAccountResponse.of(null)).isNull();
    }

    @Test
    @DisplayName("SSK-168 สำเนาเท่ากับต้นฉบับแต่เป็นคนละ object และบัญชีที่ไม่มีชื่อธนาคารถือว่ายังไม่ได้ตั้ง")
    void aCopyIsEqualButSeparateAndAnEmptyAccountIsNull() {
        assertThat(ACCOUNT.copy()).isEqualTo(ACCOUNT).isNotSameAs(ACCOUNT).hasSameHashCodeAs(ACCOUNT);
        assertThat(BankAccount.orNull(ACCOUNT)).isSameAs(ACCOUNT);
        assertThat(BankAccount.orNull(null)).isNull();
        assertThat(BankAccount.orNull(new BankAccount())).isNull();
    }
}
