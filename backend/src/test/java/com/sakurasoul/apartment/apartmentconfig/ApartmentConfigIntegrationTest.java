package com.sakurasoul.apartment.apartmentconfig;

import com.sakurasoul.apartment.TestcontainersConfiguration;
import com.sakurasoul.apartment.apartmentconfig.ApartmentConfigDtos.ApartmentConfigRequest;
import com.sakurasoul.apartment.apartmentconfig.ApartmentConfigDtos.ApartmentConfigResponse;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIf;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataIntegrityViolationException;
import org.testcontainers.DockerClientFactory;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.temporal.ChronoUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * พิสูจน์ว่า migration V3 ลงได้จริงและ entity ตรงกับ schema
 * <p>
 * `ddl-auto: validate` ทำให้ Spring context ยกไม่ขึ้นเลยถ้า entity กับตารางไม่ตรงกัน
 * เทสตัวนี้จึงจับความผิดพลาดตรงนั้นได้ตั้งแต่ยังไม่ทันเรียกเมธอดไหน
 * <p>
 * เครื่องที่ไม่ได้เปิด Docker จะข้ามเทสชุดนี้ ไม่ใช่ล้ม ส่วน CI มี Docker อยู่แล้วจะรันจริง
 */
@SpringBootTest
@Import(TestcontainersConfiguration.class)
@EnabledIf("dockerAvailable")
class ApartmentConfigIntegrationTest {

    @Autowired
    private ApartmentConfigService apartmentConfigService;

    @Autowired
    private ApartmentConfigRepository apartmentConfigRepository;

    static boolean dockerAvailable() {
        return DockerClientFactory.instance().isDockerAvailable();
    }

    /**
     * ตารางนี้มีแถวเดียวและใช้ร่วมกันทุกเทส เทสที่แก้อัตราจึงต้องคืนค่าตั้งต้นให้ด้วย
     * ไม่งั้นเทสที่รันทีหลังจะเห็นค่าที่เทสก่อนหน้าทิ้งไว้ แล้วพังตามลำดับการรัน
     */
    @AfterEach
    void restoreSeededRates() {
        apartmentConfigService.update(new ApartmentConfigRequest(new BigDecimal("8.00"),
                new BigDecimal("18.00"), new BigDecimal("300.00"), new BigDecimal("250.00")));
    }

    @Test
    @DisplayName("migration ใส่แถวตั้งต้นมาให้แล้ว อ่านได้ทันทีโดยไม่ต้อง seed อะไรเพิ่ม")
    void migrationSeedsTheSingleRow() {
        ApartmentConfigResponse config = apartmentConfigService.get();

        assertThat(config.electricRatePerUnit()).isEqualByComparingTo("8.00");
        assertThat(config.waterRatePerUnit()).isEqualByComparingTo("18.00");
        assertThat(config.commonAreaFee()).isEqualByComparingTo("300.00");
        assertThat(config.internetFee()).isEqualByComparingTo("250.00");
        assertThat(config.updatedAt()).isNotNull();
    }

    @Test
    @DisplayName("บันทึกอัตราใหม่แล้วอ่านกลับมาจากฐานต้องได้ค่าใหม่และเวลาที่แก้เป็นตอนนี้")
    void updateSurvivesARoundTrip() {
        // ตัดให้เหลือมิลลิวินาทีเหมือนที่ service ทำ ไม่งั้นเศษไมโครวินาทีจะทำให้เทียบพลาด
        Instant startedAt = Instant.now().truncatedTo(ChronoUnit.MILLIS);

        apartmentConfigService.update(new ApartmentConfigRequest(new BigDecimal("12.50"),
                new BigDecimal("22.00"), new BigDecimal("350.00"), new BigDecimal("0.00")));

        ApartmentConfigResponse reloaded = apartmentConfigService.get();

        assertThat(reloaded.electricRatePerUnit()).isEqualByComparingTo("12.50");
        assertThat(reloaded.internetFee()).isEqualByComparingTo("0.00");
        assertThat(reloaded.updatedAt()).isNotNull();
        assertThat(reloaded.updatedAt()).isAfterOrEqualTo(startedAt);
    }

    @Test
    @DisplayName("ตารางนี้ต้องมีแถวเดียวตลอด เพิ่มแถวที่สองต้องโดน constraint กัน")
    void secondRowIsRejectedByTheDatabase() {
        ApartmentConfig second = new ApartmentConfig();
        ReflectionTestUtils.setField(second, "id", (short) 2);
        second.apply(new BigDecimal("8"), new BigDecimal("18"), new BigDecimal("300"),
                new BigDecimal("250"), Instant.now());

        assertThatThrownBy(() -> apartmentConfigRepository.saveAndFlush(second))
                .isInstanceOf(DataIntegrityViolationException.class);
    }
}
