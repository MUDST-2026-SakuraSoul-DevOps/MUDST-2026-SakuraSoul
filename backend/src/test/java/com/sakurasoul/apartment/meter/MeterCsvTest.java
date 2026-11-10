package com.sakurasoul.apartment.meter;

import com.sakurasoul.apartment.meter.MeterCsv.Result;
import com.sakurasoul.apartment.meter.MeterCsv.Row;
import com.sakurasoul.apartment.meter.MeterCsv.RowError;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.YearMonth;
import java.util.Arrays;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.tuple;

/**
 * กฎของไฟล์ CSV ค่าน้ำค่าไฟ (SSK-166) ข้อความต้องตรงกับ checkMeterCsv ฝั่งหน้าเว็บทุกตัวอักษร
 * ยกเว้นกฎที่ฝั่งนี้มีเพิ่มซึ่งเขียนไว้ใน MeterCsv
 */
class MeterCsvTest {

    private static final String HEADER = "room_number,month,electric_units,water_units\n";
    private static final Set<String> ROOMS = Set.of("101", "102", "201");
    private static final YearMonth NOVEMBER = YearMonth.of(2026, 11);

    @Test
    @DisplayName("แถวที่ถูกได้ห้อง เดือน หน่วย และบรรทัดในไฟล์ หน่วยปัดเหลือสองตำแหน่ง")
    void validRowsAreParsed() {
        Result result = check(HEADER + "101,2026-11,142.5,12\n 102 , 2026-10 ,98.005,9.5\n");

        assertThat(result.errors()).isEmpty();
        assertThat(result.rows()).containsExactly(
                new Row(2, "101", NOVEMBER, new BigDecimal("142.50"), new BigDecimal("12.00")),
                new Row(3, "102", YearMonth.of(2026, 10), new BigDecimal("98.01"), new BigDecimal("9.50")));
    }

    /** ไฟล์ที่ก๊อปจาก Excel หรือหน้าเว็บมักติด NBSP มา หน้าเว็บตัดทิ้งด้วย trim ของ JavaScript ฝั่งนี้ต้องตัดเหมือนกัน */
    @Test
    @DisplayName("ช่องว่างแบบ NBSP หัวท้ายช่องถูกตัดเหมือนหน้าเว็บ ทั้งในแถวและในหัวตาราง")
    void nonBreakingSpacesAreTrimmedLikeTheWebPage() {
        Result result = check("room_number\u00A0,month,electric_units,water_units\n"
                + "101\u00A0,\u00A02026-11,142.5\u00A0,\u00A012\n");

        assertThat(result.errors()).isEmpty();
        assertThat(result.rows()).containsExactly(
                new Row(2, "101", NOVEMBER, new BigDecimal("142.50"), new BigDecimal("12.00")));
    }

    @Test
    @DisplayName("หัวตารางไม่สนตัวพิมพ์เล็กใหญ่กับช่องว่าง แต่ต้องครบสี่ช่องตามลำดับ")
    void theHeaderIsMatchedLoosely() {
        assertThat(check(" Room_Number , MONTH,Electric_Units ,water_units\n101,2026-11,1,1").rows()).hasSize(1);

        String message = "The first line must be the header room_number,month,electric_units,water_units."
                + " Download the template to see the format.";
        assertThatThrownBy(() -> check("room,month,electric_units,water_units\n101,2026-11,1,1")).hasMessage(message);
        assertThatThrownBy(() -> check("room_number,month,water_units,electric_units\n101,2026-11,1,1"))
                .hasMessage(message);
        assertThatThrownBy(() -> check("room_number,month,electric_units,water_units,note\n101,2026-11,1,1,x"))
                .hasMessage(message);
        assertThatThrownBy(() -> check("")).hasMessage(message);
    }

    @Test
    @DisplayName("ไฟล์ที่มีแต่หัวตารางหรือมีแต่บรรทัดว่างตามมาได้ 400 ไม่มีแถวข้อมูล")
    void aFileWithoutDataRowsIsRejected() {
        assertThatThrownBy(() -> check(HEADER)).hasMessage("The file has no data rows.");
        assertThatThrownBy(() -> check(HEADER + "\n,,,\n  \n")).hasMessage("The file has no data rows.");
    }

    @Test
    @DisplayName("รับได้ 5,000 แถวพอดี แถวที่ 5,001 ทำให้ทั้งไฟล์ถูกปฏิเสธ")
    void atMost5000RowsAreAccepted() {
        assertThat(check(HEADER + "101,2026-11,1,1\n".repeat(5_000)).errors()).hasSize(4_999);

        assertThatThrownBy(() -> check(HEADER + "101,2026-11,1,1\n".repeat(5_001)))
                .hasMessage("The file has more than 5,000 rows. Split it into smaller files.");
    }

    @Test
    @DisplayName("ไฟล์ใหญ่เกิน 1,000,000 ไบต์ได้ 400 ก่อนอ่านอะไรเลย ถึงเนื้อในจะผิดรูปแบบก็ตาม")
    void filesOver1MegabyteAreRejectedFirst() {
        byte[] exactlyAtTheLimit = (HEADER + "101,2026-11,1,1\n").getBytes(StandardCharsets.UTF_8);
        assertThat(MeterCsv.check(pad(exactlyAtTheLimit, MeterCsv.MAX_BYTES), ROOMS, NOVEMBER).rows()).hasSize(1);

        byte[] oneByteOver = new byte[MeterCsv.MAX_BYTES + 1];
        assertThatThrownBy(() -> MeterCsv.check(oneByteOver, ROOMS, NOVEMBER))
                .hasMessage("The file is larger than 1 MB");
    }

    @ParameterizedTest(name = "{0} -> {1}")
    @CsvSource(delimiter = '|', value = {
            "101,2026-11,1                   | Expected 4 columns but found 3",
            "101,2026-11,1,1,1               | Expected 4 columns but found 5",
            "999,2026-11,1,1                 | Unit 999 does not exist",
            ",2026-11,1,1                    | Unit (blank) does not exist",
            "101,11/2026,1,1                 | Month \"11/2026\" must be YYYY-MM",
            "101,2026-13,1,1                 | Month \"2026-13\" must be YYYY-MM",
            "101,2026-12,1,1                 | Month 2026-12 is in the future",
            "101,2099-01,1,1                 | Month 2099-01 is in the future",
            "101,2026-11,-1,1                | Units must be numbers that are zero or more",
            "101,2026-11,1e3,1               | Units must be numbers that are zero or more",
            "101,2026-11,1,.5                | Units must be numbers that are zero or more",
            "101,2026-11,\"1,000\",1         | Units must be numbers that are zero or more",
            "101,2026-11,1,                  | Units must be numbers that are zero or more",
            "101,2026-11,1000000.01,1        | Units are too high",
            // ผิดหลายช่องได้ข้อความของช่องแรกตามลำดับ ห้อง → เดือน → เดือนอนาคต → หน่วย
            "999,13/2026,-1,-1               | Unit 999 does not exist",
            "101,2099-01,-1,-1               | Month 2099-01 is in the future",
    })
    @DisplayName("แถวที่ผิดได้ข้อความของปัญหาแรกในแถว พร้อมเลขบรรทัด")
    void invalidRowsReportTheirFirstProblem(String row, String message) {
        Result result = check(HEADER + row);

        assertThat(result.rows()).isEmpty();
        assertThat(result.errors()).containsExactly(new RowError(2, message));
    }

    @Test
    @DisplayName("เดือนปัจจุบันกับหน่วยศูนย์และหน่วยล้านพอดีรับได้")
    void boundariesAreAccepted() {
        assertThat(check(HEADER + "101,2026-11,0,1000000").errors()).isEmpty();
    }

    /**
     * ช่องหน่วยยาวผิดปกติต้องไม่ถูกแปลงทั้งก้อน (ไฟล์หนึ่งล้านไบต์ทั้งช่องกิน CPU หลายวินาที)
     * แต่ผลต้องเท่ากับการแปลงทั้งก้อน: เลขศูนย์นำหน้าไม่นับหลัก และปัดครึ่งขึ้นดูแค่หลักที่สาม
     */
    @Test
    @DisplayName("หน่วยที่ยาวผิดปกติได้ผลเหมือนแปลงทั้งก้อน ศูนย์นำหน้าไม่นับ จำนวนเต็มเกินเจ็ดหลักสูงเกิน ทศนิยมยาวปัดถูก")
    void longUnitValuesAreHandledWithoutParsingThemWhole() {
        Result result = check(HEADER
                + "101,2026-11," + "0".repeat(50_000) + "12.5,1\n"
                + "102,2026-11,1." + "9".repeat(50_000) + ",1.2349999\n"
                + "201,2026-11,1.235,0.005\n"
                + "101,2026-10," + "9".repeat(50_000) + ",1\n");

        assertThat(result.rows()).extracting(Row::electricUnits, Row::waterUnits).containsExactly(
                tuple(new BigDecimal("12.50"), new BigDecimal("1.00")),
                tuple(new BigDecimal("2.00"), new BigDecimal("1.23")),
                tuple(new BigDecimal("1.24"), new BigDecimal("0.01")));
        assertThat(result.errors()).containsExactly(new RowError(5, "Units are too high"));
        assertThat(check(HEADER + "101,2026-11,12345678,1").errors())
                .containsExactly(new RowError(2, "Units are too high"));
    }

    @Test
    @DisplayName("ห้องกับเดือนซ้ำในไฟล์ แถวแรกผ่าน แถวหลังได้ error แถวที่ผิดตั้งแต่แรกไม่นับเป็นการซ้ำ")
    void duplicatesAreReportedOnTheLaterRow() {
        Result result = check(HEADER + "201,2026-11,-1,1\n201,2026-11,5,1\n201,2026-11,6,1\n201,2026-10,7,1");

        assertThat(result.rows()).extracting(Row::line).containsExactly(3, 5);
        assertThat(result.errors()).containsExactly(
                new RowError(2, "Units must be numbers that are zero or more"),
                new RowError(4, "Unit 201 for 2026-11 appears more than once in the file"));
    }

    @Test
    @DisplayName("เลขบรรทัดของ error นับบรรทัดว่างกับค่าหลายบรรทัดด้วย")
    void errorLinesFollowTheFile() {
        Result result = check(HEADER + "\n\"10\n1\",2026-11,1,1\n999,2026-11,1,1");

        assertThat(result.errors()).containsExactly(
                new RowError(3, "Unit 10\n1 does not exist"),
                new RowError(5, "Unit 999 does not exist"));
    }

    private static Result check(String csv) {
        return MeterCsv.check(csv.getBytes(StandardCharsets.UTF_8), ROOMS, NOVEMBER);
    }

    /** เติมบรรทัดว่างท้ายไฟล์จนยาวเท่า size พอดี บรรทัดว่างถูกข้ามจึงไม่เปลี่ยนแถว */
    private static byte[] pad(byte[] content, int size) {
        byte[] padded = new byte[size];
        System.arraycopy(content, 0, padded, 0, content.length);
        Arrays.fill(padded, content.length, size, (byte) '\n');
        return padded;
    }
}
