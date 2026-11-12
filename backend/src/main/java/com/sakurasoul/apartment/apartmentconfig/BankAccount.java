package com.sakurasoul.apartment.apartmentconfig;

import com.sakurasoul.apartment.promptpay.PromptPayId;
import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;

import java.util.Objects;

/**
 * บัญชีรับเงินหนึ่งชุด (SSK-168) ใช้ทั้งค่าตั้งของตึก (apartment_config) และสำเนาในใบเสร็จ (receipt)
 * ชื่อคอลัมน์เหมือนกันทั้งสองตาราง ตั้งไว้ที่ V22
 * <p>
 * ไม่มี setter เปลี่ยนบัญชีคือแทนทั้งชุดด้วยค่าใหม่ และใบเสร็จได้สำเนาของตัวเองผ่าน {@link #copy()}
 * ไม่ใช้ instance เดียวกับค่าตั้ง
 * <p>
 * เลขบัญชีกับ PromptPay ID เป็นข้อมูลส่วนตัวของเจ้าของหอ toString จึงไม่พิมพ์ค่าใดเลย
 */
@Embeddable
public class BankAccount {

    @Column(name = "bank_name", length = 100)
    private String bankName;

    @Column(name = "bank_account_name", length = 100)
    private String accountName;

    /** ตามที่แอดมินกรอก มีขีดหรือเว้นวรรคได้ เพราะเป็นข้อความที่พิมพ์ให้ผู้เช่าอ่าน */
    @Column(name = "bank_account_number", length = 30)
    private String accountNumber;

    /** ตัวเลขล้วน null คือไม่มี PromptPay บัญชีแบบนี้แสดงบนใบได้แต่ไม่มี QR */
    @Column(name = "bank_prompt_pay_id", length = 13)
    private String promptPayId;

    protected BankAccount() {
    }

    private BankAccount(String bankName, String accountName, String accountNumber, String promptPayId) {
        this.bankName = bankName;
        this.accountName = accountName;
        this.accountNumber = accountNumber;
        this.promptPayId = promptPayId;
    }

    /** ผู้เรียกต้องตรวจค่าให้ผ่าน BankAccountRules มาก่อน ฐานข้อมูลกันอีกชั้นด้วย constraint ของ V22 */
    public static BankAccount of(String bankName, String accountName, String accountNumber,
            PromptPayId promptPayIdOrNull) {
        return new BankAccount(bankName, accountName, accountNumber,
                promptPayIdOrNull == null ? null : promptPayIdOrNull.digits());
    }

    /** สำเนาสำหรับใบเสร็จ Hibernate ไม่รองรับ embeddable ตัวเดียวกันในสอง entity */
    public BankAccount copy() {
        return new BankAccount(bankName, accountName, accountNumber, promptPayId);
    }

    public String getBankName() {
        return bankName;
    }

    public String getAccountName() {
        return accountName;
    }

    public String getAccountNumber() {
        return accountNumber;
    }

    /** null เมื่อบัญชีนี้ไม่มี PromptPay constraint ของ V22 รับประกันว่าค่าที่เก็บไว้ parse ผ่านเสมอ */
    public PromptPayId promptPayId() {
        return promptPayId == null ? null : PromptPayId.parse(promptPayId);
    }

    /**
     * ค่าของช่อง embedded ใน entity เป็น "ยังไม่ได้ตั้ง" (null) เมื่อไม่มีชื่อธนาคาร
     * <p>
     * Hibernate คืน embeddable ที่ทุกคอลัมน์เป็น NULL เป็น null อยู่แล้ว เช็คนี้กันกรณีที่ได้ object เปล่ามาแทน
     * ผู้เรียกจึงเช็คแค่ null ที่เดียว (all-or-none ของ V22 ทำให้ดูแค่ชื่อธนาคารก็พอ)
     */
    public static BankAccount orNull(BankAccount account) {
        return account == null || account.bankName == null ? null : account;
    }

    @Override
    public boolean equals(Object other) {
        return other instanceof BankAccount account
                && Objects.equals(bankName, account.bankName)
                && Objects.equals(accountName, account.accountName)
                && Objects.equals(accountNumber, account.accountNumber)
                && Objects.equals(promptPayId, account.promptPayId);
    }

    @Override
    public int hashCode() {
        return Objects.hash(bankName, accountName, accountNumber, promptPayId);
    }

    @Override
    public String toString() {
        return "BankAccount[hidden]";
    }
}
