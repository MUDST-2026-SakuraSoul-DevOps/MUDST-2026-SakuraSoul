package com.sakurasoul.apartment.promptpay;

import com.google.zxing.BarcodeFormat;
import com.google.zxing.EncodeHintType;
import com.google.zxing.WriterException;
import com.google.zxing.common.BitMatrix;
import com.google.zxing.qrcode.QRCodeWriter;
import com.google.zxing.qrcode.decoder.ErrorCorrectionLevel;

import javax.imageio.ImageIO;
import javax.imageio.stream.ImageOutputStream;
import javax.imageio.stream.MemoryCacheImageOutputStream;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.Base64;
import java.util.Map;

/**
 * ภาพ QR ของ payload PromptPay เป็น PNG วาดในเครื่องด้วย ZXing ไม่เรียกบริการภายนอก (SSK-168)
 * <p>
 * แก้ความผิดพลาดระดับ M (กู้ได้ราว 15%) พอสำหรับกระดาษที่พิมพ์แล้วยับ ระดับที่สูงกว่าทำให้จุดเล็กลงจนสแกนยากเมื่อพิมพ์ 38 มม.
 * ขอบขาวสี่ช่องตามที่มาตรฐาน QR กำหนด ไม่ใส่ CHARACTER_SET เพราะ payload เป็น ASCII ล้วน
 * และการใส่ charset อาจเพิ่มส่วน ECI ที่แอปธนาคารบางแอปไม่รับ
 */
public final class PromptPayQr {

    /** พิมพ์ที่ 38 มม. ได้ราว 200 dpi ซึ่งคมพอสำหรับเครื่องพิมพ์ทั่วไป */
    static final int SIZE_PX = 300;

    private static final int BLACK = 0xFF000000;
    private static final int WHITE = 0xFFFFFFFF;

    private static final Map<EncodeHintType, Object> HINTS = Map.of(
            EncodeHintType.ERROR_CORRECTION, ErrorCorrectionLevel.M,
            EncodeHintType.MARGIN, 4);

    private PromptPayQr() {
    }

    /** ข้อความ error ไม่มี payload เพราะ payload มีเลข PromptPay ของเจ้าของหอ */
    public static byte[] png(String payload) {
        try {
            BitMatrix matrix = new QRCodeWriter().encode(payload, BarcodeFormat.QR_CODE, SIZE_PX, SIZE_PX, HINTS);
            BufferedImage image = new BufferedImage(matrix.getWidth(), matrix.getHeight(), BufferedImage.TYPE_BYTE_BINARY);
            for (int y = 0; y < matrix.getHeight(); y++) {
                for (int x = 0; x < matrix.getWidth(); x++) {
                    image.setRGB(x, y, matrix.get(x, y) ? BLACK : WHITE);
                }
            }
            // เขียนผ่าน stream ในหน่วยความจำ ImageIO.write ที่รับ OutputStream ตรง ๆ พักข้อมูลในไฟล์ชั่วคราวของ java.io.tmpdir
            // ถ้าวันหนึ่ง container ตั้งให้เขียนดิสก์ไม่ได้ QR จะพังทั้งที่ภาพเล็กแค่ไม่กี่กิโลไบต์
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            try (ImageOutputStream stream = new MemoryCacheImageOutputStream(out)) {
                if (!ImageIO.write(image, "png", stream)) {
                    throw new IllegalStateException("No PNG writer is available to draw the payment QR code");
                }
            }
            return out.toByteArray();
        } catch (WriterException | IOException ex) {
            throw new IllegalStateException("Could not draw the payment QR code", ex);
        }
    }

    /**
     * ภาพเป็น data: URI สำหรับใส่ใน img ของ template PDF ตรง ๆ ไม่ต้องมีไฟล์หรือ URL ให้ openhtmltopdf ไปโหลด
     * base64 บรรทัดเดียวไม่มีตัวขึ้นบรรทัด
     */
    public static String dataUri(String payload) {
        return "data:image/png;base64," + Base64.getEncoder().encodeToString(png(payload));
    }
}
