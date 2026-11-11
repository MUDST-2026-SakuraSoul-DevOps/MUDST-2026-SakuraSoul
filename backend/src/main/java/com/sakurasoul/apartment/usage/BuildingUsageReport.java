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
     * เทียบกับเดือนเดียวกันของปีก่อน รายปีที่ไม่เต็มปีเทียบเดือนต่อเดือน (ม.ค.-ก.พ. 2026 กับ ม.ค.-ก.พ. 2025)
     * ค่าของ metric ที่ไม่ได้ขอเป็น null
     */
    public record Yoy(
            String previousPeriod,
            int previousMonthsWithData,
            Change electricUnits,
            Change waterUnits,
            Change electricAmount,
            Change waterAmount) {
    }

    /**
     * @param previous   null เมื่อปีก่อนไม่มีข้อมูล
     * @param difference ปีนี้ลบปีก่อน null เมื่อฝั่งใดไม่มีข้อมูล
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
