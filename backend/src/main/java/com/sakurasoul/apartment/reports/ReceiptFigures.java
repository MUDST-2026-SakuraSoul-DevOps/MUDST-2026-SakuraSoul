package com.sakurasoul.apartment.reports;

import com.sakurasoul.apartment.billing.LeaseAccount;
import com.sakurasoul.apartment.billing.Receipt;
import com.sakurasoul.apartment.lease.Lease;

import java.math.BigDecimal;
import java.time.YearMonth;

/**
 * ตัวเลขของใบเสร็จหนึ่งใบในรายงานสรุป (SSK-170) พร้อมสิ่งที่ใช้จัดกลุ่ม
 * <p>
 * ทุกตัวเลขอ่านจากสำเนาในใบ ใบเก่าจึงได้ตัวเลขที่ออกไปจริงแม้อัตราจะเปลี่ยนไปแล้ว
 * <ul>
 *   <li>billed คือ Receipt.ownAmount ค่าใช้จ่ายของเดือนกับดอกเบี้ย <b>ไม่รวมยอดยกมา</b>
 *       ไม่งั้นหนี้ก้อนเดียวถูกนับซ้ำทุกเดือนที่ถูกยก</li>
 *   <li>received กับ outstanding มาจากบัญชีของสัญญา (LeaseAccount) ตัวเดียวกับที่ใบเสร็จและ /api/debts ใช้
 *       คือเงินที่ถูกตัดเข้าใบนี้จริง ไม่ใช่เงินที่รับเข้ามาในเดือนนั้น</li>
 * </ul>
 * ห้องกับชั้นอ่านจากสำเนาในสัญญา (SSK-180) แบบเดียวกับเลขห้องที่พิมพ์บนใบ ชื่อผู้เช่าเป็นชื่อปัจจุบัน
 * แบบเดียวกับใบเสร็จและหน้าหนี้ค้าง
 */
record ReceiptFigures(String roomNumber, short floor, long tenantId, String tenantName, YearMonth month,
        ReportTotals totals) {

    /**
     * @param extraCharges ผลรวมบรรทัดค่าใช้จ่ายพิเศษของใบนี้ อ่านด้วยคิวรีรวมแทน receipt.getLines()
     *                     เพื่อไม่ให้การโหลดบรรทัดทีละชุดโตตามจำนวนใบ
     * @throws IllegalStateException ถ้าเจ็ดช่องรวมกันไม่เท่ากับยอดของใบ แปลว่าใบเสียหรือคิวรีบรรทัดผิด
     *                               ตัวเลขในรายงานจะไม่ตรงกับใบ จึงไม่ตอบรายงานที่ผิดแบบเงียบ ๆ
     */
    static ReceiptFigures of(Receipt receipt, LeaseAccount account, BigDecimal extraCharges) {
        BigDecimal billed = receipt.ownAmount();
        BigDecimal received = account.settledAmount(receipt);
        ReportTotals totals = new ReportTotals(1,
                receipt.getMonthlyRent(),
                receipt.getElectricUnits(),
                receipt.getElectricAmount(),
                receipt.getWaterUnits(),
                receipt.getWaterAmount(),
                receipt.getCommonAreaFee(),
                receipt.getInternetFee(),
                extraCharges,
                receipt.getInterestAmount(),
                billed,
                received,
                account.outstandingAmount(receipt));
        if (totals.parts().compareTo(billed) != 0) {
            throw new IllegalStateException("Receipt " + receipt.getReceiptNo() + " bills " + billed
                    + " but its parts add up to " + totals.parts());
        }
        Lease lease = receipt.getLease();
        return new ReceiptFigures(lease.getRoomSnapshot().getRoomNumber(), lease.getRoomSnapshot().getFloor(),
                lease.getTenant().getId(), lease.getTenant().getFullName(), YearMonth.from(receipt.getBillingMonth()),
                totals);
    }
}
