package com.sakurasoul.apartment;

import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Bean;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

/**
 * ยก PostgreSQL ตัวจริงขึ้นมาให้เทส ต้องเปิด Docker ไว้ก่อนไม่งั้นเทสจะพังตั้งแต่ยังไม่เริ่ม
 * <p>
 * ที่ไม่ใช้ H2 เพราะ H2 กับ Postgres ต่างกันพอที่จะทำให้เทสผ่านแต่ของจริงพัง
 * โดยเฉพาะ EXCLUDE USING gist ที่เรากันห้องซ้อนอยู่ ซึ่ง H2 ไม่มีให้ใช้เลย
 * <p>
 * ปักเวอร์ชันให้ตรงกับที่ใช้ใน docker-compose และ k8s จะได้ไม่เจอความต่างระหว่าง environment
 */
@TestConfiguration(proxyBeanMethods = false)
public class TestcontainersConfiguration {

	@Bean
	@ServiceConnection
	PostgreSQLContainer postgresContainer() {
		return new PostgreSQLContainer(DockerImageName.parse("postgres:17-alpine"));
	}

	/**
	 * ตัวส่งอีเมลปลอมแทน Mailpit (SSK-143) เทสเปิดดูอีเมลที่ถูกส่งได้ และสั่งให้เมลเซิร์ฟเวอร์ล่มได้
	 * <p>
	 * วางไว้ที่นี่ ไม่ใช้ @MockitoBean ในคลาสเทสที่ต้องการ เพราะทุก API test import คลาสนี้อยู่แล้ว
	 * ทุกคลาสจึงยังใช้ context ตัวเดียวกันต่อไป ถ้าคลาสไหนประกาศ mock ของตัวเอง Spring จะสร้าง context ใหม่
	 * พร้อม PostgreSQL อีกตัวให้คลาสนั้น เทสทั้งชุดจะช้าลงไปทั้งก้อน
	 * <p>
	 * MailSenderAutoConfiguration ของ Spring Boot ถอยให้ bean ตัวนี้เอง (@ConditionalOnMissingBean(MailSender.class))
	 * TestApartmentApplication ที่ใช้คลาสนี้ด้วยจึงได้ตัวปลอมไปด้วย อีเมลจะไม่ออกไปไหน
	 * ถ้าอยากเห็นอีเมลจริงใน Mailpit ให้รันผ่าน docker compose แทน
	 */
	@Bean
	RecordingMailSender recordingMailSender() {
		return new RecordingMailSender();
	}

}
