package com.sakurasoul.apartment.usage;

import java.math.BigDecimal;
import java.time.YearMonth;

/**
 * ยอดของทั้งตึกหนึ่งเดือนจากฐานข้อมูล (SSK-181) หนึ่งแถวต่อเดือนเสมอ รวมเดือนที่ไม่มีข้อมูล
 *
 * @param occupiedRooms   ห้องที่มีสัญญาคาบเกี่ยวเดือนนั้น (กฎเดียวกับที่ออกใบเสร็จได้)
 * @param electricUnits   null เมื่อไม่มีห้องไหนมีข้อมูล ศูนย์จริงเป็น 0.00
 * @param electricAmount  เงินจากใบเสร็จเท่านั้น null เมื่อไม่มีใบเลย
 * @param roomsWithData   ห้องที่มีค่ามิเตอร์หรือใบเสร็จเดือนนั้น
 * @param roomsWithAmount ห้องที่มีใบเสร็จเดือนนั้น
 */
record BuildingMonth(YearMonth month, int occupiedRooms, BigDecimal electricUnits, BigDecimal waterUnits,
        BigDecimal electricAmount, BigDecimal waterAmount, int roomsWithData, int roomsWithAmount) {

    static BuildingMonth empty(YearMonth month) {
        return new BuildingMonth(month, 0, null, null, null, null, 0, 0);
    }
}
