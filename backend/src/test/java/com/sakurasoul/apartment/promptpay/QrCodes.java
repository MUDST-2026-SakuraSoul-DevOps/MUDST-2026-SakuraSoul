package com.sakurasoul.apartment.promptpay;

import com.google.zxing.BinaryBitmap;
import com.google.zxing.ChecksumException;
import com.google.zxing.FormatException;
import com.google.zxing.NotFoundException;
import com.google.zxing.RGBLuminanceSource;
import com.google.zxing.common.HybridBinarizer;
import com.google.zxing.qrcode.QRCodeReader;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.UncheckedIOException;

/** ถอดรหัสภาพ QR กลับเป็นข้อความด้วย ZXing ตัวเดียวกับที่วาด ใช้ในเทสของ PNG, PDF และ API (SSK-168) */
public final class QrCodes {

    private QrCodes() {
    }

    public static String decode(byte[] png) {
        try {
            BufferedImage image = ImageIO.read(new ByteArrayInputStream(png));
            if (image == null) {
                throw new IllegalArgumentException("The bytes are not an image ImageIO can read");
            }
            return decode(image);
        } catch (IOException ex) {
            throw new UncheckedIOException(ex);
        }
    }

    public static String decode(BufferedImage image) {
        int width = image.getWidth();
        int height = image.getHeight();
        int[] pixels = image.getRGB(0, 0, width, height, null, 0, width);
        BinaryBitmap bitmap = new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(width, height, pixels)));
        try {
            return new QRCodeReader().decode(bitmap).getText();
        } catch (NotFoundException | ChecksumException | FormatException ex) {
            throw new AssertionError("The image does not hold a readable QR code", ex);
        }
    }
}
