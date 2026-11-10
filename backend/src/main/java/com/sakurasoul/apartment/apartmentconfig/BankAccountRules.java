package com.sakurasoul.apartment.apartmentconfig;

import com.sakurasoul.apartment.apartmentconfig.ApartmentConfigDtos.BankAccountRequest;
import com.sakurasoul.apartment.common.Whitespace;
import com.sakurasoul.apartment.promptpay.PromptPayId;

import java.util.regex.Pattern;

/**
 * ตรวจบัญชีรับเงินก่อนบันทึก (SSK-168) ข้อความตามตาราง error ใน docs/api-contract-payments-phase2.md
 * <p>
 * ทุกช่องตัดช่องว่างหัวท้ายแบบเดียวกับหน้าเว็บก่อนตรวจ ช่องที่เป็น null หรือว่างหลังตัดถือว่าไม่ได้ส่ง
 * ไม่ส่งมาเลยทั้งสี่ช่องคือเลิกแสดงบัญชีบนใบใหม่ ไม่ใช่ค่าผิด
 * <p>
 * ข้อความทุกตัวเป็นค่าคงที่ ไม่มีส่วนไหนของค่าที่ส่งมา เลขบัญชีกับ PromptPay ID จึงไม่หลุดไปใน response หรือ log
 * ฐานข้อมูลกันอีกชั้นด้วย constraint ของ V22
 */
final class BankAccountRules {

    static final String TOGETHER_MESSAGE = "Please fill in the bank name, account name and account number together";
    static final String BANK_FIRST_MESSAGE = "Please fill in the bank account before the PromptPay ID";
    static final String LINE_BREAK_MESSAGE = "Bank name and account name must be on one line";
    static final String BANK_NAME_LENGTH_MESSAGE = "Bank name must be 100 characters or fewer";
    static final String ACCOUNT_NAME_LENGTH_MESSAGE = "Account name must be 100 characters or fewer";
    static final String ACCOUNT_NUMBER_MESSAGE = "Account number must contain 10 to 15 digits";

    /** ตามความยาวคอลัมน์ของ V22 */
    private static final int MAX_NAME_LENGTH = 100;
    private static final int MAX_ACCOUNT_NUMBER_LENGTH = 30;

    private static final Pattern ACCOUNT_NUMBER_CHARACTERS = Pattern.compile("[0-9 -]+");
    private static final int MIN_ACCOUNT_DIGITS = 10;
    private static final int MAX_ACCOUNT_DIGITS = 15;

    private BankAccountRules() {
    }

    /** คืนข้อความของกฎแรกที่ไม่ผ่าน หรือ null เมื่อถูกทั้งหมด (รวมกรณีว่างทั้งสี่ช่อง) */
    static String validate(BankAccountRequest request) {
        String bankName = present(request.bankName());
        String accountName = present(request.accountName());
        String accountNumber = present(request.accountNumber());
        String promptPayId = present(request.promptPayId());

        int bankFields = count(bankName) + count(accountName) + count(accountNumber);
        if (bankFields == 0) {
            return promptPayId == null ? null : BANK_FIRST_MESSAGE;
        }
        if (bankFields < 3) {
            return TOGETHER_MESSAGE;
        }
        // ทั้งสองชื่อถูกพิมพ์ลงอีเมลแบบข้อความธรรมดา ตัวขึ้นบรรทัดในชื่อจะปลอมบรรทัดอื่นของอีเมลได้
        if (breaksTheLine(bankName) || breaksTheLine(accountName)) {
            return LINE_BREAK_MESSAGE;
        }
        if (length(bankName) > MAX_NAME_LENGTH) {
            return BANK_NAME_LENGTH_MESSAGE;
        }
        if (length(accountName) > MAX_NAME_LENGTH) {
            return ACCOUNT_NAME_LENGTH_MESSAGE;
        }
        if (!isAccountNumber(accountNumber)) {
            return ACCOUNT_NUMBER_MESSAGE;
        }
        if (promptPayId != null) {
            try {
                PromptPayId.parse(promptPayId);
            } catch (IllegalArgumentException invalid) {
                return PromptPayId.INVALID_MESSAGE;
            }
        }
        return null;
    }

    /** เรียกหลัง {@link #validate} คืน null แล้วเท่านั้น คืน null เมื่อว่างทั้งสี่ช่อง คือเลิกแสดงบัญชี */
    static BankAccount toBankAccount(BankAccountRequest request) {
        String bankName = present(request.bankName());
        if (bankName == null) {
            return null;
        }
        String promptPayId = present(request.promptPayId());
        return BankAccount.of(bankName, present(request.accountName()), present(request.accountNumber()),
                promptPayId == null ? null : PromptPayId.parse(promptPayId));
    }

    private static String present(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = Whitespace.trim(value);
        return trimmed.isEmpty() ? null : trimmed;
    }

    private static int count(String value) {
        return value == null ? 0 : 1;
    }

    /** ตัวควบคุมทุกตัว (รวม LF, CR, TAB) และตัวขึ้นบรรทัดของ Unicode (U+2028, U+2029) */
    private static boolean breaksTheLine(String value) {
        return value.codePoints().anyMatch(c -> Character.isISOControl(c)
                || Character.getType(c) == Character.LINE_SEPARATOR
                || Character.getType(c) == Character.PARAGRAPH_SEPARATOR);
    }

    /** นับเป็นตัวอักษรแบบที่ VARCHAR ของ PostgreSQL นับ ไม่ใช่หน่วย UTF-16 */
    private static int length(String value) {
        return value.codePointCount(0, value.length());
    }

    private static boolean isAccountNumber(String value) {
        if (value.length() > MAX_ACCOUNT_NUMBER_LENGTH || !ACCOUNT_NUMBER_CHARACTERS.matcher(value).matches()) {
            return false;
        }
        long digits = value.chars().filter(c -> c >= '0' && c <= '9').count();
        return digits >= MIN_ACCOUNT_DIGITS && digits <= MAX_ACCOUNT_DIGITS;
    }
}
