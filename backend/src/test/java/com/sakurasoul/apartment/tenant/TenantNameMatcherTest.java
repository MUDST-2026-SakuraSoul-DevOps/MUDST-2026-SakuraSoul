package com.sakurasoul.apartment.tenant;

import com.sakurasoul.apartment.tenant.TenantNameMatcher.NameMatch;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import java.util.List;
import java.util.Locale;
import java.util.stream.IntStream;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * กฎการค้นชื่อแบบยอมให้พิมพ์ผิด (SSK-174) ต้องได้ผลเดียวกับ frontend/src/domain/tenantSearch.ts ทุกเคส
 * <p>
 * เคสในคลาสซ้อน InstructorExamples, ThaiNames และ EdgeCases ยกมาจาก tenantSearch.test.ts ตรงตัว
 * ถ้าฝั่งไหนเปลี่ยนกฎ เทสของอีกฝั่งต้องพังด้วย ส่วน JavaOnly คือจุดที่ Java กับ JavaScript ต่างกันเอง
 * (ช่องว่างแบบ NBSP, code point นอก BMP, locale ของเครื่อง) ซึ่งฝั่งหน้าเว็บไม่มีทางเจอ
 */
class TenantNameMatcherTest {

    private record Person(long id, String fullName) {
    }

    private static final List<Person> PEOPLE = List.of(
            new Person(1, "Kant Srisuk"),
            new Person(2, "Mali Prasert"),
            new Person(3, "Kanthida Wong"),
            new Person(4, "สมชาย ใจดี"));

    private static List<String> names(String query) {
        return names(PEOPLE, query);
    }

    private static List<String> names(List<Person> people, String query) {
        return TenantNameMatcher.rank(people, Person::fullName, query).stream()
                .map(hit -> hit.item().fullName() + ":" + hit.match())
                .toList();
    }

    @Nested
    @DisplayName("ตัวอย่างของอาจารย์ (AC ของ SSK-174)")
    class InstructorExamples {

        @ParameterizedTest(name = "{0} เจอ Kant แบบ {1}")
        @CsvSource({"kant, EXACT", "krant, SIMILAR", "kart, SIMILAR", "KANT, EXACT"})
        void findsKant(String query, String match) {
            assertThat(names(query).getFirst()).isEqualTo("Kant Srisuk:" + match);
        }

        @Test
        @DisplayName("xyz ไม่เจอใคร")
        void xyzFindsNobody() {
            assertThat(names("xyz")).isEmpty();
        }

        @Test
        @DisplayName("ผลที่ตรงทั้งคำมาก่อนผลที่ขึ้นต้นด้วยคำค้น")
        void exactComesBeforePrefix() {
            assertThat(names("kant")).containsExactly("Kant Srisuk:EXACT", "Kanthida Wong:PREFIX");
        }

        @Test
        @DisplayName("ค้นด้วยส่วนหนึ่งของชื่อยังใช้ได้เหมือนเดิม")
        void partialSearchStillWorks() {
            assertThat(names("pras")).containsExactly("Mali Prasert:PREFIX");
            assertThat(names("thid")).containsExactly("Kanthida Wong:CONTAINS");
        }
    }

    @Nested
    @DisplayName("ชื่อภาษาไทย")
    class ThaiNames {

        @Test
        @DisplayName("ชื่อต้นตรงทั้งคำ")
        void exactFirstName() {
            assertThat(names("สมชาย")).containsExactly("สมชาย ใจดี:EXACT");
        }

        @Test
        @DisplayName("ขาดสระไปหนึ่งตัวยังเจอแบบคล้าย")
        void missingVowel() {
            assertThat(names("สมชย")).containsExactly("สมชาย ใจดี:SIMILAR");
        }

        @Test
        @DisplayName("พยัญชนะผิดหนึ่งตัวยังเจอแบบคล้าย")
        void oneWrongConsonant() {
            assertThat(names("สมขาย")).containsExactly("สมชาย ใจดี:SIMILAR");
        }
    }

    @Nested
    @DisplayName("กรณีขอบ")
    class EdgeCases {

        @Test
        @DisplayName("คำค้นว่างไม่เจอใคร ช่องว่างหัวท้ายและช่องว่างซ้ำถูกมองข้าม")
        void blankQueriesAndExtraSpaces() {
            assertThat(names("   ")).isEmpty();
            assertThat(names("  kant   srisuk ")).containsExactly("Kant Srisuk:EXACT");
        }

        @Test
        @DisplayName("คำค้นสั้นกว่าสามตัวไม่หาแบบคล้าย")
        void shortQueriesAreNotFuzzy() {
            assertThat(TenantNameMatcher.matchName("Kant Srisuk", "ka"))
                    .contains(new NameMatch(TenantMatch.PREFIX, 0));
            assertThat(TenantNameMatcher.matchName("Kant Srisuk", "kx")).isEmpty();
        }

        @Test
        @DisplayName("อักขระพิเศษเป็นตัวอักษรธรรมดา ไม่ใช่ regex")
        void specialCharactersArePlainText() {
            assertThat(names("k.*t")).isEmpty();
        }

        @Test
        @DisplayName("สลับตัวอักษรติดกันนับเป็นแก้หนึ่งครั้ง")
        void adjacentSwapIsOneEdit() {
            assertThat(TenantNameMatcher.editDistance("knat", "kant")).isEqualTo(1);
            assertThat(TenantNameMatcher.editDistance("krant", "kant")).isEqualTo(1);
        }
    }

    @Nested
    @DisplayName("จุดที่ Java ต่างจาก JavaScript เอง")
    class JavaOnly {

        @ParameterizedTest(name = "คำค้น {0} ตัวอักษร ยอมผิด {1} ตัว")
        @CsvSource({"ab, 0", "abc, 1", "abcdef, 1", "abcdefg, 2"})
        void allowedEditsByLength(String query, int edits) {
            assertThat(TenantNameMatcher.allowedEdits(query)).isEqualTo(edits);
        }

        @Test
        @DisplayName("คำค้นยาวเจ็ดตัวขึ้นไปยอมผิดสองตัว และผลที่ผิดน้อยกว่ามาก่อน")
        void longQueriesAllowTwoEditsAndRankByDistance() {
            List<Person> people = List.of(new Person(1, "Somchai Jaidee"), new Person(2, "Somchia Jaidee"),
                    new Person(3, "Somcxyi Jaidee"));
            // somchai ตรงทั้งคำ · somchia สลับสองตัวท้าย = ผิด 1 · somcxyi แทนสองตัว = ผิด 2
            assertThat(names(people, "somchai")).containsExactly(
                    "Somchai Jaidee:EXACT", "Somchia Jaidee:SIMILAR", "Somcxyi Jaidee:SIMILAR");
            assertThat(TenantNameMatcher.matchName("Somcxyi Jaidee", "somchai"))
                    .contains(new NameMatch(TenantMatch.SIMILAR, 2));
        }

        @Test
        @DisplayName("ระดับและระยะเท่ากันเรียงตามชื่อโดยไม่สนตัวพิมพ์เล็กใหญ่")
        void tiesAreBrokenByNameIgnoringCase() {
            List<Person> people = List.of(new Person(1, "kant Zed"), new Person(2, "Kant Abe"));
            assertThat(names(people, "kant")).containsExactly("Kant Abe:EXACT", "kant Zed:EXACT");
        }

        @Test
        @DisplayName("ส่งผลกลับไม่เกิน 20 คน")
        void resultsAreCappedAtTwenty() {
            List<Person> people = IntStream.rangeClosed(1, 25)
                    .mapToObj(i -> new Person(i, "Qwyx %02d".formatted(i)))
                    .toList();
            assertThat(names(people, "qwyx")).hasSize(TenantNameMatcher.MAX_RESULTS);
        }

        @Test
        @DisplayName("ตัวอักษรที่พิมพ์แยกเครื่องหมาย (NFD) ตรงกับชื่อที่เก็บแบบรวม (NFC)")
        void decomposedQueryMatchesComposedName() {
            List<Person> people = List.of(new Person(1, "René Martin"));
            assertThat(names(people, "rené")).containsExactly("René Martin:EXACT");
        }

        @Test
        @DisplayName("NBSP กับ tab ระหว่างคำนับเป็นช่องว่างเหมือนบนหน้าเว็บ ซึ่ง \\s ของ Java ไม่นับ NBSP")
        void javascriptWhitespaceSeparatesWords() {
            assertThat(names("kant \tsrisuk")).containsExactly("Kant Srisuk:EXACT");
            List<Person> people = List.of(new Person(1, "Kant Srisuk"));
            assertThat(names(people, "srisuk")).containsExactly("Kant Srisuk:EXACT");
        }

        @Test
        @DisplayName("ตัวอักษรนอก BMP นับเป็นหนึ่งตัวตาม code point ไม่ใช่สองตาม char")
        void supplementaryCharactersCountAsOne() {
            // 𠀀 (U+20000) ใช้ char สองตัว ถ้านับตาม char คำค้นสองตัวนี้จะยาว 3 แล้วถูกหาแบบคล้ายผิดเกณฑ์
            String query = "𠀀a";
            assertThat(TenantNameMatcher.allowedEdits(query)).isZero();
            assertThat(TenantNameMatcher.editDistance("𠀀", "a")).isEqualTo(1);
        }

        @Test
        @DisplayName("ผลไม่ขึ้นกับ locale ของเครื่อง เครื่องที่ตั้งเป็นตุรกีต้องค้น KIM เจอ Kim")
        void resultDoesNotDependOnTheDefaultLocale() {
            Locale original = Locale.getDefault();
            try {
                Locale.setDefault(Locale.forLanguageTag("tr-TR"));
                List<Person> people = List.of(new Person(1, "Kim Lee"));
                assertThat(names(people, "KIM")).containsExactly("Kim Lee:EXACT");
            } finally {
                Locale.setDefault(original);
            }
        }

        @Test
        @DisplayName("คำค้นยาวผิดปกติไม่เจอใครและไม่ต้องคิดตารางใหญ่กับทุกคน")
        void veryLongQueryFindsNobody() {
            assertThat(names("k".repeat(5_000))).isEmpty();
        }
    }
}
