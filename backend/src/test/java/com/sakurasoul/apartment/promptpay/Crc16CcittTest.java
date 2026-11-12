package com.sakurasoul.apartment.promptpay;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/** CRC ของ payload PromptPay (SSK-168) ใช้ค่าตรวจมาตรฐานของ CRC-16/CCITT-FALSE */
class Crc16CcittTest {

    @Test
    @DisplayName("SSK-168 ค่าตรวจมาตรฐานของ \"123456789\" คือ 29B1 (XMODEM ได้ 31C3 ส่วน KERMIT ได้ 2189)")
    void theStandardCheckValueIs29B1() {
        assertThat(Crc16Ccitt.of("123456789")).isEqualTo(0x29B1);
        assertThat(Crc16Ccitt.hex("123456789")).isEqualTo("29B1");
    }

    @Test
    @DisplayName("SSK-168 ข้อความว่างได้ค่าเริ่ม FFFF")
    void anEmptyTextKeepsTheInitialValue() {
        assertThat(Crc16Ccitt.of("")).isEqualTo(0xFFFF);
    }

    @Test
    @DisplayName("SSK-168 CRC ที่ขึ้นต้นด้วยศูนย์ยังได้สี่หลัก (payload ยอด 1.00 ได้ 03CF)")
    void theHexIsPaddedToFourDigits() {
        String withoutCrc = "00020101021229370016A00000067701011101130066812345678530376454041.005802TH6304";

        assertThat(Crc16Ccitt.hex(withoutCrc)).isEqualTo("03CF");
    }
}
