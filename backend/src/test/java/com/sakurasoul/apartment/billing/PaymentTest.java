package com.sakurasoul.apartment.billing;

import com.sakurasoul.apartment.common.ConflictException;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** การชำระหนึ่งก้อน (SSK-163) ใช้การชำระ 31 ของตัวอย่างในสัญญา บันทึก 2026-12-01T03:12:44.120Z ดู ContractExample */
class PaymentTest {

    @Test
    @DisplayName("SSK-163 ยกเลิกด้วยเวลาก่อนเวลาที่บันทึก (นาฬิกาของอีก pod ช้ากว่า) ได้เวลาที่บันทึกแทน ไม่ชน payment_voided_ck")
    void aVoidNeverPrecedesTheRecording() {
        Payment payment = new ContractExample().onNovember;

        payment.voidAt(Instant.parse("2026-12-01T03:12:44.100Z"));

        assertThat(payment.getVoidedAt()).isEqualTo(payment.getRecordedAt());
    }

    @Test
    @DisplayName("SSK-163 ยกเลิกตามเวลาที่ส่งมา ตัดเหลือมิลลิวินาที และยกเลิกซ้ำได้ 409 โดยเวลาเดิมไม่ถูกเขียนทับ")
    void aVoidKeepsItsFirstTime() {
        Payment payment = new ContractExample().onNovember;

        payment.voidAt(Instant.parse("2026-12-02T03:00:00.123456Z"));

        assertThat(payment.getVoidedAt()).isEqualTo(Instant.parse("2026-12-02T03:00:00.123Z"));
        assertThatThrownBy(() -> payment.voidAt(Instant.parse("2026-12-03T03:00:00Z")))
                .isInstanceOf(ConflictException.class)
                .hasMessage("This payment has already been voided");
        assertThat(payment.getVoidedAt()).isEqualTo(Instant.parse("2026-12-02T03:00:00.123Z"));
    }

    @Test
    @DisplayName("SSK-163 รู้ว่าเงินก้อนนี้ถูกตัดเข้าใบไหน ใช้หาการชำระที่ทำให้ใบครบ")
    void aPaymentKnowsWhichReceiptsItSettled() {
        Payment payment = new ContractExample().onNovember;

        assertThat(payment.allocatesTo(11L)).isTrue();
        assertThat(payment.allocatesTo(12L)).isFalse();
    }
}
