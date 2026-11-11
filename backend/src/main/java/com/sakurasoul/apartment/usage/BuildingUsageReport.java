package com.sakurasoul.apartment.usage;

import java.math.BigDecimal;
import java.util.List;

/**
 * คำตอบของ GET /api/usage/building (SSK-181)
 * <p>
 * ทุกช่องมีเสมอ ค่าของ metric ที่ไม่ได้ขอเป็น null (ดู metric ที่ตอบกลับ) หน้าเว็บจึงใช้ type เดียวได้ทุกแบบ
 * ค่าที่ไม่มีข้อมูลเป็น null ไม่ใช่ 0 พร้อมจำนวนห้องที่มีข้อมูล ศูนย์จริงเป็น 0.00
 *
 * @param compare    "yoy" หรือ null
 * @param totalRooms ห้องในผังตึกตอนนี้ (SSK-160) ไม่ใช่ 24 ตายตัว
 */
public record BuildingUsageReport(
        String from,
        String to,
        String metric,
        String granularity,
        String compare,
        long totalRooms,
        List<Point> points,
        Summary summary) {

    /**
     * หนึ่งเดือนหรือหนึ่งปี รายปีรวมเฉพาะเดือนในช่วงที่ขอ
     *
     * @param period          YYYY-MM หรือ YYYY
     * @param occupiedRooms   ห้องที่มีคนอยู่ รายปีใช้เดือนที่มากที่สุดของปี (ตัดสิน 11 พ.ย.)
     * @param roomsWithData   ห้องที่มีค่ามิเตอร์หรือใบเสร็จ รายปีใช้เดือนที่มากที่สุด
     * @param roomsWithAmount ห้องที่มีใบเสร็จ เงินรวมเฉพาะห้องเหล่านี้ รายปีใช้เดือนที่มากที่สุด
     * @param monthsWithData  เดือนที่มีข้อมูลอย่างน้อยหนึ่งห้อง
     * @param months          จำนวนเดือนในช่วงนี้
     * @param yoy             null เมื่อไม่ได้ขอ compare=yoy
     */
    public record Point(
            String period,
            BigDecimal electricUnits,
            BigDecimal waterUnits,
            BigDecimal electricAmount,
            BigDecimal waterAmount,
            int occupiedRooms,
            int roomsWithData,
            int roomsWithAmount,
            int monthsWithData,
            int months,
            Yoy yoy) {
    }

    /**
     * เทียบกับเดือนเดียวกันของปีก่อน เดือนต่อเดือน (ตัดสิน 11 พ.ย.) นับเฉพาะเดือนที่ทั้งสองปีมีข้อมูล
     * ปีนี้ที่ยังไม่ถึง ธ.ค. จึงไม่ถูกเทียบกับ ธ.ค. ของปีก่อนจนดูเหมือนใช้น้อยลง ค่าของ metric ที่ไม่ได้ขอเป็น null
     *
     * @param previousMonthsWithData เดือนของปีก่อน (ในเดือนที่ตรงกัน) ที่มีข้อมูล
     * @param comparedMonths         เดือนที่ใช้เทียบจริง คือเดือนที่ทั้งสองปีมีข้อมูล
     */
    public record Yoy(
            String previousPeriod,
            int previousMonthsWithData,
            int comparedMonths,
            Change electricUnits,
            Change waterUnits,
            Change electricAmount,
            Change waterAmount) {
    }

    /**
     * @param previous   ผลรวมของปีก่อนในเดือนที่ใช้เทียบ ไม่มีเดือนที่ใช้เทียบได้ยอดของปีก่อนทั้งหมด (null เมื่อไม่มีข้อมูล)
     * @param difference ปีนี้ลบปีก่อนในเดือนที่ใช้เทียบ null เมื่อไม่มีเดือนที่ใช้เทียบหรือฝั่งใดไม่มีค่า
     * @param percent    difference x 100 / previous สองตำแหน่ง null เมื่อ previous เป็น 0 หรือไม่มี
     */
    public record Change(BigDecimal previous, BigDecimal difference, BigDecimal percent) {
    }

    /**
     * สรุปทั้งช่วงที่ขอ เฉลี่ยต่อเดือนหารด้วยเดือนที่มีข้อมูล ไม่ใช่ทุกเดือน
     *
     * @param peakElectric จุดที่ใช้ไฟมากที่สุด เท่ากันเอาจุดแรก null เมื่อไม่มีข้อมูล
     */
    public record Summary(
            BigDecimal electricUnits,
            BigDecimal waterUnits,
            BigDecimal electricAmount,
            BigDecimal waterAmount,
            int monthsWithData,
            int months,
            BigDecimal averageElectricUnitsPerMonth,
            BigDecimal averageWaterUnitsPerMonth,
            Peak peakElectric,
            Peak peakWater) {
    }

    public record Peak(String period, BigDecimal units) {
    }
}
