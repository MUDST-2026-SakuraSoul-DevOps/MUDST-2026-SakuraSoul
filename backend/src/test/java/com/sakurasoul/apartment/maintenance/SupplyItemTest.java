package com.sakurasoul.apartment.maintenance;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * เกณฑ์ใกล้หมดกับลำดับวิกฤตที่สุดก่อน (SSK-171) ตัวเลขชุดแรกของแต่ละเรื่องเป็นชุดเดียวกับ supplyStock.test.ts ของหน้าเว็บ
 * สองฝั่งจึงยืนยันกฎเดียวกันด้วยตัวอย่างเดียวกัน
 */
class SupplyItemTest {

    @ParameterizedTest(name = "stock {0} min {1} -> low {2}")
    @CsvSource({
            "20, 20, true",
            "19, 20, true",
            "21, 20, false",
            // ขั้นต่ำ 0 นับเฉพาะของที่หมดแล้ว
            "0,  0,  true",
            "1,  0,  false"
    })
    @DisplayName("SSK-171 ใกล้หมดเมื่อเหลือเท่าหรือต่ำกว่าขั้นต่ำ")
    void lowAtOrBelowTheMinimum(int stock, int minStock, boolean low) {
        assertThat(item("LED Bulbs 60W", stock, minStock).isLowStock()).isEqualTo(low);
    }

    @Test
    @DisplayName("SSK-171 ของที่เหลือน้อยที่สุดเมื่อเทียบกับขั้นต่ำมาก่อน")
    void theEmptiestItemRelativeToItsMinimumComesFirst() {
        List<SupplyItem> items = List.of(item("B", 10, 20), item("A", 0, 5), item("C", 3, 30));

        assertThat(sorted(items)).extracting(SupplyItem::getName).containsExactly("A", "C", "B");
    }

    /**
     * Tape 1/10 กับ Fuses 2/20 สัดส่วนเท่ากัน Tape เหลือน้อยกว่าจึงมาก่อน
     * Glue ขั้นต่ำ 0 นับสัดส่วนเป็น 0 เท่ากับ Caps และเหลือ 0 เท่ากัน จึงตัดสินด้วยชื่อ
     */
    @Test
    @DisplayName("SSK-171 สัดส่วนเท่ากันเทียบจำนวนที่เหลือ แล้วค่อยเทียบชื่อ ขั้นต่ำ 0 นับสัดส่วนเป็น 0")
    void tiesFallBackToTheStockThenTheName() {
        List<SupplyItem> items = List.of(item("Fuses", 2, 20), item("Tape", 1, 10), item("Glue", 0, 0), item("Caps", 0, 4));

        assertThat(sorted(items)).extracting(SupplyItem::getName).containsExactly("Caps", "Glue", "Tape", "Fuses");
    }

    /** ถ้าเรียงตามรหัสตัวอักษร เกลือ จะไปอยู่ท้ายสุด เพราะสระ เ มีรหัสสูงกว่าพยัญชนะทุกตัว */
    @Test
    @DisplayName("SSK-171 ชื่อภาษาไทยเรียงตามพจนานุกรม คำที่ขึ้นต้นด้วยสระหน้าไม่ถูกดันไปท้าย")
    void thaiNamesFollowDictionaryOrder() {
        List<SupplyItem> items = List.of(item("ขวดน้ำยา", 0, 5), item("เกลือ", 0, 5), item("กาว", 0, 5));

        assertThat(sorted(items)).extracting(SupplyItem::getName).containsExactly("กาว", "เกลือ", "ขวดน้ำยา");
    }

    private static List<SupplyItem> sorted(List<SupplyItem> items) {
        return items.stream().sorted(SupplyItem.MOST_CRITICAL_FIRST).toList();
    }

    private static SupplyItem item(String name, int stock, int minStock) {
        return new SupplyItem(name, null, "Supplies", stock, minStock, Math.max(stock, minStock));
    }
}
