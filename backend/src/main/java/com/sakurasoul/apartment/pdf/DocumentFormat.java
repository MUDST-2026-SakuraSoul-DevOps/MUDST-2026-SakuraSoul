package com.sakurasoul.apartment.pdf;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.text.DecimalFormat;
import java.text.DecimalFormatSymbols;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.Locale;

/**
 * แปลงตัวเลขกับวันที่เป็นข้อความสำหรับใส่ลงเอกสาร PDF
 *
 * <h2>ทำไมถึงฟอร์แมตในฝั่ง Java ไม่ทำใน template</h2>
 * Thymeleaf มี #numbers กับ #temporals ให้ใช้ในหน้าเว็บก็จริง แต่เอกสารพวกนี้เป็น
 * "กระดาษ" ที่ส่งให้ผู้เช่าและใช้อ้างอิงทางกฎหมาย รูปแบบตัวเลขกับวันที่จึงเป็น
 * กฎของเอกสาร ไม่ใช่เรื่องของ layout ถ้ากระจายไปอยู่ใน template สองไฟล์ วันหนึ่ง
 * ใบเสร็จกับสัญญาจะเขียนวันที่คนละแบบโดยไม่มีใครสังเกต และเทสจับไม่ได้ด้วยเพราะ
 * ของที่ออกมาเป็น PDF ไม่ใช่สตริง
 * <p>
 * อีกข้อคือ #temporals ต้องลง thymeleaf-extras-java8time เพิ่ม ซึ่งไม่ได้ติดมากับ
 * starter ของ Spring Boot 4 แล้ว
 *
 * <h2>ทำไมชื่อคลาสไม่ใช่ ThaiFormat แล้ว</h2>
 * เดิมคลาสนี้พิมพ์เงินเป็นบาทและวันที่เป็นปี พ.ศ. ชื่อจึงตรงกับงานที่ทำ รอบ SSK-105
 * ทั้งระบบเปลี่ยนเป็นอังกฤษและเงินเป็นเยน เอกสารจึงพิมพ์เป็นอังกฤษตามหน้าเว็บ
 * ชื่อ ThaiFormat จะกลายเป็นชื่อที่หลอกคนอ่าน จึงเปลี่ยนเป็น DocumentFormat
 * <p>
 * ฟอนต์ Sarabun ที่ฝังไว้ใน PDF ยังอยู่เหมือนเดิม เพราะชื่อผู้เช่ายังเป็นภาษาไทย
 * ถ้าถอดฟอนต์ออก ชื่อบนใบเสร็จกับบนสัญญาจะหายไปทั้งบรรทัดโดยไม่มี error ให้เห็น
 */
public final class DocumentFormat {

    /**
     * ชื่อเดือนย่อภาษาอังกฤษ index 1 ถึง 12 ช่อง 0 ปล่อยว่างให้ดัชนีตรงกับเลขเดือน
     * <p>
     * ใช้ชุดเดียวกับ DISPLAY_DATE ใน frontend/src/format.ts (en-GB, month: 'short')
     * เอกสารกับหน้าจอจะได้เขียนวันที่แบบเดียวกัน เช่น 11 Aug 2026
     */
    private static final String[] MONTHS = {
            "", "Jan", "Feb", "Mar", "Apr", "May", "Jun",
            "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"};

    private static final ZoneId BANGKOK = ZoneId.of("Asia/Bangkok");

    private DocumentFormat() {
    }

    /**
     * "¥3,500" มีตัวคั่นหลักพันและไม่มีทศนิยม
     * <p>
     * เยนไม่มีหน่วยย่อย การพิมพ์ ¥3,500.00 ลงใบเสร็จจึงผิดหลักและคนญี่ปุ่นอ่านแล้วสะดุด
     * กฎเดียวกับ yenAmount ใน frontend/src/format.ts แก้ที่นี่ต้องไปแก้ที่นั่นด้วย
     */
    public static String money(BigDecimal value) {
        return "¥" + grouped(value.setScale(0, RoundingMode.HALF_UP), "#,##0");
    }

    /**
     * "120" หรือ "120.5" ตัวเลขล้วนของหน่วยมิเตอร์ ไม่ใช่จำนวนเงิน จึงไม่มีสัญลักษณ์เยน
     * <p>
     * เก็บทศนิยมไว้ได้ถึงสองตำแหน่งแต่ไม่เติมศูนย์ท้าย เพราะมิเตอร์ส่วนใหญ่อ่านได้เป็น
     * จำนวนเต็ม การพิมพ์ 120.00 units ทำให้ตารางอ่านยากโดยไม่ได้ข้อมูลเพิ่ม
     */
    public static String units(BigDecimal value) {
        return grouped(value, "#,##0.##");
    }

    /** "11 Aug 2026" */
    public static String date(LocalDate date) {
        return date.getDayOfMonth() + " " + MONTHS[date.getMonthValue()] + " " + date.getYear();
    }

    /** "Aug 2026" ใช้กับเดือนที่เรียกเก็บของใบเสร็จ ซึ่งไม่มีวันในความหมาย */
    public static String monthYear(LocalDate month) {
        return MONTHS[month.getMonthValue()] + " " + month.getYear();
    }

    /** เวลาที่เก็บเป็น UTC ต้องแปลงเป็นเวลาไทยก่อนพิมพ์ เหตุผลเดียวกับ common/AppTime */
    public static String date(Instant instant) {
        return date(LocalDate.ofInstant(instant, BANGKOK));
    }

    /** วันสิ้นสุดสัญญาว่างได้ แปลว่ายังไม่กำหนด ต้องพิมพ์เป็นคำ ไม่ใช่ช่องว่างเปล่า */
    public static String dateOrDash(LocalDate date, String whenEmpty) {
        return date == null ? whenEmpty : date(date);
    }

    /*
     * สร้าง DecimalFormat ใหม่ทุกครั้งเพราะมันไม่ thread-safe และ endpoint นี้รันบน
     * virtual thread หลายเส้นพร้อมกันได้ (application.yml เปิด threads.virtual ไว้)
     *
     * ปักสัญลักษณ์ตัวเลขเป็นของ Locale.US ไว้ ไม่ปล่อยให้ตกไปใช้ locale ของเครื่อง
     * เพราะบางเครื่องที่ตั้ง locale เป็นไทยเต็มรูปแบบจะพิมพ์เลขไทย (๑๒๓) ออกมา
     * และบาง locale ในยุโรปสลับจุดกับจุลภาค ยอดเงินบนใบเสร็จจะอ่านผิดไปคนละหลัก
     */
    private static String grouped(BigDecimal value, String pattern) {
        return new DecimalFormat(pattern, DecimalFormatSymbols.getInstance(Locale.US)).format(value);
    }
}
