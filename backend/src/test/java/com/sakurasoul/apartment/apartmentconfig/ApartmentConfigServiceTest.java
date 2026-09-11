package com.sakurasoul.apartment.apartmentconfig;

import com.sakurasoul.apartment.apartmentconfig.ApartmentConfigDtos.ApartmentConfigRequest;
import com.sakurasoul.apartment.apartmentconfig.ApartmentConfigDtos.ApartmentConfigResponse;
import com.sakurasoul.apartment.common.NotFoundException;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * เทสของ US-16 ฝั่ง service
 * <p>
 * ไม่แตะ database ปลอม repository เอา ส่วนกฎการตรวจค่าอยู่ที่ ApartmentConfigRulesTest
 * ที่นี่พิสูจน์แค่ว่า service เรียกกฎนั้นจริงและแปลงผลเป็น exception ที่ถูกชนิด
 */
@ExtendWith(MockitoExtension.class)
class ApartmentConfigServiceTest {

    private static final short SINGLETON_ID = 1;

    @Mock
    private ApartmentConfigRepository apartmentConfigRepository;

    @InjectMocks
    private ApartmentConfigService apartmentConfigService;

    @Test
    @DisplayName("อ่านอัตราต้องได้ครบทุกช่องรวมเวลาที่แก้ล่าสุด")
    void getReturnsEveryField() {
        Instant stamped = Instant.parse("2026-09-06T08:15:30.123Z");
        when(apartmentConfigRepository.findById(SINGLETON_ID))
                .thenReturn(Optional.of(config("8", "18", "300", "250", stamped)));

        ApartmentConfigResponse response = apartmentConfigService.get();

        assertThat(response.electricRatePerUnit()).isEqualByComparingTo("8");
        assertThat(response.waterRatePerUnit()).isEqualByComparingTo("18");
        assertThat(response.commonAreaFee()).isEqualByComparingTo("300");
        assertThat(response.internetFee()).isEqualByComparingTo("250");
        assertThat(response.updatedAt()).isEqualTo(stamped);
    }

    @Test
    @DisplayName("ไม่มีแถวในตารางต้องได้ NotFoundException ไม่ใช่สร้างแถวใหม่เงียบ ๆ")
    void getThrowsWhenRowMissing() {
        when(apartmentConfigRepository.findById(SINGLETON_ID)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> apartmentConfigService.get())
                .isInstanceOf(NotFoundException.class)
                .hasMessageContaining("apartment config");
    }

    @Test
    @DisplayName("บันทึกอัตราใหม่แล้วค่าต้องเปลี่ยนจริงและเวลาที่แก้ล่าสุดต้องเป็นตอนนี้")
    void updateAppliesNewRatesAndStampsNow() {
        Instant startedAt = Instant.now().truncatedTo(ChronoUnit.MILLIS);
        ApartmentConfig config = config("8", "18", "300", "250", Instant.parse("2026-01-01T00:00:00Z"));
        when(apartmentConfigRepository.findById(SINGLETON_ID)).thenReturn(Optional.of(config));

        ApartmentConfigResponse response = apartmentConfigService.update(
                request("12.50", "22", "350", "0"));

        assertThat(response.electricRatePerUnit()).isEqualByComparingTo("12.50");
        assertThat(response.waterRatePerUnit()).isEqualByComparingTo("22");
        assertThat(response.commonAreaFee()).isEqualByComparingTo("350");
        assertThat(response.internetFee()).isEqualByComparingTo("0");
        assertThat(response.updatedAt()).isNotNull();
        assertThat(response.updatedAt()).isAfterOrEqualTo(startedAt);

        // ต้อง flush ตั้งแต่ยังอยู่ใน service ไม่ใช่รอ commit หลัง controller ตอบไปแล้ว
        verify(apartmentConfigRepository).saveAndFlush(config);
    }

    @Test
    @DisplayName("อัตราที่มีทศนิยมเกินสองตำแหน่งต้องถูกปัดให้ตรงกับที่ NUMERIC(10,2) เก็บจริง")
    void updateRoundsRatesToTwoDecimals() {
        ApartmentConfig config = config("8", "18", "300", "250", Instant.parse("2026-01-01T00:00:00Z"));
        when(apartmentConfigRepository.findById(SINGLETON_ID)).thenReturn(Optional.of(config));

        ApartmentConfigResponse response = apartmentConfigService.update(
                request("8.005", "18.994", "300", "250"));

        // ถ้าไม่ปัดเอง response จะบอก 8.005 แต่ GET รอบถัดไปได้ 8.01 เหมือนระบบแอบเปลี่ยนค่า
        assertThat(response.electricRatePerUnit()).isEqualTo(new BigDecimal("8.01"));
        assertThat(response.waterRatePerUnit()).isEqualTo(new BigDecimal("18.99"));
    }

    @Test
    @DisplayName("อัตราติดลบต้องได้ 400 พร้อมข้อความอังกฤษ โดยไม่ไปแตะแถวในฐานเลยสักครั้ง")
    void updateRejectsNegativeRateBeforeTouchingTheRow() {
        assertThatThrownBy(() -> apartmentConfigService.update(request("-1", "18", "300", "250")))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("Electricity rate per unit cannot be negative");

        // ตรวจให้ผ่านก่อนถึงจะโหลดของเดิมมาแก้ ค่าที่ผิดจึงไม่มีทางไปถึงฐานข้อมูล
        verify(apartmentConfigRepository, never()).findById(any());
    }

    @Test
    @DisplayName("อัตราเกินเพดานต้องโดนปฏิเสธเหมือนกัน")
    void updateRejectsRateOverTheCap() {
        assertThatThrownBy(() -> apartmentConfigService.update(request("9999999", "18", "300", "250")))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("is too high");
    }

    private static ApartmentConfigRequest request(String electric, String water,
            String commonArea, String internet) {
        return new ApartmentConfigRequest(new BigDecimal(electric), new BigDecimal(water),
                new BigDecimal(commonArea), new BigDecimal(internet));
    }

    private static ApartmentConfig config(String electric, String water, String commonArea,
            String internet, Instant updatedAt) {
        ApartmentConfig config = new ApartmentConfig();
        // แถวนี้มาจาก migration ตอนเทสเลยต้องประกอบเอง
        ReflectionTestUtils.setField(config, "id", SINGLETON_ID);
        config.apply(new BigDecimal(electric), new BigDecimal(water), new BigDecimal(commonArea),
                new BigDecimal(internet), updatedAt);
        return config;
    }
}
