package com.sakurasoul.apartment.document;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class DocumentQueryTest {

    private static final String RANGE = "from and to must be YYYY-MM-DD with from not after to";

    @Test
    @DisplayName("SSK-172 ไม่ส่งอะไรคือไม่กรอง ค่าว่างก็เหมือนไม่ส่ง")
    void nothingMeansEverything() {
        assertThat(DocumentQuery.of(null, null, null, null, null, null))
                .isEqualTo(new DocumentQuery(null, null, null, null, null, null));
        assertThat(DocumentQuery.of(" ", null, null, "", " ", "  ")).isEqualTo(new DocumentQuery(null, null, null,
                null, null, null));
    }

    @Test
    @DisplayName("SSK-172 ตัวกรองครบทุกตัว")
    void everyFilter() {
        assertThat(DocumentQuery.of("RECEIPT_SCAN", 3L, 9L, "2026-11-01", "2026-11-30", " แอร์ "))
                .isEqualTo(new DocumentQuery(DocumentType.RECEIPT_SCAN, 3L, 9L, LocalDate.of(2026, 11, 1),
                        LocalDate.of(2026, 11, 30), "แอร์"));
        assertThat(DocumentQuery.of(null, null, null, "2026-11-01", "2026-11-01", null).from())
                .isEqualTo(LocalDate.of(2026, 11, 1));
    }

    @Test
    @DisplayName("SSK-172 ชนิดผิดได้ข้อความของชนิด วันที่ผิดรูปหรือกลับด้านได้ข้อความของช่วง")
    void errors() {
        assertThatThrownBy(() -> DocumentQuery.of("Receipt", null, null, null, null, null))
                .hasMessage("Document type must be CONTRACT_SCAN, MAINTENANCE_REPORT or RECEIPT_SCAN");
        for (String[] range : new String[][] {{"2026-11", null}, {null, "30/11/2026"}, {"2026-02-30", null},
                {"2026-12-01", "2026-11-30"}}) {
            assertThatThrownBy(() -> DocumentQuery.of(null, null, null, range[0], range[1], null))
                    .as("%s %s", range[0], range[1])
                    .hasMessage(RANGE);
        }
    }

    @Test
    @DisplayName("SSK-172 อักขระควบคุมในคำค้นถูกตัด คำค้นที่เหลือแต่อักขระควบคุมคือไม่ค้น")
    void controlCharactersInTheSearch() {
        assertThat(DocumentQuery.of(null, null, null, null, null, "แอร์\u0000").q()).isEqualTo("แอร์");
        assertThat(DocumentQuery.of(null, null, null, null, null, "\u0000").q()).isNull();
    }

    @Test
    @DisplayName("SSK-172 % _ และ \\ ในคำค้นเป็นตัวอักษรธรรมดา ไม่ใช่ wildcard")
    void likeWildcardsAreEscaped() {
        assertThat(DocumentQuery.of(null, null, null, null, null, "50%_off\\x").likePattern())
                .isEqualTo("%50\\%\\_off\\\\x%");
    }
}
