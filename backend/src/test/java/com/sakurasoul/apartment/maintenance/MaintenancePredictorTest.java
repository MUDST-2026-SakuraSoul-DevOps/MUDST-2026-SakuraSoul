package com.sakurasoul.apartment.maintenance;

import com.sakurasoul.apartment.maintenance.MaintenanceDtos.PredictionResponse;
import com.sakurasoul.apartment.maintenance.MaintenancePredictor.ClosedJob;
import com.sakurasoul.apartment.maintenance.MaintenancePredictor.Forecast;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * กฎทำนายรอบซ่อม (SSK-173) ต้องได้ผลเดียวกับ frontend/src/domain/maintenancePrediction.ts ทุกเคส
 * <p>
 * เคสในคลาสซ้อน PredictNext กับ Helpers ยกมาจาก maintenancePrediction.test.ts ตรงตัว (suggestedFrequency เป็นของหน้าจอ
 * ไม่ได้ย้ายมา) ส่วน JavaOnly คือจุดที่ Java เสี่ยงต่างจาก JavaScript เอง คือการปัดเศษ ขอบของเกณฑ์ความมั่นใจ และเขตเวลา
 */
class MaintenancePredictorTest {

    private static final ZoneId BANGKOK = ZoneId.of("Asia/Bangkok");

    private static Forecast forecast(String... dates) {
        return MaintenancePredictor.predictNext(Stream.of(dates).map(LocalDate::parse).toList()).orElseThrow();
    }

    private static List<ClosedJob> jobs(long roomId, String roomNumber, String type, String... dates) {
        return Stream.of(dates).map(date -> new ClosedJob(roomId, roomNumber, type, LocalDate.parse(date))).toList();
    }

    private static List<String> summary(List<ClosedJob> jobs) {
        return MaintenancePredictor.predictAll(jobs).stream()
                .map(p -> p.roomNumber() + " " + p.maintenanceType() + " " + p.predictedDate())
                .toList();
    }

    @Nested
    @DisplayName("predictNext (เคสเดียวกับหน้าเว็บ)")
    class PredictNext {

        @Test
        @DisplayName("AC1 สี่งานห่าง 30, 31, 29 วัน ได้งานล่าสุด + 30 วัน ความมั่นใจสูง")
        void addsTheMedianGapToTheLastJob() {
            assertThat(forecast("2026-01-01", "2026-01-31", "2026-03-03", "2026-04-01")).isEqualTo(new Forecast(
                    LocalDate.parse("2026-04-01"), 30, LocalDate.parse("2026-05-01"), PredictionConfidence.HIGH, 4));
        }

        @Test
        @DisplayName("AC2 น้อยกว่าสามวันไม่เดา และสองงานในวันเดียวกันนับครั้งเดียว")
        void doesNotGuessFromFewerThanThreeDays() {
            assertThat(MaintenancePredictor.predictNext(List.of(LocalDate.parse("2026-01-01"),
                    LocalDate.parse("2026-02-01")))).isEmpty();
            assertThat(MaintenancePredictor.predictNext(List.of(LocalDate.parse("2026-01-01"),
                    LocalDate.parse("2026-01-01"), LocalDate.parse("2026-02-01")))).isEmpty();
        }

        @Test
        @DisplayName("AC3 ช่วงห่างแกว่งมาก (10, 90, 15) ได้ความมั่นใจต่ำ")
        void marksIrregularGapsAsLowConfidence() {
            Forecast result = forecast("2026-01-01", "2026-01-11", "2026-04-11", "2026-04-26");
            assertThat(result.medianIntervalDays()).isEqualTo(15);
            assertThat(result.predictedDate()).isEqualTo("2026-05-11");
            assertThat(result.confidence()).isEqualTo(PredictionConfidence.LOW);
        }

        @Test
        @DisplayName("ข้ามเดือนและข้ามปีได้")
        void crossesMonthAndYearBoundaries() {
            assertThat(forecast("2025-10-01", "2025-11-30", "2026-01-29").predictedDate()).isEqualTo("2026-03-30");
        }

        @Test
        @DisplayName("AC4 ข้อมูลชุดเดียวกันได้ผลเดิมเสมอไม่ว่าจะเข้ามาลำดับไหน")
        void isDeterministic() {
            List<LocalDate> dates = Stream.of("2026-04-01", "2026-01-01", "2026-03-03", "2026-01-31")
                    .map(LocalDate::parse).toList();
            List<LocalDate> reversed = new ArrayList<>(dates);
            Collections.reverse(reversed);
            assertThat(MaintenancePredictor.predictNext(dates)).isEqualTo(MaintenancePredictor.predictNext(reversed));
        }
    }

    @Nested
    @DisplayName("ตัวช่วย (เคสเดียวกับหน้าเว็บ)")
    class Helpers {

        @Test
        @DisplayName("มัธยฐานและช่วงของความมั่นใจ")
        void medianAndConfidenceBands() {
            assertThat(MaintenancePredictor.median(new double[] {3, 1, 2})).isEqualTo(2);
            assertThat(MaintenancePredictor.median(new double[] {1, 2, 3, 4})).isEqualTo(2.5);
            assertThat(MaintenancePredictor.confidenceOf(new double[] {90, 91, 89})).isEqualTo(PredictionConfidence.HIGH);
            assertThat(MaintenancePredictor.confidenceOf(new double[] {30, 40, 30, 22}))
                    .isEqualTo(PredictionConfidence.MEDIUM);
            assertThat(MaintenancePredictor.confidenceOf(new double[] {10, 90, 15})).isEqualTo(PredictionConfidence.LOW);
        }

        @Test
        @DisplayName("จัดกลุ่มตามห้องกับประเภทงานแล้วเรียงตามวันที่คาดการณ์ งานที่มีครั้งเดียวไม่ถูกทำนาย")
        void groupsByUnitAndJobTypeAndSortsByTheNextDate() {
            List<ClosedJob> all = new ArrayList<>();
            all.addAll(jobs(1, "101", "Plumbing", "2026-01-01", "2026-02-01", "2026-03-01"));
            all.addAll(jobs(2, "102", "Plumbing", "2026-01-01", "2026-01-11", "2026-01-21"));
            all.addAll(jobs(1, "101", "Electrical", "2026-01-05"));

            assertThat(summary(all)).containsExactly("102 Plumbing 2026-01-31", "101 Plumbing 2026-03-31");
        }

        @Test
        @DisplayName("คำแนะนำที่ตกวันเดียวกันเรียงตามเลขห้อง")
        void ordersPredictionsOnTheSameDateByUnitNumber() {
            List<ClosedJob> all = new ArrayList<>();
            all.addAll(jobs(1, "102", "Plumbing", "2026-01-01", "2026-02-01", "2026-03-01"));
            all.addAll(jobs(2, "101", "Plumbing", "2026-01-01", "2026-02-01", "2026-03-01"));

            assertThat(MaintenancePredictor.predictAll(all))
                    .extracting(p -> p.roomNumber() + " " + p.predictedDate())
                    .containsExactly("101 2026-03-31", "102 2026-03-31");
        }
    }

    @Nested
    @DisplayName("จุดที่ Java เสี่ยงต่างจาก JavaScript เอง")
    class JavaOnly {

        @Test
        @DisplayName("มัธยฐาน 29.5 ปัดขึ้นเป็น 30 เหมือน Math.round ของ JavaScript ไม่ใช่ 29 แบบปัดเลขคู่")
        void halfDaysRoundUpLikeJavaScript() {
            // ห่าง 31 กับ 28 วัน มัธยฐาน 29.5
            Forecast result = forecast("2026-01-01", "2026-02-01", "2026-03-01");
            assertThat(result.medianIntervalDays()).isEqualTo(30);
            assertThat(result.predictedDate()).isEqualTo("2026-03-31");
        }

        @ParameterizedTest(name = "ช่วงห่าง {0} ได้ {1}")
        @CsvSource(delimiter = '|', value = {
                "10 11 9 | HIGH",
                "10 13 7 | MEDIUM",
                "10 14 6 | LOW",
                "0 0     | LOW"})
        void confidenceThresholdsAreInclusive(String gaps, PredictionConfidence expected) {
            double[] intervals = Arrays.stream(gaps.trim().split("\\s+")).mapToDouble(Double::parseDouble).toArray();
            // 10, 11, 9 แกว่ง 0.1 พอดี และ 10, 13, 7 แกว่ง 0.3 พอดี ต้องได้ระดับที่ดีกว่าเพราะเกณฑ์เป็น ≤
            assertThat(MaintenancePredictor.confidenceOf(intervals)).isEqualTo(expected);
        }

        @Test
        @DisplayName("วันที่เกิดงานใช้วันปิดก่อน ไม่มีใช้วันนัด ไม่มีอีกใช้วันแจ้ง")
        void occurrenceDayPrefersClosedThenScheduledThenReported() {
            Instant closed = Instant.parse("2026-03-10T03:00:00Z");
            LocalDate scheduled = LocalDate.parse("2026-03-05");
            Instant reported = Instant.parse("2026-03-01T03:00:00Z");

            assertThat(MaintenancePredictor.occurrenceDay(closed, scheduled, reported, BANGKOK))
                    .isEqualTo("2026-03-10");
            assertThat(MaintenancePredictor.occurrenceDay(null, scheduled, reported, BANGKOK)).isEqualTo("2026-03-05");
            assertThat(MaintenancePredictor.occurrenceDay(null, null, reported, BANGKOK)).isEqualTo("2026-03-01");
        }

        @Test
        @DisplayName("นับวันตามเวลาไทย ปิดงาน 17:30 UTC คือวันถัดไปของไทย")
        void daysAreCountedInBangkokTime() {
            assertThat(MaintenancePredictor.occurrenceDay(Instant.parse("2026-01-01T17:30:00Z"), null,
                    Instant.parse("2026-01-01T00:00:00Z"), BANGKOK)).isEqualTo("2026-01-02");
            assertThat(MaintenancePredictor.occurrenceDay(Instant.parse("2026-01-01T16:59:00Z"), null,
                    Instant.parse("2026-01-01T00:00:00Z"), BANGKOK)).isEqualTo("2026-01-01");
        }

        @Test
        @DisplayName("สองงานในวัน UTC เดียวกันแต่คนละวันของไทยนับเป็นสองวัน")
        void sameUtcDayButDifferentBangkokDaysCountTwice() {
            LocalDate first = MaintenancePredictor.occurrenceDay(Instant.parse("2026-01-01T16:00:00Z"), null,
                    Instant.EPOCH, BANGKOK);
            LocalDate second = MaintenancePredictor.occurrenceDay(Instant.parse("2026-01-01T18:00:00Z"), null,
                    Instant.EPOCH, BANGKOK);
            assertThat(MaintenancePredictor.predictNext(List.of(first, second, LocalDate.parse("2026-01-10"))))
                    .get()
                    .extracting(Forecast::sampleSize)
                    .isEqualTo(3);
        }

        @Test
        @DisplayName("ห้องเดียวกันวันเดียวกันต่างประเภทงานเรียงตามชื่อประเภท ผลจึงไม่ขึ้นกับลำดับแถวจากฐานข้อมูล")
        void tiesAreBrokenByMaintenanceType() {
            List<ClosedJob> all = new ArrayList<>();
            all.addAll(jobs(1, "101", "Plumbing", "2026-01-01", "2026-02-01", "2026-03-01"));
            all.addAll(jobs(1, "101", "Electrical", "2026-01-01", "2026-02-01", "2026-03-01"));

            assertThat(MaintenancePredictor.predictAll(all)).extracting(PredictionResponse::maintenanceType)
                    .containsExactly("Electrical", "Plumbing");
        }

        @Test
        @DisplayName("ไม่มีงานเลยได้ลิสต์ว่าง")
        void noJobsGiveNoPredictions() {
            assertThat(MaintenancePredictor.predictAll(List.of())).isEmpty();
        }
    }
}
