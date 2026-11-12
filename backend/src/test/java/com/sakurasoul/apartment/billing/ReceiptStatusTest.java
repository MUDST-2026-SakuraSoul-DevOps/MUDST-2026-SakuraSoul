package com.sakurasoul.apartment.billing;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** ตัวกรอง status ของ GET /api/receipts (SSK-163) ข้อความ 400 ตามตาราง error ในสัญญา API */
class ReceiptStatusTest {

    @Test
    @DisplayName("ไม่ส่งหรือส่งว่างคือไม่กรอง")
    void anEmptyFilterMeansEveryStatus() {
        assertThat(ReceiptStatus.parseFilter(null)).isNull();
        assertThat(ReceiptStatus.parseFilter(" ")).isNull();
    }

    @Test
    @DisplayName("SSK-163 กรองใบที่จ่ายบางส่วนได้ ช่องว่างหัวท้ายถูกตัดแบบที่ Spring ทำกับ enum")
    void partialIsAFilter() {
        assertThat(ReceiptStatus.parseFilter("PARTIAL")).isEqualTo(ReceiptStatus.PARTIAL);
        assertThat(ReceiptStatus.parseFilter(" PAID ")).isEqualTo(ReceiptStatus.PAID);
    }

    @ParameterizedTest(name = "{0}")
    @ValueSource(strings = {"paid", "OVERDUE", "1"})
    @DisplayName("SSK-163 ค่าที่ไม่รู้จักได้ข้อความในสัญญา ไม่ใช่ข้อความของ framework")
    void anUnknownStatusIsRejectedWithTheContractMessage(String status) {
        assertThatThrownBy(() -> ReceiptStatus.parseFilter(status))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("status must be PENDING, PARTIAL or PAID");
    }
}
