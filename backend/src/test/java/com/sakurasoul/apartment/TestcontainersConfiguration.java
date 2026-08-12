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

}
