package com.sakurasoul.apartment.apartmentconfig;

import com.sakurasoul.apartment.TestcontainersConfiguration;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIf;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.transaction.annotation.Transactional;
import org.testcontainers.DockerClientFactory;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * constraint ของบัญชีรับเงินใน V22 (SSK-168) เป็นด่านสุดท้ายหลัง BankAccountRules
 * <p>
 * เขียนลงตารางตรง ๆ ด้วย SQL แล้วดูว่าฐานข้อมูลปฏิเสธด้วย constraint ที่ถูกตัว และข้อความ error
 * ไม่มีเลขบัญชีหรือ PromptPay (logServerErrorDetail=false ตัดบรรทัด "Failing row contains" ของ PostgreSQL ทิ้ง
 * ซึ่งหลัง V22 แถวนี้มีเลขบัญชีอยู่ด้วย) ทุกเทส rollback เอง
 */
@SpringBootTest
@Import(TestcontainersConfiguration.class)
@EnabledIf("dockerAvailable")
@Transactional
class BankAccountConstraintTest {

    private static final String ACCOUNT_NUMBER = "7390015528";
    private static final String PROMPT_PAY = "0917300155";

    @Autowired
    private JdbcClient jdbcClient;

    static boolean dockerAvailable() {
        return DockerClientFactory.instance().isDockerAvailable();
    }

    @ParameterizedTest(name = "{4}")
    @CsvSource(nullValues = "null", value = {
        "Kasikornbank, null, 7390015528, null, apartment_config_bank_all_or_none_ck",
        "' ', Sakura Soul Apartment, 7390015528, null, apartment_config_bank_not_blank_ck",
        "Kasikornbank, Sakura Soul Apartment, 739001552, null, apartment_config_bank_account_number_ck",
        "Kasikornbank, Sakura Soul Apartment, 7390015528x, null, apartment_config_bank_account_number_ck",
        "null, null, null, 0917300155, apartment_config_prompt_pay_needs_bank_ck",
        "Kasikornbank, Sakura Soul Apartment, 7390015528, 091-730-0155, apartment_config_prompt_pay_id_ck"
    })
    @DisplayName("SSK-168 ฐานข้อมูลปฏิเสธบัญชีที่กฎปฏิเสธ ด้วย constraint ที่ถูกตัว และข้อความไม่มีเลขบัญชีหรือ PromptPay")
    void theDatabaseRejectsWhatTheRulesReject(String bankName, String accountName, String accountNumber,
            String promptPayId, String constraint) {
        assertThatThrownBy(() -> setBankAccount(bankName, accountName, accountNumber, promptPayId))
                .isInstanceOf(DataIntegrityViolationException.class)
                .satisfies(error -> assertThat(fullMessage(error))
                        .contains(constraint)
                        .doesNotContain(ACCOUNT_NUMBER, "739001552", PROMPT_PAY, "091-730-0155"));
    }

    @Test
    @DisplayName("SSK-168 constraint อื่นของแถวที่มีบัญชีอยู่แล้วพัง ข้อความก็ไม่มีเลขบัญชีจากทั้งแถว")
    void anUnrelatedFailureOnTheRowDoesNotPrintTheAccount() {
        setBankAccount("Kasikornbank", "Sakura Soul Apartment", ACCOUNT_NUMBER, PROMPT_PAY);

        assertThatThrownBy(() -> jdbcClient.sql(
                        "UPDATE apartment_config SET late_interest_percent_per_month = 101 WHERE id = 1").update())
                .isInstanceOf(DataIntegrityViolationException.class)
                .satisfies(error -> assertThat(fullMessage(error))
                        .contains("apartment_config_late_interest_ck")
                        .doesNotContain(ACCOUNT_NUMBER, PROMPT_PAY));
    }

    private void setBankAccount(String bankName, String accountName, String accountNumber, String promptPayId) {
        jdbcClient.sql("""
                        UPDATE apartment_config
                        SET bank_name = :bankName, bank_account_name = :accountName,
                            bank_account_number = :accountNumber, bank_prompt_pay_id = :promptPayId
                        WHERE id = 1""")
                .param("bankName", bankName)
                .param("accountName", accountName)
                .param("accountNumber", accountNumber)
                .param("promptPayId", promptPayId)
                .update();
    }

    private static String fullMessage(Throwable error) {
        StringBuilder all = new StringBuilder();
        for (Throwable t = error; t != null; t = t.getCause()) {
            all.append(t.getMessage()).append('\n');
        }
        return all.toString();
    }
}
