package com.sakurasoul.apartment.attachment;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;

class FileSignatureTest {

    @Test
    @DisplayName("SSK-161 รู้จัก PDF PNG JPEG จากไบต์แรกของไฟล์")
    void detectsTheThreeKinds() {
        assertThat(FileSignature.detect("%PDF-1.7\n...".getBytes(StandardCharsets.US_ASCII))).contains(FileKind.PDF);
        assertThat(FileSignature.detect(bytes(0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A, 0, 0)))
                .contains(FileKind.PNG);
        assertThat(FileSignature.detect(bytes(0xFF, 0xD8, 0xFF, 0xE0, 0, 0x10))).contains(FileKind.JPEG);
    }

    @Test
    @DisplayName("SSK-161 ไฟล์ .exe ที่เปลี่ยนชื่อเป็น .png GIF และข้อความธรรมดาไม่ผ่าน")
    void rejectsEverythingElse() {
        assertThat(FileSignature.detect(bytes('M', 'Z', 0x90, 0, 3, 0))).isEmpty();
        assertThat(FileSignature.detect("GIF89a....".getBytes(StandardCharsets.US_ASCII))).isEmpty();
        assertThat(FileSignature.detect("hello, world".getBytes(StandardCharsets.US_ASCII))).isEmpty();
    }

    @Test
    @DisplayName("SSK-161 ไฟล์ว่าง ไฟล์ที่สั้นกว่าลายเซ็น และลายเซ็นที่ไม่ได้อยู่ต้นไฟล์ไม่ผ่าน")
    void signatureMustBeWholeAndAtTheStart() {
        assertThat(FileSignature.detect(new byte[0])).isEmpty();
        assertThat(FileSignature.detect(bytes(0x89, 'P', 'N', 'G'))).isEmpty();
        assertThat(FileSignature.detect(bytes(0xFF, 0xD8))).isEmpty();
        assertThat(FileSignature.detect(" %PDF-1.7".getBytes(StandardCharsets.US_ASCII))).isEqualTo(Optional.empty());
    }

    @Test
    @DisplayName("SSK-161 Content-Type ของแต่ละชนิด")
    void contentTypes() {
        assertThat(FileKind.PDF.contentType()).isEqualTo("application/pdf");
        assertThat(FileKind.PNG.contentType()).isEqualTo("image/png");
        assertThat(FileKind.JPEG.contentType()).isEqualTo("image/jpeg");
        assertThat(FileKind.ofContentType("image/png")).isEqualTo(FileKind.PNG);
    }

    private static byte[] bytes(int... values) {
        byte[] bytes = new byte[values.length];
        for (int i = 0; i < values.length; i++) {
            bytes[i] = (byte) values[i];
        }
        return bytes;
    }
}
