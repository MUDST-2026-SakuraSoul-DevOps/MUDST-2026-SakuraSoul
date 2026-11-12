package com.sakurasoul.apartment.roomrate;

import com.fasterxml.jackson.annotation.JsonFormat;
import com.sakurasoul.apartment.common.Months;

import java.math.BigDecimal;
import java.time.Instant;

/** รูปร่าง JSON ของอัตราต่อห้อง ตรงกับ RoomRate / RoomRateRequest ใน frontend/src/api/types.ts */
public final class RoomRateDtos {

    private RoomRateDtos() {
    }

    /**
     * body ของ POST /api/rooms/{id}/rates
     * <p>
     * effectiveFrom เป็นสตริง "YYYY-MM" และเงินเป็น BigDecimal ที่ว่างได้ ไม่ติด bean validation
     * เพราะ RoomRateRules เป็นคนตอบข้อความ 400 ทั้งหมด ให้ลำดับการตรวจกับข้อความตรงกับ validateRoomRate ฝั่งหน้าเว็บ
     */
    public record RoomRateRequest(
            String effectiveFrom,
            BigDecimal monthlyRent,
            BigDecimal electricRatePerUnit,
            BigDecimal waterRatePerUnit,
            BigDecimal commonAreaFee,
            BigDecimal internetFee,
            String note) {
    }

    public record RoomRateResponse(
            Long id,
            Long roomId,
            String effectiveFrom,
            BigDecimal monthlyRent,
            BigDecimal electricRatePerUnit,
            BigDecimal waterRatePerUnit,
            BigDecimal commonAreaFee,
            BigDecimal internetFee,
            String note,
            @JsonFormat(shape = JsonFormat.Shape.STRING,
                    pattern = "yyyy-MM-dd'T'HH:mm:ss.SSSX", timezone = "UTC")
            Instant createdAt) {

        public static RoomRateResponse of(RoomRate rate) {
            return new RoomRateResponse(rate.getId(), rate.getRoom().getId(), Months.format(rate.getEffectiveFrom()),
                    rate.getMonthlyRent(), rate.getElectricRatePerUnit(), rate.getWaterRatePerUnit(),
                    rate.getCommonAreaFee(), rate.getInternetFee(), rate.getNote(), rate.getCreatedAt());
        }
    }
}
