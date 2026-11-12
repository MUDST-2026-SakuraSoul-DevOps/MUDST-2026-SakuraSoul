package com.sakurasoul.apartment.common.csv;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.regex.Pattern;

/**
 * เขียนตารางเป็นไฟล์ CSV ที่ Excel เปิดภาษาไทยได้ (SSK-170)
 * <p>
 * UTF-8 มี BOM นำหน้า ไม่งั้น Excel บน Windows เดาว่าเป็น ANSI แล้วภาษาไทยเพี้ยน ขึ้นบรรทัดแบบ CRLF
 * ทุกแถวรวมแถวสุดท้าย และใส่ quote ตาม RFC 4180 เฉพาะเซลล์ที่ต้องใส่ คือมี comma, quote หรือขึ้นบรรทัด
 * <p>
 * เขียนเองไม่ใช้ commons-csv เพราะกฎมีแค่นี้ และ commons-csv ใช้ผ่าน LineTrackedCsv ฝั่งอ่านที่เดียว
 * ไฟล์ที่เขียนอ่านกลับด้วย LineTrackedCsv.readUtf8 ได้ค่าเดิม (CsvWriterTest คุม)
 */
public final class CsvWriter {

    private static final byte[] BYTE_ORDER_MARK = {(byte) 0xEF, (byte) 0xBB, (byte) 0xBF};

    private static final String LINE_END = "\r\n";

    /**
     * ตัวเลขธรรมดา เช่น -5.00 ไม่ใช่สูตร ไม่ต้องกัน ไม่งั้นยอดติดลบในไฟล์จะกลายเป็นข้อความใน Excel
     */
    private static final Pattern PLAIN_NUMBER = Pattern.compile("-?\\d+(\\.\\d+)?");

    private CsvWriter() {
    }

    /** ทุกแถวต่อกันเป็นไบต์ของไฟล์ แถวว่างได้บรรทัดว่าง */
    public static byte[] utf8WithBom(List<List<String>> rows) {
        StringBuilder text = new StringBuilder();
        for (List<String> row : rows) {
            for (int i = 0; i < row.size(); i++) {
                if (i > 0) {
                    text.append(',');
                }
                text.append(cell(row.get(i)));
            }
            text.append(LINE_END);
        }
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        bytes.writeBytes(BYTE_ORDER_MARK);
        bytes.writeBytes(text.toString().getBytes(StandardCharsets.UTF_8));
        return bytes.toByteArray();
    }

    /**
     * เซลล์เดียวหลังกันสูตรและใส่ quote แล้ว null เป็นเซลล์ว่าง
     * <p>
     * กันสูตร (CSV injection): เซลล์ที่ขึ้นต้นด้วย = + - @ tab หรือ CR ถูก Excel อ่านเป็นสูตร ชื่อผู้เช่าที่พิมพ์มาว่า
     * =HYPERLINK(...) จะกลายเป็นลิงก์ที่กดได้ในไฟล์ของแอดมิน ใส่ ' นำหน้าให้ Excel อ่านเป็นข้อความ ตามคำแนะนำของ OWASP
     */
    static String cell(String value) {
        if (value == null || value.isEmpty()) {
            return "";
        }
        String safe = startsLikeAFormula(value) && !PLAIN_NUMBER.matcher(value).matches() ? "'" + value : value;
        if (safe.indexOf(',') < 0 && safe.indexOf('"') < 0 && safe.indexOf('\n') < 0 && safe.indexOf('\r') < 0) {
            return safe;
        }
        return '"' + safe.replace("\"", "\"\"") + '"';
    }

    private static boolean startsLikeAFormula(String value) {
        return switch (value.charAt(0)) {
            case '=', '+', '-', '@', '\t', '\r' -> true;
            default -> false;
        };
    }
}
