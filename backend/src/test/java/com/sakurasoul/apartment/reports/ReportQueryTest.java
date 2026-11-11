package com.sakurasoul.apartment.reports;

import com.sakurasoul.apartment.billing.Receipt;
import com.sakurasoul.apartment.billing.ReceiptStatus;
import com.sakurasoul.apartment.lease.Lease;
import com.sakurasoul.apartment.reports.ReportQuery.GroupBy;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;

import java.time.Instant;
import java.time.YearMonth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ReportQueryTest {

    private static final String RANGE = "from and to must be YYYY-MM with from not after to";

    @Test
    @DisplayName("SSK-170 พารามิเตอร์ครบ ได้คำถามตามที่ส่ง ตัวกรองที่ไม่ได้ส่งเป็น null")
    void aValidQuery() {
        assertThat(ReportQuery.parse("month", "2026-10", "2026-11", null, null, null, null))
                .isEqualTo(new ReportQuery(GroupBy.MONTH, YearMonth.of(2026, 10), YearMonth.of(2026, 11), null,
                        null, null, null));
        assertThat(ReportQuery.parse("unit", "2026-10", "2026-10", " PAID ", (short) 2, 7L, 9L))
                .isEqualTo(new ReportQuery(GroupBy.UNIT, YearMonth.of(2026, 10), YearMonth.of(2026, 10),
                        ReceiptStatus.PAID, (short) 2, 7L, 9L));
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {"Unit", "room", " unit", "units"})
    @DisplayName("SSK-170 groupBy ที่ไม่ใช่ unit tenant month ตรงตัวพิมพ์ ได้ข้อความในสัญญา")
    void groupByMustBeExact(String groupBy) {
        assertThatThrownBy(() -> ReportQuery.parse(groupBy, "2026-10", "2026-11", null, null, null, null))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("groupBy must be unit, tenant or month");
    }

    @Test
    @DisplayName("SSK-170 groupBy ผิดถูกบอกก่อนช่วงเดือนที่ผิด")
    void groupByIsCheckedFirst() {
        assertThatThrownBy(() -> ReportQuery.parse("floor", null, null, "DONE", null, null, null))
                .hasMessage("groupBy must be unit, tenant or month");
    }

    @Test
    @DisplayName("SSK-170 from หรือ to ไม่ส่ง ว่าง ผิดรูป หรือกลับด้าน ได้ข้อความเดียวกัน")
    void fromAndToMustBeAnOrderedRange() {
        String[][] ranges = {
                {null, "2026-11"}, {"2026-10", null}, {"", "2026-11"}, {"2026-1", "2026-11"},
                {"2026-13", "2026-11"}, {"2026/10", "2026-11"}, {"2026-12", "2026-11"}};
        for (String[] range : ranges) {
            assertThatThrownBy(() -> ReportQuery.parse("unit", range[0], range[1], null, null, null, null))
                    .as("from=%s to=%s", range[0], range[1])
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessage(RANGE);
        }
    }

    @Test
    @DisplayName("SSK-170 ช่วง 120 เดือนพอดีผ่าน 121 เดือนได้ข้อความสิบปี")
    void theRangeIsAtMostTenYears() {
        assertThat(ReportQuery.parse("unit", "2017-01", "2026-12", null, null, null, null).from())
                .isEqualTo(YearMonth.of(2017, 1));
        assertThatThrownBy(() -> ReportQuery.parse("unit", "2016-12", "2026-12", null, null, null, null))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("The range can be at most 10 years");
    }

    @Test
    @DisplayName("SSK-170 status ว่างคือทุกสถานะ ค่าที่ไม่รู้จักได้ข้อความเดียวกับพิมพ์รวม หลังตรวจช่วงเดือนแล้ว")
    void statusIsParsedLast() {
        assertThat(ReportQuery.parse("unit", "2026-10", "2026-11", "  ", null, null, null).status()).isNull();
        assertThatThrownBy(() -> ReportQuery.parse("unit", "2026-10", "2026-11", "paid", null, null, null))
                .hasMessage("status must be PENDING, PARTIAL or PAID");
        assertThatThrownBy(() -> ReportQuery.parse("unit", "2026-12", "2026-11", "paid", null, null, null))
                .hasMessage(RANGE);
    }

    @Test
    @DisplayName("SSK-170 ชื่อไฟล์ CSV ตามสัญญา API")
    void fileName() {
        assertThat(ReportQuery.parse("unit", "2026-10", "2026-11", null, null, null, null).fileName())
                .isEqualTo("summary-unit-2026-10-2026-11.csv");
        assertThat(ReportQuery.parse("month", "2026-01", "2026-12", null, null, null, null).fileName())
                .isEqualTo("summary-month-2026-01-2026-12.csv");
    }

    @Test
    @DisplayName("SSK-170 ตัวกรองแต่ละตัวเทียบกับห้อง ชั้นในสำเนาของสัญญา ผู้เช่า และสถานะของใบ AND กันทุกตัว")
    void filtersMatchTheReceiptsLease() {
        Lease lease = ReportFixtures.lease(1L, 10L, "210", 2, 20L, "มานี");
        Receipt pending = ReportFixtures.receipt(lease, 1L, "2026-10", "10");
        Receipt paid = ReportFixtures.receipt(lease, 2L, "2026-11", "10");
        paid.applySettlement(paid.ownAmount(), Instant.parse("2026-12-01T00:00:00Z"), "Cash");

        assertThat(query(null, null, null, null).matches(pending)).isTrue();
        assertThat(query(ReceiptStatus.PENDING, null, null, null).matches(pending)).isTrue();
        assertThat(query(ReceiptStatus.PENDING, null, null, null).matches(paid)).isFalse();
        assertThat(query(ReceiptStatus.PAID, null, null, null).matches(paid)).isTrue();
        assertThat(query(null, (short) 2, null, null).matches(pending)).isTrue();
        assertThat(query(null, (short) 1, null, null).matches(pending)).isFalse();
        assertThat(query(null, null, 10L, null).matches(pending)).isTrue();
        assertThat(query(null, null, 11L, null).matches(pending)).isFalse();
        assertThat(query(null, null, null, 20L).matches(pending)).isTrue();
        assertThat(query(null, null, null, 21L).matches(pending)).isFalse();
        assertThat(query(ReceiptStatus.PENDING, (short) 2, 10L, 20L).matches(pending)).isTrue();
        // ห้อง 10 อยู่ชั้น 2 ขอชั้น 1 กับห้อง 10 พร้อมกันจึงไม่มีใบไหนผ่าน
        assertThat(query(null, (short) 1, 10L, null).matches(pending)).isFalse();
    }

    private static ReportQuery query(ReceiptStatus status, Short floor, Long roomId, Long tenantId) {
        return new ReportQuery(GroupBy.UNIT, YearMonth.of(2026, 10), YearMonth.of(2026, 11), status, floor, roomId,
                tenantId);
    }
}
