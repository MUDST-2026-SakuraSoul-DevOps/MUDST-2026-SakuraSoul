package com.sakurasoul.apartment.maintenance;

import com.sakurasoul.apartment.maintenance.LowStockAlerts.Unsent;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.mail.MailException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Instant;
import java.util.List;

/**
 * งานแจ้งเตือนของใกล้หมดทางอีเมล (SSK-171) ส่งครั้งเดียวต่อของหนึ่งชิ้นต่อการข้ามเกณฑ์หนึ่งครั้ง
 * <p>
 * หนึ่งรอบมีสามขั้น (SQL อยู่ที่ LowStockAlerts)
 * <ol>
 *   <li>ของที่ถูกเติมจนพ้นเกณฑ์แล้ว ปิดแถวแจ้งเตือนที่ยังเปิด ถ้ากลับมาใกล้หมดอีกจะได้แถวใหม่และอีเมลใหม่</li>
 *   <li>ของที่ใกล้หมดแต่ยังไม่มีแถวเปิด เปิดแถวใหม่ ของที่ยังใกล้หมดจากเมื่อวานมีแถวที่ส่งแล้ว จึงไม่ได้อีเมลซ้ำ</li>
 *   <li>แถวเปิดที่ยังไม่ได้ส่ง รวมเป็นอีเมลฉบับเดียวแล้วประทับว่าส่งแล้ว ส่งไม่ออกก็ไม่ประทับ รอบถัดไปจึงส่งใหม่</li>
 * </ol>
 *
 * <h2>สอง pod</h2>
 * k8s รัน backend สอง pod งานนี้จึงตื่นพร้อมกันสองตัว ขั้น 1 กับ 2 ทำซ้ำได้โดยไม่เกิดผลซ้ำ (ปิดแถวที่ปิดแล้วไม่ได้
 * เปิดแถวซ้ำไม่ได้เพราะ low_stock_alert_open_uk) ส่วนขั้น 3 ต้องได้สิทธิ์เป็นผู้ส่งก่อน (advisory lock ระดับ transaction
 * ที่ LowStockAlerts.claimSending) ได้ทีละ pod pod ที่ไม่ได้ข้ามขั้นนี้ไปทันที ส่วน pod ที่มาหลังจาก pod แรก commit แล้ว
 * จะไม่เหลือแถวที่ยังไม่ได้ส่ง ของทุกชิ้นจึงอยู่ในอีเมลฉบับเดียว ไม่ต้องใช้ ShedLock หรือแถวจองรอบแบบ billing_schedule_run
 * <p>
 * ขั้น 3 ส่งอีเมลขณะที่ transaction ยังถือสิทธิ์อยู่ ต่างจาก BillingScheduleService ที่จองรอบแล้ว commit ก่อนส่ง
 * ที่ทำได้เพราะสิทธิ์นี้ไม่ล็อกแถวไหน ไม่มีคำขออื่นต้องรอ (ลบของ เติมของ หรือรอบของอีก pod) และถ้า commit พัง
 * หลังอีเมลออกไปแล้ว ผลแย่สุดคือได้อีเมลซ้ำในรอบถัดไป ซึ่งดีกว่าการแจ้งเตือนหาย (ส่งอย่างน้อยหนึ่งครั้ง ไม่ใช่อย่างมากหนึ่งครั้ง)
 *
 * <h2>ข้อจำกัด</h2>
 * ตรวจวันละครั้ง ของที่ถูกเติมจนพ้นเกณฑ์แล้วกลับมาใกล้หมดอีกก่อนรอบถัดไปจะไม่ได้อีเมลใหม่ เพราะไม่มีรอบไหนเห็นมันฟื้น
 */
@Service
class LowStockAlertService {

    private static final Logger log = LoggerFactory.getLogger(LowStockAlertService.class);

    private final LowStockAlerts alerts;
    private final SupplyItemRepository supplyRepository;
    private final LowStockAlertMailer mailer;
    private final TransactionTemplate transaction;

    LowStockAlertService(LowStockAlerts alerts, SupplyItemRepository supplyRepository, LowStockAlertMailer mailer,
            PlatformTransactionManager transactionManager) {
        this.alerts = alerts;
        this.supplyRepository = supplyRepository;
        this.mailer = mailer;
        this.transaction = new TransactionTemplate(transactionManager);
    }

    /**
     * หนึ่งรอบของงานแจ้งเตือน ขั้น 1-2 commit ก่อนเริ่มส่ง pod อื่นจะได้เห็นแถวที่เปิดแล้ว
     *
     * @param now เวลาที่ประทับลงแถว ไม่มีผลกับว่าจะส่งอะไร
     * @return จำนวนรายการในอีเมลที่ส่งออกไปรอบนี้ 0 เมื่อไม่มีอะไรต้องส่ง อีก pod ส่งไปแล้ว หรือส่งไม่ออก
     */
    int run(Instant now) {
        transaction.executeWithoutResult(status -> {
            alerts.closeRecovered(now);
            alerts.openForLowStock(now);
        });
        try {
            Integer sent = transaction.execute(status -> sendUnsent(now));
            return sent == null ? 0 : sent;
        } catch (MailException ex) {
            log.warn("ส่งอีเมลแจ้งเตือนของใกล้หมดไม่ออก รายการยังรอส่งในรอบถัดไป", ex);
            return 0;
        }
    }

    /** ขั้น 3 อีเมลออกก่อนประทับ ส่งไม่ออก transaction ก็ rollback แถวยังไม่ถูกประทับ */
    private int sendUnsent(Instant now) {
        if (!alerts.claimSending()) {
            return 0;
        }
        List<Unsent> unsent = alerts.findUnsent();
        if (unsent.isEmpty()) {
            return 0;
        }
        List<SupplyItem> items = supplyRepository.findAllById(unsent.stream().map(Unsent::supplyId).toList())
                .stream()
                .sorted(SupplyItem.MOST_CRITICAL_FIRST)
                .toList();
        mailer.send(items);
        alerts.markSent(unsent.stream().map(Unsent::alertId).toList(), now);
        return items.size();
    }
}
