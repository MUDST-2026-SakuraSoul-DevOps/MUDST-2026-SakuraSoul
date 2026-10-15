package com.sakurasoul.apartment.config;

import com.sakurasoul.apartment.common.AppTime;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;

import java.time.Clock;

/**
 * เปิดระบบงานตามเวลาให้ทั้งแอป และประกอบนาฬิกาเวลาไทยให้ทุกงานที่ต้องรู้ว่า "ตอนนี้"
 * <p>
 * ตอนนี้มีงานตามเวลาสองตัว คืองานประจำวันที่ไล่ใบแจ้งเตือนซ่อมบำรุงที่ถึงกำหนด
 * (US-14-S2 ดู maintenance.ReminderScheduler) กับงานรายนาทีที่ส่งเตือนใบค้างเดือนละครั้ง
 * (SSK-143 ดู billingschedule.BillingScheduler)
 * <p>
 * เดิมคลาสนี้อยู่ใน maintenance/ ชื่อ MaintenanceSchedulingConfig เพราะตอนนั้นมีแต่งานของฟีเจอร์ซ่อมบำรุง
 * พอ billing มีงานตามเวลาด้วย ถ้ายังอยู่ที่เดิม วันที่ตัดฟีเจอร์ซ่อมบำรุงทิ้งทั้ง package จะพา @EnableScheduling
 * หายไปด้วย แล้วงานส่งเตือนใบค้างจะเงียบหายโดยไม่มี error ให้เห็น จึงย้ายมาอยู่ใน config/ ข้าง SecurityConfig
 * ซึ่งเป็นของทั้งระบบ ชื่อ bean ยังเป็น appClock เหมือนเดิม
 *
 * <h2>ทำไม Clock ถึงมาอยู่ที่นี่</h2>
 * งานตามเวลาและ service ที่มันเรียกต้องตอบคำถามว่า "วันนี้วันอะไร" และ "ตอนนี้กี่โมง"
 * ซึ่งเป็นข้อมูลจากภายนอกที่เทสควบคุมไม่ได้ถ้าเรียก LocalDate.now() ลอย ๆ ในโค้ด การฉีด Clock
 * เข้าไปทำให้เทสตรึงวันได้ด้วย Clock.fixed แล้วยืนยันเรื่องอย่าง "31 ม.ค. บวกหนึ่งเดือนได้ 28 ก.พ."
 * ได้จริงโดยไม่ต้องรอถึงวันนั้น
 * <p>
 * ค่าของจริงเดินตามเวลาไทยชุดเดียวกับ {@link AppTime} ที่ทั้งระบบใช้อยู่แล้ว โค้ดเดิม
 * ที่เรียก AppTime.today() ตรง ๆ ยังทำงานเหมือนเดิมทุกอย่าง ไม่ได้ถูกบังคับให้เปลี่ยน
 */
@Configuration
@EnableScheduling
public class SchedulingConfig {

    @Bean
    Clock appClock() {
        return AppTime.clock();
    }
}
