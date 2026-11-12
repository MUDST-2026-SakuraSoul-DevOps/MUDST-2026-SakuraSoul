package com.sakurasoul.apartment.common.csv;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class CsvWriterTest {

    @Test
    @DisplayName("SSK-170 ไฟล์ขึ้นต้นด้วย BOM ของ UTF-8 ทุกแถวจบด้วย CRLF รวมแถวสุดท้าย ภาษาไทยเป็น UTF-8")
    void bomThenCrlfRowsInUtf8() {
        byte[] file = CsvWriter.utf8WithBom(List.of(List.of("unit", "billed"), List.of("ห้อง 101", "10145.00")));

        assertThat(Arrays.copyOf(file, 3)).containsExactly(0xEF, 0xBB, 0xBF);
        assertThat(new String(file, 3, file.length - 3, StandardCharsets.UTF_8))
                .isEqualTo("unit,billed\r\nห้อง 101,10145.00\r\n");
    }

    @Test
    @DisplayName("SSK-170 ไม่มีแถวได้แค่ BOM")
    void noRowsIsJustTheBom() {
        assertThat(CsvWriter.utf8WithBom(List.of())).containsExactly(0xEF, 0xBB, 0xBF);
    }

    @Test
    @DisplayName("SSK-170 ใส่ quote เฉพาะเซลล์ที่มี comma, quote หรือขึ้นบรรทัด quote ข้างในเขียนซ้ำสองตัว")
    void quotesOnlyWhenNeeded() {
        assertThat(CsvWriter.cell("plain text")).isEqualTo("plain text");
        assertThat(CsvWriter.cell("Smith, John")).isEqualTo("\"Smith, John\"");
        assertThat(CsvWriter.cell("say \"hi\"")).isEqualTo("\"say \"\"hi\"\"\"");
        assertThat(CsvWriter.cell("two\nlines")).isEqualTo("\"two\nlines\"");
        assertThat(CsvWriter.cell("two\r\nlines")).isEqualTo("\"two\r\nlines\"");
        assertThat(CsvWriter.cell("")).isEmpty();
        assertThat(CsvWriter.cell(null)).isEmpty();
    }

    @ParameterizedTest
    @ValueSource(strings = {"=HYPERLINK(\"http://x\",\"click\")", "+1+2", "-2+3", "@SUM(A1)", "\tcmd"})
    @DisplayName("SSK-170 เซลล์ที่ Excel จะอ่านเป็นสูตรได้ ' นำหน้า")
    void formulaLikeCellsArePrefixed(String value) {
        assertThat(CsvWriter.cell(value)).contains("'" + value.substring(0, 1));
    }

    @Test
    @DisplayName("SSK-170 ตัวเลขติดลบธรรมดาไม่ถูกกัน ยังเป็นตัวเลขใน Excel")
    void negativeNumbersStayNumbers() {
        assertThat(CsvWriter.cell("-5.00")).isEqualTo("-5.00");
        assertThat(CsvWriter.cell("-12")).isEqualTo("-12");
        assertThat(CsvWriter.cell("-5.00 baht")).isEqualTo("'-5.00 baht");
    }

    @Test
    @DisplayName("SSK-170 สูตรที่มี comma ได้ทั้ง ' และ quote")
    void aFormulaWithACommaIsPrefixedThenQuoted() {
        assertThat(CsvWriter.cell("=SUM(A1,B1)")).isEqualTo("\"'=SUM(A1,B1)\"");
    }

    @Test
    @DisplayName("SSK-170 อ่านกลับด้วย LineTrackedCsv ได้ค่าเดิมทุกเซลล์")
    void readsBackWithTheProjectReader() {
        List<List<String>> rows = List.of(
                List.of("unit", "label", "billed"),
                List.of("101", "Smith, \"JJ\"", "10145.00"),
                List.of("102", "สองบรรทัด\nต่อกัน", "-5.00"));

        List<List<String>> readBack = LineTrackedCsv.readUtf8(CsvWriter.utf8WithBom(rows)).stream()
                .map(LineTrackedCsv.Row::cells)
                .toList();

        assertThat(readBack).isEqualTo(rows);
    }
}
