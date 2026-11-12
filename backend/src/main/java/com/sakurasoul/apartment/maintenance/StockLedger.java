package com.sakurasoul.apartment.maintenance;

import com.sakurasoul.apartment.maintenance.StockMovement.Kind;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

/**
 * ประวัติความเคลื่อนไหวของของหนึ่งชิ้นพร้อมยอดคงเหลือหลังแต่ละรายการ (SSK-171) เป็น logic ล้วน ไม่แตะฐานข้อมูล
 * <p>
 * ยอดตั้งต้น (OPENING) ย้อนคำนวณจากยอดปัจจุบันลบผลรวมของทุกรายการ ไม่ได้เก็บไว้ที่ไหน ยอดของบรรทัดสุดท้ายจึงเท่ากับ
 * stock ปัจจุบันเสมอ ถึงของจะถูกแก้ยอดไปก่อนที่ระบบจะเริ่มเก็บการปรับยอด (V20) ก็ตาม
 * สูตรเดียวกับ buildMovements ใน frontend/src/domain/supplyStock.ts
 */
final class StockLedger {

    /**
     * เรียงตามเวลา รายการที่เกิดเวลาเดียวกันเรียงตามชนิด (เติม → เบิก → ปรับยอด) ชนิดเดียวกันคงลำดับที่ส่งเข้ามา
     * ผู้เรียกส่งมาตาม id อยู่แล้ว (findBySupplyIdOrderByIdAsc) ผลจึงเหมือนเดิมทุกครั้งที่เปิดดู
     */
    private static final Comparator<Change> CHRONOLOGICAL =
            Comparator.comparing(Change::at).thenComparing(Change::kind);

    private StockLedger() {
    }

    /**
     * @param currentStock ยอดคงเหลือตอนนี้
     * @param openedAt     เวลาของบรรทัด OPENING คือเวลาที่เพิ่มของชิ้นนี้เข้าคลัง
     * @param changes      ทุกรายการที่ทำให้ยอดเปลี่ยน ลำดับไหนก็ได้
     * @return บรรทัด OPENING ตามด้วยทุกรายการ เก่าไปใหม่
     */
    static List<StockMovement> of(int currentStock, Instant openedAt, List<Change> changes) {
        List<Change> ordered = changes.stream().sorted(CHRONOLOGICAL).toList();
        int balance = currentStock - ordered.stream().mapToInt(Change::quantity).sum();

        List<StockMovement> movements = new ArrayList<>(ordered.size() + 1);
        movements.add(new StockMovement(openedAt, Kind.OPENING, balance, balance, null));
        for (Change change : ordered) {
            balance += change.quantity();
            movements.add(new StockMovement(change.at(), change.kind(), change.quantity(), balance, change.note()));
        }
        return movements;
    }

    /** รายการหนึ่งรายการก่อนคิดยอด quantity มีเครื่องหมายแล้ว บวกคือเข้า ลบคือออก */
    record Change(Instant at, Kind kind, int quantity, String note) {

        static Change restock(Instant at, int quantity) {
            return new Change(at, Kind.RESTOCK, quantity, null);
        }

        /** ตารางการเบิกเก็บจำนวนเป็นบวก ในประวัติเป็นของออกจึงติดลบ ข้อความเดียวกับที่ backend จำลองเขียน */
        static Change usage(Instant at, int quantity, long ticketId) {
            return new Change(at, Kind.USAGE, -quantity, "Maintenance ticket #" + ticketId);
        }

        static Change adjustment(Instant at, int quantity) {
            return new Change(at, Kind.ADJUSTMENT, quantity, null);
        }
    }
}
