package com.sakurasoul.apartment.meter;

import com.sakurasoul.apartment.room.Room;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import org.hibernate.annotations.Immutable;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;

/**
 * หน่วยน้ำไฟของห้องหนึ่งในเดือนหนึ่ง (SSK-166) ดูความหมายของคอลัมน์ใน V19
 * <p>
 * {@link Immutable} เพราะฝั่ง JPA ใช้อ่านอย่างเดียว การเขียนทั้งเพิ่มและทับทำทีเดียวทั้งไฟล์ด้วย
 * INSERT ... ON CONFLICT ใน MeterReadingService ถ้าวันหนึ่งมีทางเขียนผ่าน entity ต้องเอา annotation นี้ออก
 */
@Entity
@Table(name = "meter_reading")
@Immutable
public class MeterReading {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "room_id", nullable = false)
    private Room room;

    /** วันที่ 1 ของเดือน บังคับด้วย meter_reading_month_first_day_ck */
    @Column(name = "reading_month", nullable = false)
    private LocalDate readingMonth;

    @Column(name = "electric_units", nullable = false, precision = 10, scale = 2)
    private BigDecimal electricUnits;

    @Column(name = "water_units", nullable = false, precision = 10, scale = 2)
    private BigDecimal waterUnits;

    @Enumerated(EnumType.STRING)
    @Column(name = "source", nullable = false, length = 10)
    private MeterReadingSource source;

    @Column(name = "imported_at", nullable = false)
    private Instant importedAt;

    protected MeterReading() {
    }

    public Long getId() {
        return id;
    }

    public Room getRoom() {
        return room;
    }

    public LocalDate getReadingMonth() {
        return readingMonth;
    }

    public BigDecimal getElectricUnits() {
        return electricUnits;
    }

    public BigDecimal getWaterUnits() {
        return waterUnits;
    }

    public MeterReadingSource getSource() {
        return source;
    }

    public Instant getImportedAt() {
        return importedAt;
    }
}
