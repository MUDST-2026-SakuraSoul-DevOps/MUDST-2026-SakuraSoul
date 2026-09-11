package com.sakurasoul.apartment.maintenance;

import com.sakurasoul.apartment.common.AppTime;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;

import java.time.Clock;

/**
 * เปิดระบบงานตามเวลาให้ทั้งแอป เพราะ CR-05 มีงานประจำวันหนึ่งตัวคือการไล่ใบแจ้งเตือน
 * ที่ถึงกำหนด (US-14-S2 ดู {@link ReminderScheduler})
 * <p>
 * ที่ติด @EnableScheduling ไว้ที่คลาสเล็ก ๆ ในแพ็กเกจนี้ ไม่ได้ติดไว้บน
 * ApartmentApplication เพราะงานตามเวลาเป็นความสามารถของฟีเจอร์นี้ ไม่ใช่ของทั้งระบบ
 * คนที่เปิดไฟล์ maintenance/ จะเห็นครบว่าฟีเจอร์นี้ทำอะไรบ้างโดยไม่ต้องไปไล่ดู
 * annotation ที่คลาสหลักของแอป และถ้าวันหนึ่งตัดฟีเจอร์นี้ทิ้ง งานตามเวลาจะหายไปพร้อมกัน
 *
 * <h2>ทำไม Clock ถึงมาอยู่ที่นี่</h2>
 * ทั้ง scheduler และ service สามตัวของแพ็กเกจนี้ต้องตอบคำถามว่า "วันนี้วันอะไร" และ
 * "ตอนนี้กี่โมง" ซึ่งเป็นข้อมูลจากภายนอกที่เทสควบคุมไม่ได้ถ้าเรียก LocalDate.now()
 * ลอย ๆ ในโค้ด การฉีด Clock เข้าไปทำให้เทสตรึงวันได้ด้วย Clock.fixed แล้วยืนยันเรื่อง
 * อย่าง "31 ม.ค. บวกหนึ่งเดือนได้ 28 ก.พ." ได้จริงโดยไม่ต้องรอถึงวันนั้น
 * <p>
 * ค่าของจริงเดินตามเวลาไทยชุดเดียวกับ {@link AppTime} ที่ทั้งระบบใช้อยู่แล้ว โค้ดเดิม
 * ที่เรียก AppTime.today() ตรง ๆ ยังทำงานเหมือนเดิมทุกอย่าง ไม่ได้ถูกบังคับให้เปลี่ยน
 */
@Configuration
@EnableScheduling
public class MaintenanceSchedulingConfig {

    @Bean
    Clock appClock() {
        return AppTime.clock();
    }
}
