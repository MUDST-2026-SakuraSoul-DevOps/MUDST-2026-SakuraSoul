package com.sakurasoul.apartment.apartmentconfig;

import com.fasterxml.jackson.annotation.JsonFormat;
import com.sakurasoul.apartment.promptpay.PromptPayId;

import java.math.BigDecimal;
import java.time.Instant;

/**
 * รูปร่าง request กับ response ของอัตราค่าสาธารณูปโภค ตกลงไว้ใน docs/api-contract-lease.md
 * <p>
 * ไม่ได้ใส่ annotation ของ bean validation ไว้ที่ request ทั้งที่ปกติโปรเจกต์นี้ใส่
 * เพราะ handler ของ MethodArgumentNotValidException เอาข้อความไปใส่ที่ property ชื่อ
 * fields แล้วตั้ง detail เป็นข้อความกลาง ๆ ว่า "The information you sent is not valid"
 * แต่หน้าเว็บอ่านข้อความจาก detail ไปโชว์ใต้ฟอร์มตรง ๆ และสัญญา API กำหนดว่าต้องได้
 * ข้อความที่บอกชื่อช่องที่ผิด การตรวจจึงไปอยู่ที่ ApartmentConfigRules แล้วโยน
 * IllegalArgumentException ซึ่ง handler แปลงเป็น 400 พร้อมข้อความเต็มใน detail
 */
public final class ApartmentConfigDtos {

    private ApartmentConfigDtos() {
    }

    /** ไม่รับ updatedAt เพราะ server เป็นคนใส่เองตอนบันทึก */
    public record ApartmentConfigRequest(
            BigDecimal electricRatePerUnit,
            BigDecimal waterRatePerUnit,
            BigDecimal commonAreaFee,
            BigDecimal internetFee) {
    }

    /**
     * ดอกเบี้ยค้างชำระกับวันผ่อนผัน (SSK-164) ส่งที่ PUT /api/apartment-config/late-interest
     * <p>
     * graceDays ประกาศเป็น BigDecimal ไม่ใช่ int เพราะ Jackson จะแปลง 1.5 เป็น int ด้วยการตัดทศนิยมทิ้ง
     * หรือตอบข้อความของมันเอง แล้วแต่การตั้งค่า แบบนี้ LateInterestRules ได้เห็นค่าจริงแล้วตอบข้อความตามสัญญา
     */
    public record LateInterestRequest(
            BigDecimal lateInterestPercentPerMonth,
            BigDecimal graceDays) {
    }

    /**
     * บัญชีรับเงิน (SSK-168) ส่งที่ PUT /api/apartment-config/bank-account ว่างทั้งสี่ช่องคือเลิกแสดงบัญชีบนใบใหม่
     * <p>
     * ทุกช่องเป็นข้อความ เลขบัญชีกับ PromptPay ID จึงไม่ผ่านการแปลงของ Jackson ที่อาจยกค่าที่ส่งมาไปใส่ในข้อความ error
     * toString ไม่พิมพ์ค่า เพราะเลขบัญชีกับ PromptPay ID เป็นข้อมูลส่วนตัวของเจ้าของหอ
     */
    public record BankAccountRequest(
            String bankName,
            String accountName,
            String accountNumber,
            String promptPayId) {

        @Override
        public String toString() {
            return "BankAccountRequest[hidden]";
        }
    }

    /**
     * บัญชีรับเงินในคำตอบ ใช้ทั้งค่าตั้ง (bank ของ GET /api/apartment-config) และสำเนาในใบเสร็จ (bank ของ ReceiptResponse)
     * รูปเดียวกันทั้งสองที่ หน้าเว็บจึงใช้ type เดียวได้ promptPayId เป็นตัวเลขล้วน null คือไม่มี PromptPay
     */
    public record BankAccountResponse(
            String bankName,
            String accountName,
            String accountNumber,
            String promptPayId) {

        /** null เข้า null ออก คือยังไม่ได้ตั้งบัญชี หรือใบเสร็จไม่มีสำเนาบัญชี */
        public static BankAccountResponse of(BankAccount accountOrNull) {
            if (accountOrNull == null) {
                return null;
            }
            PromptPayId promptPayId = accountOrNull.promptPayId();
            return new BankAccountResponse(accountOrNull.getBankName(), accountOrNull.getAccountName(),
                    accountOrNull.getAccountNumber(), promptPayId == null ? null : promptPayId.digits());
        }

        @Override
        public String toString() {
            return "BankAccountResponse[hidden]";
        }
    }

    public record ApartmentConfigResponse(
            BigDecimal electricRatePerUnit,
            BigDecimal waterRatePerUnit,
            BigDecimal commonAreaFee,
            BigDecimal internetFee,
            /* ค่าที่สัญญาใหม่จะคัดลอกไปตอนเซ็น (SSK-164) 0 คือไม่คิดดอกเบี้ย */
            BigDecimal lateInterestPercentPerMonth,
            int graceDays,
            /* บัญชีที่ใบเสร็จใหม่จะคัดลอกไปตอนออก (SSK-168) null คือยังไม่ได้ตั้ง */
            BankAccountResponse bank,

            /*
             * บังคับรูปแบบให้เป็น ISO-8601 โซน UTC ละเอียดระดับมิลลิวินาที ความยาวคงที่
             * เช่น 2026-09-11T03:12:45.123Z ที่ต้องล็อกความยาวเพราะหน้าเว็บเทียบ
             * updatedAt สองครั้งด้วยเครื่องหมาย > บนสตริงตรง ๆ
             * (frontend/src/api/client.test.ts) ถ้าปล่อยให้ Jackson ตัดศูนย์ท้ายทิ้ง
             * ตามใจ ความยาวจะไม่เท่ากันแล้วการเทียบแบบ lexicographic จะให้ผลผิด
             */
            @JsonFormat(shape = JsonFormat.Shape.STRING,
                    pattern = "yyyy-MM-dd'T'HH:mm:ss.SSSX", timezone = "UTC")
            Instant updatedAt) {

        public static ApartmentConfigResponse of(ApartmentConfig config) {
            return new ApartmentConfigResponse(config.getElectricRatePerUnit(),
                    config.getWaterRatePerUnit(), config.getCommonAreaFee(),
                    config.getInternetFee(), config.getLateInterestPercentPerMonth(),
                    config.getGraceDays(), BankAccountResponse.of(config.getBankAccount()), config.getUpdatedAt());
        }
    }
}
