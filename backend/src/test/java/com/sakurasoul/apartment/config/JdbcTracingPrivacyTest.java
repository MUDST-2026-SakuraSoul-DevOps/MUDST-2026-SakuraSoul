package com.sakurasoul.apartment.config;

import com.sakurasoul.apartment.TestcontainersConfiguration;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * เทสว่าข้อความ error ของ SQL ไม่พาค่าจริงของผู้เช่าไปด้วย (SSK-186, ตามรีวิวโค้ด #189)
 * <p>
 * ที่มา: opentelemetry-jdbc บันทึก exception.message ลง span ตอนคำสั่งพัง และ pgjdbc ใส่บรรทัด "Detail:" ของ PostgreSQL
 * ในข้อความตามค่าตั้งต้น เช่น "Key (national_id)=(1234567890123) already exists" ซึ่งค่านั้นจะไปค้างใน Tempo 72 ชั่วโมง
 * ตั้ง logServerErrorDetail=false ที่ datasource แล้วข้อความเหลือแค่ชื่อ constraint
 * <p>
 * เทสนี้ยิงผ่าน DataSource ตัวจริงของแอป (ที่ถูกห่อด้วย OpenTelemetry แล้ว) เพื่อพิสูจน์ว่าค่านี้ไปถึง driver ผ่าน wrapper จริง
 * ไม่ใช่แค่ตั้งไว้ในไฟล์ ถ้าใครเอา property ออกหรือเปลี่ยน driver เทสนี้ต้องล้ม
 * <p>
 * ต้องเปิด Docker ก่อนรัน (Testcontainers ยก PostgreSQL)
 */
@SpringBootTest
@Import(TestcontainersConfiguration.class)
@Transactional
class JdbcTracingPrivacyTest {

    @Autowired
    private JdbcTemplate jdbc;

    private static final String SECRET_NATIONAL_ID = "1234567890123";
    private static final String SECRET_NAME = "สมศักดิ์ ลับมาก";

    @Test
    @DisplayName("เลขบัตรซ้ำชน unique ข้อความ error ต้องไม่มีเลขบัตรจริง แต่ยังมีชื่อ constraint")
    void duplicateKeyMessageHasNoRowValues() {
        jdbc.update("INSERT INTO tenant (full_name, phone, national_id, created_at) VALUES (?, '-', ?, now())",
                SECRET_NAME, SECRET_NATIONAL_ID);

        assertThatThrownBy(() -> jdbc.update(
                "INSERT INTO tenant (full_name, phone, national_id, created_at) VALUES (?, '-', ?, now())",
                "คนอื่น", SECRET_NATIONAL_ID))
                .isInstanceOf(DataAccessException.class)
                .satisfies(e -> {
                    String all = fullMessage(e);
                    assertThat(all).doesNotContain(SECRET_NATIONAL_ID);
                    assertThat(all).contains("tenant_national_id_uk");
                });
    }

    @Test
    @DisplayName("ละเมิด not-null ข้อความ error ต้องไม่มีทั้งแถว (ชื่อผู้เช่า) ")
    void notNullViolationMessageHasNoRow() {
        assertThatThrownBy(() -> jdbc.update(
                "INSERT INTO tenant (full_name, phone, national_id, created_at) VALUES (?, NULL, 'X-NOT-NULL', now())",
                SECRET_NAME))
                .isInstanceOf(DataAccessException.class)
                .satisfies(e -> assertThat(fullMessage(e)).doesNotContain(SECRET_NAME));
    }

    private static String fullMessage(Throwable e) {
        StringBuilder sb = new StringBuilder();
        for (Throwable t = e; t != null; t = t.getCause()) {
            sb.append(t.getMessage()).append('\n');
        }
        return sb.toString();
    }
}
