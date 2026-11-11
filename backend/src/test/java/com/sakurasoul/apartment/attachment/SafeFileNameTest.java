package com.sakurasoul.apartment.attachment;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;

import java.text.Normalizer;

import static org.assertj.core.api.Assertions.assertThat;

class SafeFileNameTest {

    @Test
    @DisplayName("SSK-161 ตัด path ที่ติดมาทั้งแบบ Windows และแบบ ../")
    void stripsPaths() {
        assertThat(SafeFileName.of("C:\\fakepath\\slip-1201.jpg")).isEqualTo("slip-1201.jpg");
        assertThat(SafeFileName.of("../../etc/passwd")).isEqualTo("passwd");
        assertThat(SafeFileName.of("a/b\\c.pdf")).isEqualTo("c.pdf");
    }

    @Test
    @DisplayName("SSK-161 ตัดอักขระควบคุมและอักขระกลับทิศที่ใช้ปลอมนามสกุล ตัดช่องว่างหัวท้าย")
    void stripsControlAndBidiCharacters() {
        assertThat(SafeFileName.of("re\u0000port\r\n.pdf")).isEqualTo("report.pdf");
        assertThat(SafeFileName.of("invoice\u202Egpj.exe")).isEqualTo("invoicegpj.exe");
        assertThat(SafeFileName.of("  สัญญาห้อง 101.pdf  ")).isEqualTo("สัญญาห้อง 101.pdf");
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {"   ", ".", "..", "C:\\fakepath\\", "\u0007"})
    @DisplayName("SSK-161 ชื่อที่ไม่เหลืออะไรเปลี่ยนเป็น file")
    void emptyNamesBecomeFile(String original) {
        assertThat(SafeFileName.of(original)).isEqualTo("file");
    }

    @Test
    @DisplayName("SSK-161 ชื่อยาวเกิน 150 ตัวถูกตัดที่ชื่อ นามสกุลยังอยู่ นับตัวอักษรไม่ใช่ char")
    void longNamesKeepTheirExtension() {
        String longName = "ก".repeat(200) + ".pdf";
        String cut = SafeFileName.of(longName);
        assertThat(cut).hasSize(150).endsWith(".pdf").startsWith("กกก");

        // อีโมจิหนึ่งตัวกินสอง char ต้องไม่ถูกผ่ากลางคู่
        String emoji = "😀".repeat(160) + ".png";
        String emojiCut = SafeFileName.of(emoji);
        assertThat(emojiCut.codePointCount(0, emojiCut.length())).isEqualTo(150);
        assertThat(emojiCut).endsWith(".png");
        assertThat(Character.isHighSurrogate(emojiCut.charAt(emojiCut.length() - 5))).isFalse();

        assertThat(SafeFileName.of("x".repeat(150) + ".pdf")).isEqualTo("x".repeat(146) + ".pdf");
        assertThat(SafeFileName.of("x".repeat(150))).hasSize(150);
        assertThat(SafeFileName.of("y".repeat(151))).hasSize(150);
    }

    @Test
    @DisplayName("SSK-161 ชื่อไทยที่สระแยกจากพยัญชนะ (macOS) เก็บแบบ NFC")
    void normalisesToNfc() {
        String decomposed = Normalizer.normalize("ใบเสร็จ.pdf", Normalizer.Form.NFD);
        assertThat(SafeFileName.of(decomposed)).isEqualTo(Normalizer.normalize(decomposed, Normalizer.Form.NFC));
    }
}
