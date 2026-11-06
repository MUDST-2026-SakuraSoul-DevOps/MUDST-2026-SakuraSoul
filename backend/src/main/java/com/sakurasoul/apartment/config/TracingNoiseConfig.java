package com.sakurasoul.apartment.config;

import io.micrometer.observation.ObservationPredicate;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.server.observation.ServerRequestObservationContext;

/**
 * ไม่เก็บ trace ของคำขอที่ระบบยิงใส่ตัวเอง (SSK-186)
 * <p>
 * k8s ยิง /actuator/health ทุกไม่กี่วินาทีเป็น probe และ Prometheus ยิง /actuator/prometheus ทุก 15 วินาที
 * ถ้าเก็บทั้งหมด Tempo จะเต็มไปด้วย trace ที่ไม่มีใครอยากดู จน trace ของคำขอจริงของผู้ใช้หายไปในกอง
 * ส่วน metric ของคำขอพวกนี้ยังเก็บตามปกติ เพราะ predicate นี้ตัดแค่ฝั่ง observation ของ HTTP server ที่เป็นต้นทางของ span
 */
@Configuration(proxyBeanMethods = false)
public class TracingNoiseConfig {

    @Bean
    ObservationPredicate ignoreActuatorRequests() {
        return (name, context) -> {
            if (context instanceof ServerRequestObservationContext server) {
                return !server.getCarrier().getRequestURI().startsWith("/actuator");
            }
            return true;
        };
    }
}
