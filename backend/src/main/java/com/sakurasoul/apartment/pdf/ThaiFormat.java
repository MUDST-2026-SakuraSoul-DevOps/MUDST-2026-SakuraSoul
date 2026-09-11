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
 * แปลงตัวเลขกับวันที่เป็นข้อความไทยสำหรับใส่ลงเอกสาร PDF
 *
 * <h2>ทำไมถึงฟอร์แมตในฝั่ง Java ไม่ทำใน template</h2>
 * Thymeleaf มี #numbers กับ #temporals ให้ใช้ในหน้าเว็บก็จริง แต่เอกสารพวกนี้เป็น
 * "กระดาษ" ที่ส่งให้ผู้เช่าและใช้อ้างอิงทางกฎหมาย รูปแบบตัวเลขกับปี พ.ศ. จึงเป็น
 * กฎของเอกสาร ไม่ใช่เรื่องของ layout ถ้ากระจายไปอยู่ใน template สองไฟล์ วันหนึ่ง
 * ใบเสร็จกับสัญญาจะเขียนวันที่คนละแบบโดยไม่มีใครสังเกต และเทสจับไม่ได้ด้วยเพราะ
 * ของที่ออกมาเป็น PDF ไม่ใช่สตริง
 * <p>
 * อีกข้อคือ #temporals ต้องลง thymeleaf-extras-java8time เพิ่ม ซึ่งไม่ได้ติดมากับ
 * starter ของ Spring Boot 4 แล้ว
 */
public final class ThaiFormat {

    /** ชื่อเดือนเต็มภาษาไทย index 1 ถึง 12 ช่อง 0 ปล่อยว่างให้ดัชนีตรงกับเลขเดือน */
    private static final String[] MONTHS = {
            "", "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
            "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"};

    /**
     * ปี พ.ศ. = ปี ค.ศ. + 543 เอกสารที่ใช้ในไทยเขียนเป็น พ.ศ. ทั้งใบเสร็จและสัญญาเช่า
     * ส่วน API กับฐานข้อมูลยังเป็น ค.ศ. ล้วน การแปลงเกิดขึ้นตรงจุดพิมพ์เท่านั้น
     */
    private static final int BUDDHIST_ERA_OFFSET = 543;

    private static final ZoneId BANGKOK = ZoneId.of("Asia/Bangkok");

    private ThaiFormat() {
    }

    /** "3,500.00" มีตัวคั่นหลักพันและทศนิยมสองตำแหน่งเสมอ ถึงจะลงท้ายด้วยศูนย์ก็ตาม */
    public static String money(BigDecimal value) {
        // สร้างใหม่ทุกครั้งเพราะ DecimalFormat ไม่ thread-safe และ endpoint นี้รันบน
        // virtual thread หลายเส้นพร้อมกันได้ (application.yml เปิด threads.virtual ไว้)
        //
        // ปักสัญลักษณ์ตัวเลขเป็นของ Locale.US ไว้ ไม่ปล่อยให้ตกไปใช้ locale ของเครื่อง
        // เพราะบางเครื่องที่ตั้ง locale เป็นไทยเต็มรูปแบบจะพิมพ์เลขไทย (๑๒๓) ออกมา
        // และบาง locale ในยุโรปสลับจุดกับจุลภาค ยอดเงินบนใบเสร็จจะอ่านผิดไปคนละหลัก
        return new DecimalFormat("#,##0.00", DecimalFormatSymbols.getInstance(Locale.US))
                .format(value.setScale(2, RoundingMode.HALF_UP));
    }

    /** "11 กันยายน 2569" */
    public static String date(LocalDate date) {
        return date.getDayOfMonth() + " " + MONTHS[date.getMonthValue()] + " "
                + (date.getYear() + BUDDHIST_ERA_OFFSET);
    }

    /** "กันยายน 2569" ใช้กับเดือนที่เรียกเก็บของใบเสร็จ ซึ่งไม่มีวันในความหมาย */
    public static String monthYear(LocalDate month) {
        return MONTHS[month.getMonthValue()] + " " + (month.getYear() + BUDDHIST_ERA_OFFSET);
    }

    /** เวลาที่เก็บเป็น UTC ต้องแปลงเป็นเวลาไทยก่อนพิมพ์ เหตุผลเดียวกับ common/AppTime */
    public static String date(Instant instant) {
        return date(LocalDate.ofInstant(instant, BANGKOK));
    }

    /** วันสิ้นสุดสัญญาว่างได้ แปลว่ายังไม่กำหนด ต้องพิมพ์เป็นคำ ไม่ใช่ช่องว่างเปล่า */
    public static String dateOrDash(LocalDate date, String whenEmpty) {
        return date == null ? whenEmpty : date(date);
    }
}
