package com.sakurasoul.apartment.usage;

import com.sakurasoul.apartment.common.Months;

import java.time.YearMonth;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.stream.Stream;

/**
 * ช่วงเดือนของกราฟการใช้น้ำไฟ ใช้ร่วมกันระหว่างกราฟของห้อง ชั้น ตึก (SSK-167) กับภาพรวมทั้งตึก (SSK-181)
 * ข้อความ 400 กับเพดานสิบปีจึงมีที่เดียว
 */
record UsageRange(YearMonth from, YearMonth to) {

    /** ช่วงยาวสุดสิบปี กราฟรายเดือนร้อยยี่สิบจุดยังอ่านออก */
    static final int MAX_MONTHS = 120;

    static final String RANGE_MESSAGE = "from and to must be YYYY-MM with from not after to";

    static UsageRange parse(String from, String to) {
        YearMonth fromMonth = Months.parse(from, RANGE_MESSAGE);
        YearMonth toMonth = Months.parse(to, RANGE_MESSAGE);
        if (fromMonth.isAfter(toMonth)) {
            throw new IllegalArgumentException(RANGE_MESSAGE);
        }
        if (ChronoUnit.MONTHS.between(fromMonth, toMonth) + 1 > MAX_MONTHS) {
            throw new IllegalArgumentException("The range can be at most 10 years");
        }
        return new UsageRange(fromMonth, toMonth);
    }

    /** ทุกเดือนตั้งแต่ from ถึง to รวมสองปลาย */
    List<YearMonth> months() {
        return Stream.iterate(from, month -> !month.isAfter(to), month -> month.plusMonths(1)).toList();
    }
}
