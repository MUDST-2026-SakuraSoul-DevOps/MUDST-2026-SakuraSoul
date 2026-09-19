package com.sakurasoul.apartment;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;

import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.emptyOrNullString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Integration test ชั้นแรกของโปรเจกต์ (SSK-26)
 * <p>
 * ต่างจาก {@code RoomServiceTest} ที่ปลอม repository เอา ตัวนี้ยก Spring context จริง
 * ขึ้นมาทั้งก้อนและคุยกับ PostgreSQL ตัวจริงที่ Testcontainers ยกขึ้นมาให้
 * สิ่งที่พิสูจน์ได้เฉพาะชั้นนี้คือ
 * <ul>
 *   <li>Flyway migrate ผ่านบน Postgres จริง ไม่ใช่แค่ syntax ถูก</li>
 *   <li>entity ตรงกับ schema จริง เพราะ {@code ddl-auto: validate} ทำให้แอปไม่สตาร์ตถ้าไม่ตรง
 *       แปลว่าเทสนี้พังตั้งแต่ยกบริบท ถ้ามีใครแก้ entity แล้วลืมเขียน migration</li>
 *   <li>JSON ที่ตอบกลับมีหน้าตาตรงกับที่ฝั่งหน้าเว็บคาดไว้</li>
 * </ul>
 * <p>
 * <b>ต้องเปิด Docker ก่อนรัน</b> ไม่งั้นจะพังตั้งแต่ยังไม่เริ่มเทส
 * บน GitHub Actions runner มี Docker ให้อยู่แล้วจึงไม่ต้องตั้งอะไรเพิ่ม
 * <p>
 * <b>ที่ยังขาดอยู่</b> เคส US-05-S2 ที่ยิงสองคำขอสร้างสัญญาเช่าพร้อมกันแล้วต้องสำเร็จ
 * แค่คำขอเดียว ยังเขียนไม่ได้เพราะตาราง {@code lease} กับ endpoint ของมันยังไม่มี
 * (ดู docs/api-contract-lease.md) เคสนั้นต้องมาเขียนที่ไฟล์นี้ โดยใช้
 * {@code ExecutorService} ยิงสอง POST พร้อมกันแล้วยืนยันว่าได้ 201 หนึ่งใบกับ 409 หนึ่งใบ
 * ซึ่งเป็นข้อเดียวที่ฝั่งหน้าเว็บพิสูจน์แทนไม่ได้เลย เพราะทั้งเบราว์เซอร์และ backend
 * จำลองเป็น single thread จึงเช็คผ่านทั้งคู่เสมอ
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
// ทุก endpoint ต้องล็อกอินแล้วตั้งแต่ SSK-28 ชุดนี้จึงยิงในนามผู้ใช้ปลอม เพราะสิ่งที่เทสคือ schema กับ JSON ไม่ใช่ระบบ login
@WithMockUser
class ApartmentApiIntegrationTest {

	@Autowired
	private MockMvc mockMvc;

	@Test
	@DisplayName("GET /api/rooms คืนห้องครบ 24 ห้องจาก migration จริง")
	void listsAllRoomsFromMigration() throws Exception {
		mockMvc.perform(get("/api/rooms"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$", hasSize(24)));
	}

	@Test
	@DisplayName("ห้องเรียงตามเลขห้อง ตั้งแต่ 101 ถึง 212 ตาม V2__seed_rooms.sql")
	void roomsAreOrderedByRoomNumber() throws Exception {
		mockMvc.perform(get("/api/rooms"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$[0].roomNumber").value("101"))
				.andExpect(jsonPath("$[0].floor").value(1))
				.andExpect(jsonPath("$[23].roomNumber").value("212"))
				.andExpect(jsonPath("$[23].floor").value(2))
				.andExpect(jsonPath("$[0].baseRent").isNumber());
	}

	@Test
	@DisplayName("ขอห้องที่ไม่มีอยู่ ต้องได้ 404 พร้อมข้อความที่เอาไปโชว์ผู้ใช้ได้")
	void missingRoomReturnsProblemDetail() throws Exception {
		mockMvc.perform(get("/api/rooms/9999"))
				.andExpect(status().isNotFound())
				// ฟิลด์ detail คือสิ่งที่หน้าเว็บเอาไปโชว์ตรง ๆ ห้ามว่าง
				.andExpect(jsonPath("$.detail", not(emptyOrNullString())));
	}

	@Test
	@DisplayName("POST /api/tenants บันทึกลง PostgreSQL จริง แล้วอ่านกลับมาเจอ")
	void createdTenantIsPersisted() throws Exception {
		String created = mockMvc.perform(post("/api/tenants")
						.contentType(MediaType.APPLICATION_JSON)
						.content("""
								{"fullName":"มานี รักเรียน","nationalId":"1900000000001","phone":"089-111-2222"}
								"""))
				.andExpect(status().isCreated())
				.andExpect(jsonPath("$.id").isNumber())
				.andReturn()
				.getResponse()
				.getContentAsString();

		long id = ((Number) com.jayway.jsonpath.JsonPath.read(created, "$.id")).longValue();

		mockMvc.perform(get("/api/tenants/" + id))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.fullName").value("มานี รักเรียน"));
	}

	@Test
	@DisplayName("ชื่อภาษาไทยต้องไม่เพี้ยนหลังผ่าน HTTP และ database")
	void thaiNamesSurviveRoundTrip() throws Exception {
		// เรื่อง charset พลาดกันบ่อยระหว่าง javac, HTTP และ Postgres
		// ถ้าจุดใดจุดหนึ่งไม่ใช่ UTF-8 ชื่อจะกลายเป็นเครื่องหมายคำถามโดยไม่มี error ให้เห็น
		mockMvc.perform(post("/api/tenants")
						.contentType(MediaType.APPLICATION_JSON)
						.content("""
								{"fullName":"ปิติ ชูใจ","phone":"089-333-4444","nationalId":"1100400999999"}
								"""))
				.andExpect(status().isCreated())
				.andExpect(jsonPath("$.fullName").value("ปิติ ชูใจ"))
				.andExpect(jsonPath("$.nationalId").value("1100400999999"));
	}

	@Test
	@DisplayName("ไม่กรอกชื่อผู้เช่า ต้องได้ 400 ไม่ใช่ 500")
	void blankTenantNameIsRejected() throws Exception {
		mockMvc.perform(post("/api/tenants")
						.contentType(MediaType.APPLICATION_JSON)
						.content("""
								{"fullName":"   ","phone":"089-555-6666"}
								"""))
				.andExpect(status().isBadRequest());
	}

	@Test
	@DisplayName("ผู้เช่าที่เพิ่งสร้างต้องโผล่ในรายชื่อทั้งหมด")
	void createdTenantAppearsInList() throws Exception {
		mockMvc.perform(post("/api/tenants")
						.contentType(MediaType.APPLICATION_JSON)
						.content("""
								{"fullName":"สมหญิง ตั้งใจ","nationalId":"1900000000002","phone":"089-777-8888"}
								"""))
				.andExpect(status().isCreated());

		mockMvc.perform(get("/api/tenants"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$[?(@.fullName == 'สมหญิง ตั้งใจ')]", hasSize(1)));
	}

	@Test
	@DisplayName("probe ที่ k8s ใช้ต้องตอบว่าพร้อมใช้งาน")
	void readinessProbeReportsUp() throws Exception {
		mockMvc.perform(get("/actuator/health/readiness"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.status").value("UP"));
	}
}
