package com.sakurasoul.apartment.promptpay;

import java.nio.charset.StandardCharsets;

/**
 * CRC-16/CCITT-FALSE ที่มาตรฐาน EMV QR (Thai QR Payment) ใช้ปิดท้าย payload ในช่อง 63 (SSK-168)
 * <p>
 * polynomial 0x1021 ค่าเริ่ม 0xFFFF ไม่กลับลำดับบิตทั้งขาเข้าและขาออก และไม่ XOR ตอนจบ
 * ค่าตรวจมาตรฐานของ "123456789" คือ 0x29B1 ตัวที่หน้าตาคล้ายกันแต่เริ่มที่ 0x0000 (XMODEM)
 * หรือกลับบิต (KERMIT) ได้ค่าอื่น แอปธนาคารจะอ่าน QR ไม่ผ่านทั้งที่ข้อความข้างในถูกหมด
 */
public final class Crc16Ccitt {

    private static final int POLYNOMIAL = 0x1021;
    private static final int INITIAL = 0xFFFF;

    private Crc16Ccitt() {
    }

    /** payload ของ PromptPay เป็น ASCII ล้วน (ตัวเลข ตัวอักษรอังกฤษ และจุด) จึงคิดทีละไบต์ของ US-ASCII */
    public static int of(String ascii) {
        int crc = INITIAL;
        for (byte b : ascii.getBytes(StandardCharsets.US_ASCII)) {
            crc ^= (b & 0xFF) << 8;
            for (int bit = 0; bit < 8; bit++) {
                crc = (crc & 0x8000) != 0 ? (crc << 1) ^ POLYNOMIAL : crc << 1;
                crc &= 0xFFFF;
            }
        }
        return crc;
    }

    /** สี่หลักฐานสิบหกตัวพิมพ์ใหญ่ เติมศูนย์ข้างหน้า ("03CF" ไม่ใช่ "3CF") เพราะช่อง 63 ยาว 4 เสมอ */
    public static String hex(String ascii) {
        return String.format("%04X", of(ascii));
    }
}
