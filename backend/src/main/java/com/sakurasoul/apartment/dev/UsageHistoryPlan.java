package com.sakurasoul.apartment.dev;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.List;
import java.util.Random;

/**
 * แผนข้อมูลการใช้น้ำไฟย้อนหลังสามปีสำหรับเดโมกราฟทั้งตึก (SSK-181) คำนวณล้วน ไม่แตะฐานข้อมูล
 * <p>
 * seed คงที่ (181) ทุกเครื่องได้ตัวเลขชุดเดียวกัน ช่วงคือ 36 เดือน จบที่สองเดือนก่อนเดือนนี้
 * ไม่ทับเดือนก่อนกับเดือนนี้ที่ใบเสร็จตัวอย่างของ DevDataSeeder ใช้
 * <ul>
 *   <li>ห้องที่ i % 3 == 2 เริ่มช้ากว่าห้องอื่นหนึ่งปี กราฟเห็นจำนวนห้องที่มีคนอยู่เพิ่มขึ้น</li>
 *   <li>ห้องที่สองย้ายออกกลางเดือน หกเดือนก่อนจบช่วง</li>
 *   <li>ห้องแรกของแต่ละชั้น (i % 3 == 0) มีใบเสร็จทุกเดือนด้วย กราฟเงินจึงมีข้อมูล ห้องอื่นมีแต่ค่ามิเตอร์ (ตัดสิน 11 พ.ย.)
 *       ใบเสร็จออกทุกเดือนไม่เว้น เพราะใบของสัญญาต้องออกตามลำดับเดือน (SSK-164)</li>
 *   <li>ห้องที่ไม่มีใบเสร็จขาดค่ามิเตอร์บางเดือน กราฟเห็นเดือนที่ข้อมูลไม่ครบ</li>
 *   <li>หน่วยตามฤดู (เม.ย. พ.ค. ร้อน มากขึ้น ธ.ค. ม.ค. หนาว น้อยลง) โตขึ้นปีละสามเปอร์เซ็นต์ บวกความผันผวนเล็กน้อย</li>
 * </ul>
 */
final class UsageHistoryPlan {

    static final long SEED = 181L;

    static final int MONTHS = 36;

    private UsageHistoryPlan() {
    }

    /** ห้องหนึ่งห้อง: สัญญาหนึ่งใบกับหน่วยรายเดือนในช่วงสัญญา */
    record RoomHistory(int index, LocalDate start, LocalDate end, List<MonthUsage> months) {
    }

    /**
     * @param reading มีค่ามิเตอร์เดือนนี้ไหม
     * @param receipt ออกใบเสร็จเดือนนี้ไหม หน่วยในใบมากกว่าค่ามิเตอร์เล็กน้อย กราฟต้องเลือกค่ามิเตอร์
     */
    record MonthUsage(YearMonth month, BigDecimal electricUnits, BigDecimal waterUnits, boolean reading,
            boolean receipt) {
    }

    static List<RoomHistory> plan(LocalDate today, int rooms) {
        Random random = new Random(SEED);
        YearMonth last = YearMonth.from(today).minusMonths(2);
        YearMonth first = last.minusMonths(MONTHS - 1);
        List<RoomHistory> plans = new ArrayList<>();
        for (int i = 0; i < rooms; i++) {
            YearMonth startMonth = i % 3 == 2 ? first.plusYears(1) : first;
            LocalDate end = i == 1 ? last.minusMonths(6).atDay(15) : last.atEndOfMonth();
            boolean billed = i % 3 == 0;
            double baseElectric = 90 + random.nextInt(70);
            double baseWater = 8 + random.nextInt(8);
            List<MonthUsage> months = new ArrayList<>();
            for (YearMonth month = startMonth; !month.isAfter(YearMonth.from(end)); month = month.plusMonths(1)) {
                double factor = season(month) * (1 + 0.03 * (month.getYear() - first.getYear()))
                        * (0.9 + random.nextDouble() * 0.2);
                boolean reading = billed || random.nextDouble() >= 0.06;
                months.add(new MonthUsage(month, units(baseElectric * factor), units(baseWater * factor), reading,
                        billed));
            }
            plans.add(new RoomHistory(i, startMonth.atDay(1), end, List.copyOf(months)));
        }
        return List.copyOf(plans);
    }

    private static double season(YearMonth month) {
        return switch (month.getMonthValue()) {
            case 4, 5 -> 1.35;
            case 6 -> 1.2;
            case 12, 1 -> 0.8;
            default -> 1.0;
        };
    }

    private static BigDecimal units(double value) {
        return BigDecimal.valueOf(value).setScale(0, RoundingMode.HALF_UP).setScale(2, RoundingMode.UNNECESSARY);
    }
}
