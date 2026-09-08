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
import java.time.LocalDate;
import java.time.ZoneId;
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
    @DisplayName("อ่านอัตราต้องได้ครบทุกช่องรวมวันที่แก้ล่าสุด")
    void getReturnsEveryField() {
        when(apartmentConfigRepository.findById(SINGLETON_ID))
                .thenReturn(Optional.of(config("8", "18", "300", "250", LocalDate.of(2026, 9, 6))));

        ApartmentConfigResponse response = apartmentConfigService.get();

        assertThat(response.electricRatePerUnit()).isEqualByComparingTo("8");
        assertThat(response.waterRatePerUnit()).isEqualByComparingTo("18");
        assertThat(response.commonAreaFee()).isEqualByComparingTo("300");
        assertThat(response.internetFee()).isEqualByComparingTo("250");
        assertThat(response.updatedAt()).isEqualTo(LocalDate.of(2026, 9, 6));
    }

    @Test
    @DisplayName("ไม่มีแถวในตารางต้องได้ NotFoundException ไม่ใช่สร้างแถวใหม่เงียบ ๆ")
    void getThrowsWhenRowMissing() {
        when(apartmentConfigRepository.findById(SINGLETON_ID)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> apartmentConfigService.get())
                .isInstanceOf(NotFoundException.class)
                .hasMessageContaining("อัตราค่าสาธารณูปโภค");
    }

    @Test
    @DisplayName("บันทึกอัตราใหม่แล้วค่าต้องเปลี่ยนจริงและวันที่แก้ล่าสุดเป็นวันนี้ตามเวลาไทย")
    void updateAppliesNewRatesAndStampsToday() {
        ApartmentConfig config = config("8", "18", "300", "250", LocalDate.of(2026, 1, 1));
        when(apartmentConfigRepository.findById(SINGLETON_ID)).thenReturn(Optional.of(config));

        ApartmentConfigResponse response = apartmentConfigService.update(
                request("12.50", "22", "350", "0"));

        assertThat(response.electricRatePerUnit()).isEqualByComparingTo("12.50");
        assertThat(response.waterRatePerUnit()).isEqualByComparingTo("22");
        assertThat(response.commonAreaFee()).isEqualByComparingTo("350");
        assertThat(response.internetFee()).isEqualByComparingTo("0");
        assertThat(response.updatedAt()).isEqualTo(LocalDate.now(ZoneId.of("Asia/Bangkok")));
    }

    @Test
    @DisplayName("อัตราติดลบต้องได้ 400 พร้อมข้อความไทย โดยไม่ไปแตะแถวในฐานเลยสักครั้ง")
    void updateRejectsNegativeRateBeforeTouchingTheRow() {
        assertThatThrownBy(() -> apartmentConfigService.update(request("-1", "18", "300", "250")))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("ค่าไฟต่อหน่วย ต้องไม่ติดลบ");

        // ตรวจให้ผ่านก่อนถึงจะโหลดของเดิมมาแก้ ค่าที่ผิดจึงไม่มีทางไปถึงฐานข้อมูล
        verify(apartmentConfigRepository, never()).findById(any());
    }

    @Test
    @DisplayName("อัตราเกินเพดานต้องโดนปฏิเสธเหมือนกัน")
    void updateRejectsRateOverTheCap() {
        assertThatThrownBy(() -> apartmentConfigService.update(request("9999999", "18", "300", "250")))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("สูงเกินไป");
    }

    private static ApartmentConfigRequest request(String electric, String water,
            String commonArea, String internet) {
        return new ApartmentConfigRequest(new BigDecimal(electric), new BigDecimal(water),
                new BigDecimal(commonArea), new BigDecimal(internet));
    }

    private static ApartmentConfig config(String electric, String water, String commonArea,
            String internet, LocalDate updatedAt) {
        ApartmentConfig config = new ApartmentConfig();
        // แถวนี้มาจาก migration ตอนเทสเลยต้องประกอบเอง
        ReflectionTestUtils.setField(config, "id", SINGLETON_ID);
        config.apply(new BigDecimal(electric), new BigDecimal(water), new BigDecimal(commonArea),
                new BigDecimal(internet), updatedAt);
        return config;
    }
}
