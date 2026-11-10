package com.sakurasoul.apartment.maintenance;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Collection;
import java.util.List;

/**
 * แถวของตาราง low_stock_alert สำหรับสามขั้นของงานแจ้งเตือนของใกล้หมด (SSK-171 ลำดับขั้นอยู่ที่ LowStockAlertService)
 * <p>
 * เป็น SQL ตรงทั้งหมด เพราะแต่ละขั้นเป็นคำสั่งเดียวที่แตะหลายแถว และต้องใช้ ON CONFLICT กับ advisory lock ของ PostgreSQL
 * ซึ่ง JPQL ไม่มี ทุกคำสั่งรันพร้อมกันจากสอง pod ได้โดยไม่เกิดแถวซ้ำหรืออีเมลซ้ำ
 * <p>
 * เกณฑ์ใกล้หมดใน SQL ({@code stock <= min_stock} และกลับกัน {@code stock > min_stock}) ต้องตรงกับ SupplyItem.isLowStock
 */
@Repository
class LowStockAlerts {

    /** ขั้นที่ 1 pod ที่มาทีหลังรอแถวที่ pod แรกแก้อยู่ แล้วเห็นว่าแถวปิดไปแล้วจึงข้าม */
    private static final String CLOSE_RECOVERED = """
            UPDATE low_stock_alert a
            SET recovered_at = :now
            FROM supply_item s
            WHERE s.id = a.supply_id
              AND a.recovered_at IS NULL
              AND s.stock > s.min_stock
            """;

    /**
     * ขั้นที่ 2 ของที่มีแถวเปิดอยู่แล้ว (แจ้งไปแล้วหรือยังรอส่ง) ชน low_stock_alert_open_uk แล้วถูกข้าม
     * เงื่อนไขเดียวกันนี้กันไม่ให้สอง pod เปิดแถวของของชิ้นเดียวกันซ้ำ
     */
    private static final String OPEN_FOR_LOW_STOCK = """
            INSERT INTO low_stock_alert (supply_id, crossed_at)
            SELECT s.id, :now
            FROM supply_item s
            WHERE s.stock <= s.min_stock
            ON CONFLICT (supply_id) WHERE recovered_at IS NULL DO NOTHING
            """;

    /**
     * ขั้นที่ 3 ขอสิทธิ์เป็นผู้ส่งของรอบนี้ ได้ทีละ transaction ทั้งระบบ ไม่ได้ก็ตอบ false ทันที ไม่รอ
     * <p>
     * เป็น advisory lock ระดับ transaction ปล่อยเองตอน commit หรือ rollback ไม่ค้างกับ connection ใน pool
     * กุญแจคือ hash ของชื่อตาราง ไม่ชนกับงานอื่นเพราะไม่มีโค้ดอื่นในระบบใช้ advisory lock
     * <p>
     * ล็อกทั้งขั้นแทนการล็อกทีละแถว (FOR UPDATE SKIP LOCKED) เพราะการล็อกทีละแถวให้สอง pod แบ่งแถวกันได้
     * ถ้าการไล่ล็อกสลับกันพอดี ได้อีเมลสองฉบับที่รายการไม่ซ้ำกัน และแถวที่ถูกล็อกค้างไว้ระหว่างส่งอีเมล
     * ทำให้การลบของชิ้นนั้น (ON DELETE CASCADE) ต้องรอ ล็อกแบบนี้ไม่ล็อกแถวไหนเลย
     */
    private static final String CLAIM_SENDING = "SELECT pg_try_advisory_xact_lock(hashtext('low_stock_alert'))";

    private static final String FIND_UNSENT = """
            SELECT a.id, a.supply_id
            FROM low_stock_alert a
            WHERE a.recovered_at IS NULL
              AND a.sent_at IS NULL
            ORDER BY a.id
            """;

    private static final String MARK_SENT = "UPDATE low_stock_alert SET sent_at = :now WHERE id IN (:ids)";

    private final JdbcClient jdbc;

    LowStockAlerts(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /** @return จำนวนแถวที่ปิด */
    int closeRecovered(Instant now) {
        return jdbc.sql(CLOSE_RECOVERED).param("now", utc(now)).update();
    }

    /** @return จำนวนแถวที่เปิดใหม่ */
    int openForLowStock(Instant now) {
        return jdbc.sql(OPEN_FOR_LOW_STOCK).param("now", utc(now)).update();
    }

    /**
     * ต้องเรียกใน transaction ที่จะส่งอีเมล สิทธิ์อยู่ถึงตอน commit หรือ rollback
     *
     * @return false เมื่ออีก pod กำลังส่งอยู่
     */
    boolean claimSending() {
        return Boolean.TRUE.equals(jdbc.sql(CLAIM_SENDING).query(Boolean.class).single());
    }

    /** แถวเปิดที่ยังไม่ได้ส่ง เรียกหลัง claimSending ได้ true แล้วเท่านั้น */
    List<Unsent> findUnsent() {
        return jdbc.sql(FIND_UNSENT)
                .query((row, number) -> new Unsent(row.getLong("id"), row.getLong("supply_id")))
                .list();
    }

    void markSent(Collection<Long> alertIds, Instant now) {
        jdbc.sql(MARK_SENT).param("ids", alertIds).param("now", utc(now)).update();
    }

    /** ส่งเป็น OffsetDateTime ที่ UTC ให้ driver ไม่ต้องเดาเขตเวลา (แบบเดียวกับ MeterReadingService) */
    private static OffsetDateTime utc(Instant instant) {
        return instant.atOffset(ZoneOffset.UTC);
    }

    /** แถวเปิดที่ยังไม่ได้ส่ง */
    record Unsent(long alertId, long supplyId) {
    }
}
