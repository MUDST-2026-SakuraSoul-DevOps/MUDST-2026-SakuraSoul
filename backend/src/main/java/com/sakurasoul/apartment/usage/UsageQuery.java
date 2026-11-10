package com.sakurasoul.apartment.usage;

import com.sakurasoul.apartment.common.Months;

import java.time.YearMonth;
import java.time.temporal.ChronoUnit;
import java.util.Arrays;
import java.util.List;
import java.util.Optional;
import java.util.function.Function;
import java.util.stream.Stream;

/**
 * คำถามของกราฟการใช้น้ำไฟ (SSK-167) หลังตรวจพารามิเตอร์ของ GET /api/usage แล้ว
 * <p>
 * ลำดับการตรวจและข้อความเหมือน usageRoute ใน backend จำลองของหน้าเว็บ (frontend/src/api/mockApi.ts)
 * metric → scope → granularity → from/to → ความยาวช่วง → roomId/floor ที่ scope ต้องใช้
 * ข้อสุดท้ายเป็นกฎของฝั่งนี้ backend จำลองไม่ตรวจแล้วไปตอบ 404 "No unit with id undefined" แทน
 *
 * @param roomId มีค่าเฉพาะ scope=room
 * @param floor  มีค่าเฉพาะ scope=floor
 */
public record UsageQuery(
        Metric metric,
        Scope scope,
        Granularity granularity,
        Long roomId,
        Short floor,
        YearMonth from,
        YearMonth to) {

    /** ช่วงยาวสุดสิบปี กราฟรายเดือนร้อยยี่สิบจุดยังอ่านออก และ SSK-181 (ภาพรวมหลายปี) ใช้ไม่เกินนี้ */
    static final int MAX_MONTHS = 120;

    public enum Metric {
        ELECTRIC("electric"),
        WATER("water");

        private final String param;

        Metric(String param) {
            this.param = param;
        }

        /** ค่าในพารามิเตอร์ metric และใน SQL ของ UsageReader */
        public String param() {
            return param;
        }
    }

    public enum Scope {
        ROOM("room"),
        FLOOR("floor"),
        BUILDING("building");

        private final String param;

        Scope(String param) {
            this.param = param;
        }
    }

    public enum Granularity {
        MONTH("month"),
        YEAR("year");

        private final String param;

        Granularity(String param) {
            this.param = param;
        }
    }

    /**
     * ตรวจพารามิเตอร์ตามลำดับ ตัวแรกที่ผิดโยน IllegalArgumentException พร้อมข้อความที่ตกลงไว้ (400)
     * granularity ไม่ส่งมาถือเป็น month เหมือน backend จำลอง roomId กับ floor ที่ scope ไม่ใช้ถูกทิ้ง
     */
    static UsageQuery parse(String metric, String scope, String granularity, Long roomId, Short floor,
            String from, String to) {
        Metric parsedMetric = byParam(Metric.values(), Metric::param, metric)
                .orElseThrow(() -> new IllegalArgumentException("metric must be electric or water"));
        Scope parsedScope = byParam(Scope.values(), value -> value.param, scope)
                .orElseThrow(() -> new IllegalArgumentException("scope must be room, floor or building"));
        Granularity parsedGranularity = byParam(Granularity.values(), value -> value.param,
                granularity == null ? Granularity.MONTH.param : granularity)
                .orElseThrow(() -> new IllegalArgumentException("granularity must be month or year"));

        String rangeMessage = "from and to must be YYYY-MM with from not after to";
        YearMonth fromMonth = Months.parse(from, rangeMessage);
        YearMonth toMonth = Months.parse(to, rangeMessage);
        if (fromMonth.isAfter(toMonth)) {
            throw new IllegalArgumentException(rangeMessage);
        }
        if (ChronoUnit.MONTHS.between(fromMonth, toMonth) + 1 > MAX_MONTHS) {
            throw new IllegalArgumentException("The range can be at most 10 years");
        }

        if (parsedScope == Scope.ROOM && roomId == null) {
            throw new IllegalArgumentException("roomId is required when scope is room");
        }
        if (parsedScope == Scope.FLOOR && floor == null) {
            throw new IllegalArgumentException("floor is required when scope is floor");
        }
        return new UsageQuery(parsedMetric, parsedScope, parsedGranularity,
                parsedScope == Scope.ROOM ? roomId : null, parsedScope == Scope.FLOOR ? floor : null,
                fromMonth, toMonth);
    }

    /** ทุกเดือนตั้งแต่ from ถึง to รวมสองปลาย */
    List<YearMonth> months() {
        return Stream.iterate(from, month -> !month.isAfter(to), month -> month.plusMonths(1)).toList();
    }

    /** id ของห้อง เลขชั้น หรือ "building" ตามสัญญา API */
    String scopeId() {
        return switch (scope) {
            case ROOM -> String.valueOf(roomId);
            case FLOOR -> String.valueOf(floor);
            case BUILDING -> "building";
        };
    }

    /** ตรงตัวพิมพ์เหมือนหน้าเว็บ "Electric" ไม่ผ่าน */
    private static <T> Optional<T> byParam(T[] values, Function<T, String> param, String text) {
        return Arrays.stream(values).filter(value -> param.apply(value).equals(text)).findFirst();
    }
}
