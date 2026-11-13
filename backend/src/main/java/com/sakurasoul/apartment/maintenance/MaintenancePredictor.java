package com.sakurasoul.apartment.maintenance;

import com.sakurasoul.apartment.maintenance.MaintenanceDtos.PredictionResponse;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collection;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.TreeSet;

/**
 * ทำนายรอบซ่อมครั้งถัดไปด้วยกฎง่าย ๆ ไม่ใช้ AI ไม่เรียกบริการภายนอก (SSK-173 โบนัส)
 * <p>
 * ย้าย frontend/src/domain/maintenancePrediction.ts มาทีละบรรทัด เพราะหน้าเว็บกับ backend จำลองใช้กฎชุดนั้นอยู่แล้ว
 * ถ้าสองฝั่งคิดต่างกัน เทสที่ผ่านบน mock จะไม่บอกอะไรเกี่ยวกับของจริง ซึ่งเป็นสาเหตุที่ endpoint นี้หลุดมาจนถึงวันก่อนพรีเซนต์
 * กฎทั้งหมดอยู่ในหัวข้อ SSK-173 ของ docs/api-contract-maintenance.md สัญญาขอให้เป็นคลาส pure function เพื่อเทสแบบตาราง
 * <p>
 * แยกกลุ่มตาม (ห้อง, ประเภทงาน) จากใบที่ปิดแล้ว
 * <ol>
 *   <li>ต้องมีอย่างน้อย 3 วัน ไม่งั้นไม่ทำนาย (ไม่เดา)</li>
 *   <li>ช่วงห่างระหว่างครั้ง (วัน) → มัธยฐาน ทนต่อค่าผิดปกติกว่าค่าเฉลี่ย</li>
 *   <li>วันที่คาดการณ์ = ครั้งล่าสุด + มัธยฐาน (ปัดครึ่งขึ้นแบบ Math.round ของ JavaScript)</li>
 *   <li>ความมั่นใจจาก MAD / มัธยฐาน (MAD = มัธยฐานของ |ช่วงห่าง − มัธยฐาน|) ≤ 0.1 สูง · ≤ 0.3 กลาง · มากกว่านั้นต่ำ</li>
 * </ol>
 * ผลขึ้นกับข้อมูลอย่างเดียว รันซ้ำได้ผลเดิมทุกครั้งไม่ว่าข้อมูลจะเข้ามาลำดับไหน
 */
public final class MaintenancePredictor {

    public static final int MIN_OCCURRENCES = 3;

    /**
     * หน้าเว็บเรียงตามวันที่คาดการณ์แล้วตามเลขห้อง ฝั่งนี้เติมประเภทงานเป็นลำดับที่สาม
     * เพราะลำดับแถวจากฐานข้อมูลไม่แน่นอน ส่วน backend จำลองพึ่งลำดับที่ใส่ข้อมูลไว้ ผลจึงนิ่งเองโดยไม่ต้องมี
     */
    private static final Comparator<PredictionResponse> ORDER = Comparator
            .comparing(PredictionResponse::predictedDate)
            .thenComparing(PredictionResponse::roomNumber)
            .thenComparing(PredictionResponse::maintenanceType);

    private MaintenancePredictor() {
    }

    /** งานที่ปิดแล้วหนึ่งงาน date คือวันที่เกิดงานตามเวลาไทยแล้ว */
    public record ClosedJob(Long roomId, String roomNumber, String maintenanceType, LocalDate date) {
    }

    /** ผลของกลุ่มเดียว ยังไม่ติดห้องกับประเภทงาน */
    public record Forecast(LocalDate lastDate, int medianIntervalDays, LocalDate predictedDate,
            PredictionConfidence confidence, int sampleSize) {
    }

    /**
     * วันที่เกิดงานของใบหนึ่งใบ ใช้วันปิดงาน ไม่มีใช้วันนัด ไม่มีอีกใช้วันแจ้ง นับเป็นวันตามเขตเวลาที่ส่งมา (เวลาไทย)
     * <p>
     * backend จำลองตัดสิบตัวแรกของเวลาแบบ UTC งานที่ปิดระหว่างเที่ยงคืนถึงเจ็ดโมงเช้าเวลาไทยจึงถูกนับเป็นวันก่อนหน้า
     * สัญญาเขียนไว้ให้นับตามเวลาไทย ฝั่งนี้ทำตามสัญญา
     */
    public static LocalDate occurrenceDay(Instant closedAt, LocalDate scheduledDate, Instant reportedAt, ZoneId zone) {
        if (closedAt != null) {
            return LocalDate.ofInstant(closedAt, zone);
        }
        if (scheduledDate != null) {
            return scheduledDate;
        }
        return LocalDate.ofInstant(reportedAt, zone);
    }

    /** มัธยฐาน จำนวนคู่เฉลี่ยสองตัวกลาง */
    public static double median(double[] values) {
        double[] sorted = values.clone();
        Arrays.sort(sorted);
        int mid = sorted.length / 2;
        return sorted.length % 2 == 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    }

    /** ใช้มัธยฐานที่ยังไม่ปัดเหมือนหน้าเว็บ มัธยฐานเป็นศูนย์หรือติดลบถือว่าบอกอะไรไม่ได้ */
    public static PredictionConfidence confidenceOf(double[] intervals) {
        double m = median(intervals);
        if (m <= 0) {
            return PredictionConfidence.LOW;
        }
        double[] deviations = Arrays.stream(intervals).map(value -> Math.abs(value - m)).toArray();
        double spread = median(deviations) / m;
        return spread <= 0.1 ? PredictionConfidence.HIGH
                : spread <= 0.3 ? PredictionConfidence.MEDIUM
                : PredictionConfidence.LOW;
    }

    /** ทำนายจากวันที่เกิดงาน วันเดียวกันนับครั้งเดียว ข้อมูลไม่พอได้ค่าว่าง */
    public static Optional<Forecast> predictNext(Collection<LocalDate> dates) {
        List<LocalDate> days = new ArrayList<>(new TreeSet<>(dates));
        if (days.size() < MIN_OCCURRENCES) {
            return Optional.empty();
        }
        double[] intervals = new double[days.size() - 1];
        for (int i = 1; i < days.size(); i++) {
            intervals[i - 1] = ChronoUnit.DAYS.between(days.get(i - 1), days.get(i));
        }
        // Math.round ของ Java คือ floor(x + 0.5) ตรงกับของ JavaScript 29.5 จึงเป็น 30 ทั้งสองฝั่ง
        // ห้ามเปลี่ยนเป็น Math.rint หรือ HALF_EVEN ไม่งั้นวันที่คาดการณ์จะต่างจากหน้าเว็บหนึ่งวัน
        int medianIntervalDays = (int) Math.round(median(intervals));
        LocalDate last = days.getLast();
        return Optional.of(new Forecast(last, medianIntervalDays, last.plusDays(medianIntervalDays),
                confidenceOf(intervals), days.size()));
    }

    /** ทำนายทุกกลุ่ม (ห้อง, ประเภทงาน) ที่ข้อมูลพอ เรียงตามวันที่คาดการณ์ใกล้ที่สุดก่อน */
    public static List<PredictionResponse> predictAll(List<ClosedJob> jobs) {
        Map<String, List<ClosedJob>> groups = new LinkedHashMap<>();
        for (ClosedJob job : jobs) {
            groups.computeIfAbsent(job.roomId() + "|" + job.maintenanceType(), key -> new ArrayList<>()).add(job);
        }
        List<PredictionResponse> predictions = new ArrayList<>();
        for (List<ClosedJob> group : groups.values()) {
            ClosedJob first = group.getFirst();
            predictNext(group.stream().map(ClosedJob::date).toList()).ifPresent(forecast ->
                    predictions.add(new PredictionResponse(first.roomId(), first.roomNumber(),
                            first.maintenanceType(), forecast.lastDate(), forecast.medianIntervalDays(),
                            forecast.predictedDate(), forecast.confidence(), forecast.sampleSize())));
        }
        predictions.sort(ORDER);
        return predictions;
    }
}
