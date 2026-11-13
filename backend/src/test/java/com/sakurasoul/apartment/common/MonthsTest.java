package com.sakurasoul.apartment.common;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;

import java.time.LocalDate;
import java.time.YearMonth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** รูปแบบเดือน "YYYY-MM" ต้องตัดสินเหมือน MONTH_PATTERN ฝั่งหน้าเว็บทุกกรณี */
class MonthsTest {

    private static final String MESSAGE = "The month must be YYYY-MM";

    @Test
    @DisplayName("YYYY-MM ที่ถูกได้เดือนนั้น ช่องว่างหัวท้ายถูกตัดทิ้ง")
    void parsesValidMonths() {
        assertThat(Months.parse("2026-11", MESSAGE)).isEqualTo(YearMonth.of(2026, 11));
        assertThat(Months.parse(" 2027-01 ", MESSAGE)).isEqualTo(YearMonth.of(2027, 1));
    }

    @ParameterizedTest(name = "\"{0}\"")
    @NullAndEmptySource
    @ValueSource(strings = {"2026-1", "2026-13", "2026-00", "+2026-01", "26-11", "2026/11", "2026-11-01", "Nov 2026"})
    @DisplayName("รูปแบบอื่นทั้งหมดได้ข้อความที่ผู้เรียกส่งมา รวมปีที่มีเครื่องหมายซึ่ง YearMonth.parse ยอมรับ")
    void rejectsEverythingElseWithTheCallersMessage(String text) {
        assertThatThrownBy(() -> Months.parse(text, MESSAGE))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage(MESSAGE);
    }

    @Test
    @DisplayName("วันที่ใดก็ได้ในเดือนแปลงกลับเป็น YYYY-MM สองหลักเสมอ")
    void formatsTheMonthOfADate() {
        assertThat(Months.format(LocalDate.of(2026, 11, 1))).isEqualTo("2026-11");
        assertThat(Months.format(LocalDate.of(2027, 1, 31))).isEqualTo("2027-01");
    }
}
