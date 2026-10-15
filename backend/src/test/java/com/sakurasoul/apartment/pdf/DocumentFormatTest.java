package com.sakurasoul.apartment.pdf;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Locale;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * เทสของ DocumentFormat ซึ่งเป็นตัวตัดสินว่าเงินกับวันที่บนใบเสร็จและสัญญาจะหน้าตาอย่างไร
 * <p>
 * คลาสนี้ไม่เคยมีเทสเลยจนถึง SSK-126 ทั้งที่มันคุมตัวเลขบนเอกสารที่ใช้อ้างอิงทางกฎหมาย
 * ที่ผ่านมาถ้าใครแก้รูปแบบเงินผิด จะไม่มีอะไรจับได้ เพราะของที่ออกมาเป็น PDF ไม่ใช่สตริง
 * ที่เทสอ่านได้ตรง ๆ เทสชุดนี้จึงยิงที่ตัวฟอร์แมตเตอร์แทน
 * <p>
 * ทุกเคสเทียบสตริงเต็มด้วย isEqualTo ไม่ใช่ contains โดยตั้งใจ เพราะ feedback ของอาจารย์
 * ข้อ "ใส่เลขผิดแล้วเทสยังผ่าน" เกิดจากเทสที่เช็คแค่ว่ามีคำนั้นอยู่ ถ้าเช็คแบบนั้นที่นี่
 * เปลี่ยน ฿3,500.00 เป็น ฿3,500 ก็ยังเขียวอยู่ดี
 * <p>
 * กฎเดียวกันนี้ต้องตรงกับ bahtAmount ใน frontend/src/format.ts
 */
class DocumentFormatTest {

    private final Locale originalLocale = Locale.getDefault();

    @AfterEach
    void restoreLocale() {
        Locale.setDefault(originalLocale);
    }

    @Test
    @DisplayName("เงินเป็นบาท มีตัวคั่นหลักพันและทศนิยมสองตำแหน่งเสมอ")
    void moneyHasThousandSeparatorAndTwoDecimals() {
        assertThat(DocumentFormat.money(new BigDecimal("3500"))).isEqualTo("฿3,500.00");
        assertThat(DocumentFormat.money(new BigDecimal("1234567.5"))).isEqualTo("฿1,234,567.50");
    }

    @Test
    @DisplayName("ยอดลงตัวก็ยังต้องมี .00 ห้ามตัดทิ้งแบบตอนที่เป็นเยน")
    void moneyKeepsTrailingZerosOnWholeAmounts() {
        assertThat(DocumentFormat.money(new BigDecimal("250"))).isEqualTo("฿250.00");
        assertThat(DocumentFormat.money(BigDecimal.ZERO)).isEqualTo("฿0.00");
    }

    @Test
    @DisplayName("เศษสตางค์เกินสองตำแหน่งปัดแบบ HALF_UP")
    void moneyRoundsHalfUpToSatang() {
        assertThat(DocumentFormat.money(new BigDecimal("99.994"))).isEqualTo("฿99.99");
        assertThat(DocumentFormat.money(new BigDecimal("99.995"))).isEqualTo("฿100.00");
    }

    @Test
    @DisplayName("หน่วยมิเตอร์ไม่มีสัญลักษณ์เงินและไม่เติมศูนย์ท้าย")
    void unitsHasNoCurrencySymbolAndNoTrailingZeros() {
        assertThat(DocumentFormat.units(new BigDecimal("120"))).isEqualTo("120");
        assertThat(DocumentFormat.units(new BigDecimal("120.50"))).isEqualTo("120.5");
        assertThat(DocumentFormat.units(new BigDecimal("1234"))).isEqualTo("1,234");
    }

    /*
     * javadoc ของ grouped() เตือนไว้ว่าถ้าปล่อยให้ใช้ locale ของเครื่อง บางเครื่องที่ตั้ง
     * locale เป็นไทยเต็มรูปแบบจะพิมพ์เลขไทยออกมา และบาง locale ในยุโรปสลับจุดกับจุลภาค
     * ยอดบนใบเสร็จจะอ่านผิดไปคนละหลัก เทสนี้คือตัวกันไม่ให้ใครเผลอถอด Locale.US ออก
     */
    @Test
    @DisplayName("ตัวเลขไม่เปลี่ยนตาม locale ของเครื่องที่รัน")
    void moneyIgnoresSystemLocale() {
        Locale.setDefault(Locale.forLanguageTag("th-TH-u-nu-thai"));
        assertThat(DocumentFormat.money(new BigDecimal("3500"))).isEqualTo("฿3,500.00");

        Locale.setDefault(Locale.GERMANY);
        assertThat(DocumentFormat.money(new BigDecimal("3500"))).isEqualTo("฿3,500.00");
    }

    @Test
    @DisplayName("วันที่เขียนแบบเดียวกับหน้าเว็บ และเป็น ค.ศ. ไม่ใช่ พ.ศ.")
    void dateMatchesTheWebFormat() {
        assertThat(DocumentFormat.date(LocalDate.of(2026, 8, 11))).isEqualTo("11 Aug 2026");
        assertThat(DocumentFormat.monthYear(LocalDate.of(2026, 8, 1))).isEqualTo("Aug 2026");
    }

    /*
     * เวลาเก็บเป็น UTC ช่วงหัวค่ำของไทยจึงยังเป็นวันก่อนหน้าในเวลา UTC
     * 2026-08-11T17:30Z คือ 12 ส.ค. 00:30 ที่กรุงเทพ ใบเสร็จต้องพิมพ์วันไทย
     */
    @Test
    @DisplayName("เวลา UTC ถูกแปลงเป็นวันตามเวลาไทยก่อนพิมพ์")
    void instantIsPrintedInBangkokDate() {
        assertThat(DocumentFormat.date(Instant.parse("2026-08-11T17:30:00Z"))).isEqualTo("12 Aug 2026");
    }

    @Test
    @DisplayName("วันสิ้นสุดสัญญาที่ยังไม่กำหนด พิมพ์เป็นคำ ไม่ใช่ช่องว่าง")
    void emptyDateIsPrintedAsWords() {
        assertThat(DocumentFormat.dateOrDash(null, "Not specified")).isEqualTo("Not specified");
        assertThat(DocumentFormat.dateOrDash(LocalDate.of(2026, 8, 11), "Not specified"))
                .isEqualTo("11 Aug 2026");
    }
}
