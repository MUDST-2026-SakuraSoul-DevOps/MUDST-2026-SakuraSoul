package com.sakurasoul.apartment.attachment;

import com.sakurasoul.apartment.common.FileTooLargeException;
import com.sakurasoul.apartment.common.UnsupportedFileTypeException;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.util.Arrays;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class CheckedFileTest {

    @Test
    @DisplayName("SSK-161 ไฟล์ 5 MB พอดีผ่าน เกินหนึ่งไบต์ได้ข้อความ 413 ตามสัญญา")
    void fiveMegabytesIsTheLimit() {
        assertThat(CheckedFile.of("scan.pdf", pdfOfSize(CheckedFile.MAX_BYTES)).kind()).isEqualTo(FileKind.PDF);
        assertThatThrownBy(() -> CheckedFile.of("scan.pdf", pdfOfSize(CheckedFile.MAX_BYTES + 1)))
                .isInstanceOf(FileTooLargeException.class)
                .hasMessage("The file is larger than 5 MB");
    }

    @Test
    @DisplayName("SSK-161 ขนาดตรวจก่อนชนิด ไฟล์ที่ใหญ่และชนิดผิดได้ 413")
    void sizeIsCheckedBeforeType() {
        assertThatThrownBy(() -> CheckedFile.of("big.exe", new byte[CheckedFile.MAX_BYTES + 1]))
                .isInstanceOf(FileTooLargeException.class);
    }

    @Test
    @DisplayName("SSK-161 เนื้อไฟล์ที่ไม่ใช่ PDF PNG JPEG ได้ข้อความ 415 ตามสัญญา ไม่สนนามสกุล")
    void unsupportedContentIsRejected() {
        assertThatThrownBy(() -> CheckedFile.of("slip.png", new byte[] {'M', 'Z', 0, 0}))
                .isInstanceOf(UnsupportedFileTypeException.class)
                .hasMessage("Only PDF, PNG and JPEG files are allowed");
        assertThatThrownBy(() -> CheckedFile.of("empty.pdf", new byte[0]))
                .isInstanceOf(UnsupportedFileTypeException.class);
    }

    @Test
    @DisplayName("SSK-161 SHA-256 เป็นเลขฐานสิบหกตัวเล็ก ชื่อไฟล์ผ่าน SafeFileName ชนิดมาจากเนื้อไฟล์")
    void digestNameAndKind() {
        byte[] content = "%PDF-1.7 hello".getBytes(StandardCharsets.US_ASCII);
        CheckedFile file = CheckedFile.of("C:\\fakepath\\x.exe", content);

        // นามสกุลไม่ตรงกับเนื้อไฟล์ ได้นามสกุลจริงต่อท้าย
        assertThat(file.fileName()).isEqualTo("x.exe.pdf");
        assertThat(file.kind()).isEqualTo(FileKind.PDF);
        assertThat(file.content()).isSameAs(content);
        // sha256("abc") ตามเอกสาร FIPS 180-2
        assertThat(CheckedFile.sha256Of("abc".getBytes(StandardCharsets.US_ASCII)))
                .isEqualTo("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
        assertThat(file.sha256()).matches("[0-9a-f]{64}");
    }

    private static byte[] pdfOfSize(int size) {
        byte[] content = new byte[size];
        Arrays.fill(content, (byte) ' ');
        System.arraycopy("%PDF-".getBytes(StandardCharsets.US_ASCII), 0, content, 0, 5);
        return content;
    }
}
