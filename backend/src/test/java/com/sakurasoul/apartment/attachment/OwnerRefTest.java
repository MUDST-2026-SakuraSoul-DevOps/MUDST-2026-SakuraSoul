package com.sakurasoul.apartment.attachment;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class OwnerRefTest {

    @Test
    @DisplayName("SSK-161 เจ้าของสี่ชนิดตามสัญญา id เป็นจำนวนเต็มบวก")
    void parsesOwners() {
        assertThat(OwnerRef.parse("LEASE", "4")).isEqualTo(new OwnerRef(OwnerType.LEASE, 4));
        assertThat(OwnerRef.parse(" MAINTENANCE_TICKET ", " 41 ")).isEqualTo(new OwnerRef(OwnerType.MAINTENANCE_TICKET, 41));
        assertThat(OwnerRef.parse("RECEIPT", "12").type()).isEqualTo(OwnerType.RECEIPT);
        assertThat(OwnerRef.parse("PAYMENT", "31").type()).isEqualTo(OwnerType.PAYMENT);
    }

    @Test
    @DisplayName("SSK-161 ชนิดที่ไม่รู้จัก ตัวพิมพ์ผิด ไม่ส่ง หรือ id ที่ไม่ใช่จำนวนเต็มบวก ได้ข้อความเดียวกัน")
    void everythingElseIsTheSameMessage() {
        String[][] cases = {
                {null, "1"}, {"", "1"}, {"lease", "1"}, {"ROOM", "1"}, {"LEASE", null}, {"LEASE", ""},
                {"LEASE", "abc"}, {"LEASE", "0"}, {"LEASE", "-3"}, {"LEASE", "1.5"}, {"LEASE", "99999999999999999999"}};
        for (String[] input : cases) {
            assertThatThrownBy(() -> OwnerRef.parse(input[0], input[1]))
                    .as("%s %s", input[0], input[1])
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessage("Choose what this file belongs to");
        }
    }

    @Test
    @DisplayName("SSK-161 คำในข้อความ 404 ของแต่ละชนิด")
    void labels() {
        assertThat(OwnerType.MAINTENANCE_TICKET.label()).isEqualTo("maintenance ticket");
        assertThat(OwnerType.LEASE.label()).isEqualTo("lease");
    }
}
