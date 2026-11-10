package com.sakurasoul.apartment.maintenance;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.util.List;

/**
 * ผู้รับอีเมลแจ้งเตือนของใกล้หมด (SSK-171) ผูกกับ app.supplies.low-stock-alert-to ซึ่งอ่านจาก APP_LOW_STOCK_ALERT_TO
 * หลายคนคั่นด้วยจุลภาค
 * <p>
 * อยู่ใน environment ไม่ใช่ apartment_config เพราะ PUT /api/apartment-config แทนค่าทั้งแถว ฟอร์มอัตราเดิมที่ไม่รู้จัก
 * ช่องนี้จะลบผู้รับทิ้งทุกครั้งที่กดบันทึก หน้าตั้งค่าผู้รับยังไม่ได้ตกลงกัน (docs/api-contract-maintenance.md)
 * <p>
 * ไม่ตั้งหรือตั้งเป็นค่าว่างได้ที่อยู่ตั้งต้น ไม่ปล่อยให้รายชื่อว่าง เพราะอีเมลที่ไม่มีผู้รับส่งไม่ออกทุกวันโดยไม่มีใครรู้
 * (หลักเดียวกับ AppMailProperties) อีเมลทุกฉบับค้างอยู่ใน Mailpit ไม่ออกนอกเครื่องอยู่แล้ว
 */
@ConfigurationProperties(prefix = "app.supplies")
public record LowStockAlertProperties(List<String> lowStockAlertTo) {

    static final String DEFAULT_RECIPIENT = "admin@sakura-soul.local";

    public LowStockAlertProperties {
        List<String> recipients = lowStockAlertTo == null ? List.of() : lowStockAlertTo.stream()
                .map(String::trim)
                .filter(address -> !address.isEmpty())
                .toList();
        lowStockAlertTo = recipients.isEmpty() ? List.of(DEFAULT_RECIPIENT) : recipients;
    }
}
