package com.sakurasoul.apartment.billing;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/** ใบหนึ่งใบควรบอกผู้เช่าว่าอะไร ดูจากยอด ไม่ใช่จาก status (SSK-163, SSK-164) ตัวอย่างจาก ContractExample */
class ReceiptStandingTest {

    @Test
    @DisplayName("SSK-164 ใบล่าสุดที่ยังมียอดต้องจ่ายเป็นใบต้องจ่าย ใบเก่าที่ยังค้างเป็นใบที่ถูกยกยอด")
    void owedMoneyIsDueOnTheLatestBillAndCarriedOnOlderOnes() {
        ContractExample example = new ContractExample();
        example.voidPaymentOnNovember();

        assertThat(ReceiptStanding.of(example.responseOf(example.november))).isEqualTo(ReceiptStanding.DUE);
        assertThat(ReceiptStanding.of(example.responseOf(example.october))).isEqualTo(ReceiptStanding.CARRIED);
    }

    @Test
    @DisplayName("SSK-163 ใบเก่าที่ถูกตัดครบจากเงินบนบิลอื่นไม่มีอะไรต้องจ่าย แม้บิลล่าสุดยังค้าง")
    void anOlderReceiptPaidThroughALaterBillIsSettled() {
        ContractExample example = new ContractExample();

        assertThat(ReceiptStanding.of(example.responseOf(example.october))).isEqualTo(ReceiptStanding.SETTLED);
        assertThat(ReceiptStanding.of(example.responseOf(example.november))).isEqualTo(ReceiptStanding.DUE);
    }

    /** ใบ พ.ย. มีสถานะ PAID ได้ตั้งแต่ค่าใช้จ่ายของมันถูกตัดครบ แต่ยอดยกมายังค้าง ผู้เช่าต้องได้แม่แบบต้องจ่าย */
    @Test
    @DisplayName("SSK-164 ใบล่าสุดที่ค่าใช้จ่ายของตัวเองครบแล้วแต่ยังมียอดยกมาค้าง ยังเป็นใบต้องจ่าย")
    void theLatestBillStaysDueWhileItsCarryIsUnpaid() {
        ContractExample example = new ContractExample();
        example.voidPaymentOnNovember();
        example.november.applySettlement(example.november.ownAmount(), example.onNovember.getVoidedAt(), "Cash");

        assertThat(example.november.getStatus()).isEqualTo(ReceiptStatus.PAID);
        assertThat(ReceiptStanding.of(example.responseOf(example.november))).isEqualTo(ReceiptStanding.DUE);
    }
}
