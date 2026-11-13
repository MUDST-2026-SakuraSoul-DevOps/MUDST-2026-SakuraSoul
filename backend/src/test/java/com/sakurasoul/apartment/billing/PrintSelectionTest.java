package com.sakurasoul.apartment.billing;

import com.sakurasoul.apartment.billing.ReceiptDtos.PrintReceiptsRequest;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import java.time.YearMonth;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.stream.LongStream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** การตรวจคำขอพิมพ์รวม (SSK-169) ข้อความตามตาราง error ในสัญญา API ลำดับการตรวจ และชื่อไฟล์ */
class PrintSelectionTest {

    @Test
    @DisplayName("SSK-169 ไม่ส่งอะไรมาเลย (ไม่มี body, ทุกช่องว่าง, รายการว่าง, มีแต่ null, เดือนว่าง, มีแต่ status) ได้ข้อความให้เลือกแบบใดแบบหนึ่ง")
    void nothingToPrintAsksToChooseOne() {
        List<PrintReceiptsRequest> nothing = Arrays.asList(null,
                new PrintReceiptsRequest(null, null, null),
                new PrintReceiptsRequest(List.of(), null, null),
                new PrintReceiptsRequest(Arrays.asList((Long) null), null, null),
                new PrintReceiptsRequest(null, "  ", null),
                new PrintReceiptsRequest(null, null, "PAID"));

        for (PrintReceiptsRequest request : nothing) {
            assertThatThrownBy(() -> PrintSelection.of(request)).as(String.valueOf(request))
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessage("Choose either receipts or a month to print");
        }
    }

    @Test
    @DisplayName("SSK-169 ส่งทั้งสองแบบได้ข้อความเดียวกัน ไม่ปล่อยให้แบบใดแบบหนึ่งชนะเงียบ ๆ")
    void bothFormsAreRejected() {
        assertThatThrownBy(() -> PrintSelection.of(new PrintReceiptsRequest(List.of(3L), "2026-11", null)))
                .hasMessage(PrintSelection.CHOOSE_ONE);
    }

    @Test
    @DisplayName("SSK-169 รายการว่างที่ส่งมาพร้อมเดือนคือแบบทั้งเดือน")
    void anEmptyListWithAMonthIsTheMonthForm() {
        PrintSelection selection = PrintSelection.of(new PrintReceiptsRequest(List.of(), "2026-11", null));

        assertThat(selection.byIds()).isFalse();
        assertThat(selection.month()).isEqualTo(YearMonth.of(2026, 11));
    }

    @Test
    @DisplayName("SSK-169 id ซ้ำนับครั้งเดียวตามลำดับที่ส่งมา null ถูกตัดทิ้ง")
    void duplicateIdsCountOnce() {
        PrintSelection selection = PrintSelection.of(new PrintReceiptsRequest(Arrays.asList(5L, null, 5L, 3L), null, null));

        assertThat(selection.receiptIds()).containsExactly(5L, 3L);
        assertThat(selection.byIds()).isTrue();
    }

    @Test
    @DisplayName("SSK-169 เลือกเองได้ไม่เกิน 100 ใบ นับหลังตัด id ซ้ำ")
    void atMostOneHundredDistinctReceipts() {
        List<Long> hundred = LongStream.rangeClosed(1, 100).boxed().toList();
        List<Long> hundredWithRepeats = new ArrayList<>(hundred);
        hundredWithRepeats.addAll(hundred.subList(0, 50));
        List<Long> hundredAndOne = LongStream.rangeClosed(1, 101).boxed().toList();

        assertThat(PrintSelection.of(new PrintReceiptsRequest(hundred, null, null)).receiptIds()).hasSize(100);
        assertThat(PrintSelection.of(new PrintReceiptsRequest(hundredWithRepeats, null, null)).receiptIds()).hasSize(100);
        assertThatThrownBy(() -> PrintSelection.of(new PrintReceiptsRequest(hundredAndOne, null, null)))
                .hasMessage("Choose at most 100 receipts");
    }

    @ParameterizedTest(name = "\"{0}\"")
    @ValueSource(strings = {"2026-13", "11-2026", "2026-1", "+12026-01", "2026/11", "Nov 2026"})
    @DisplayName("SSK-169 เดือนผิดรูปแบบได้ข้อความตามสัญญา")
    void aMalformedMonthIsRejected(String month) {
        assertThatThrownBy(() -> PrintSelection.of(new PrintReceiptsRequest(null, month, null)))
                .hasMessage("The billing month must be in YYYY-MM format");
    }

    @Test
    @DisplayName("SSK-169 เดือนที่มีช่องว่างหัวท้ายใช้ได้ ชื่อไฟล์ใช้เดือนที่ตัดช่องว่างแล้ว")
    void theMonthIsTrimmedForTheFileName() {
        PrintSelection selection = PrintSelection.of(new PrintReceiptsRequest(null, " 2026-11 ", null));

        assertThat(selection.fileName()).isEqualTo("receipts-2026-11.pdf");
    }

    @Test
    @DisplayName("SSK-169 status ของแบบทั้งเดือนตัวพิมพ์ต้องตรง ว่างคือทุกสถานะ")
    void theStatusFilterOfTheMonthForm() {
        assertThat(PrintSelection.of(new PrintReceiptsRequest(null, "2026-11", "PARTIAL")).status())
                .isEqualTo(ReceiptStatus.PARTIAL);
        assertThat(PrintSelection.of(new PrintReceiptsRequest(null, "2026-11", " ")).status()).isNull();
        assertThatThrownBy(() -> PrintSelection.of(new PrintReceiptsRequest(null, "2026-11", "paid")))
                .hasMessage("status must be PENDING, PARTIAL or PAID");
        assertThatThrownBy(() -> PrintSelection.of(new PrintReceiptsRequest(null, "2026-11", "OVERDUE")))
                .hasMessage(ReceiptStatus.FILTER_MESSAGE);
    }

    @Test
    @DisplayName("SSK-169 status ผิดกับเดือนผิดพร้อมกันได้ข้อความของ status ก่อน ลำดับเดียวกับ GET /api/receipts")
    void theStatusIsCheckedBeforeTheMonth() {
        assertThatThrownBy(() -> PrintSelection.of(new PrintReceiptsRequest(null, "2026-13", "DONE")))
                .hasMessage(ReceiptStatus.FILTER_MESSAGE);
    }

    @Test
    @DisplayName("SSK-169 status ที่ส่งมากับ receiptIds ไม่ถูกตรวจ ใบที่เลือกเองพิมพ์ได้ทุกสถานะ")
    void theStatusIsIgnoredWithSelectedReceipts() {
        PrintSelection selection = PrintSelection.of(new PrintReceiptsRequest(List.of(7L), null, "garbage"));

        assertThat(selection.status()).isNull();
        assertThat(selection.fileName()).isEqualTo("receipts.pdf");
    }

    @Test
    @DisplayName("SSK-169 ข้อความ 404 บอกทุก id ที่หาไม่เจอเรียงตามตัวเลข และข้อความเดือนที่ไม่มีใบ")
    void theMessagesThatNeedData() {
        assertThat(PrintSelection.notFoundMessage(List.of(100L, 15L, 12L))).isEqualTo("Receipts not found: 12, 15, 100");
        assertThat(PrintSelection.notFoundMessage(List.of(9L))).isEqualTo("Receipts not found: 9");
        assertThat(PrintSelection.noneMessage(YearMonth.of(2026, 11))).isEqualTo("No receipts to print for 2026-11");
    }
}
