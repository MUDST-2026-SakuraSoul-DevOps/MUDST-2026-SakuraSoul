package com.sakurasoul.apartment.config;

import io.opentelemetry.api.OpenTelemetry;
import io.opentelemetry.instrumentation.jdbc.datasource.JdbcTelemetry;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.config.BeanPostProcessor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import javax.sql.DataSource;

/**
 * ทำให้ทุกคำสั่ง SQL กลายเป็น span ลูกของคำขอ HTTP ที่เรียกมัน (SSK-186)
 * <p>
 * เปิดใน Tempo แล้วจะเห็นว่าคำขอหนึ่งใช้เวลากับฐานข้อมูลกี่ครั้ง ครั้งละเท่าไร ซึ่งเป็นสิ่งที่ metric บอกไม่ได้
 * <p>
 * ห่อ DataSource ด้วย BeanPostProcessor แทนการใช้ไลบรารี datasource-micrometer เพราะตัวนั้นยังไม่รองรับ Spring Boot 4
 * (แอปสตาร์ตไม่ขึ้นตอนทดลอง) ส่วน OpenTelemetry JDBC wrapper ทำงานที่ชั้น javax.sql.DataSource ตรงๆ
 * <p>
 * ข้อความ SQL ที่บันทึกใน span ถูกไลบรารีแทนค่าพารามิเตอร์เป็น ? ก่อน
 * ค่าจริง เช่นชื่อหรือเลขบัตรของผู้เช่า จึงไม่หลุดเข้าไปอยู่ใน trace
 */
@Configuration(proxyBeanMethods = false)
public class JdbcTracingConfig {

    @Bean
    static BeanPostProcessor jdbcTracingPostProcessor(ObjectProvider<OpenTelemetry> openTelemetry) {
        return new BeanPostProcessor() {
            @Override
            public Object postProcessAfterInitialization(Object bean, String beanName) {
                if (bean instanceof DataSource dataSource) {
                    // ใช้ตอนนี้เลยไม่ได้เพราะ OpenTelemetry ถูกสร้างทีหลัง จึงดึงเมื่อถึงตา DataSource
                    OpenTelemetry otel = openTelemetry.getIfAvailable();
                    if (otel != null) {
                        return JdbcTelemetry.create(otel).wrap(dataSource);
                    }
                }
                return bean;
            }
        };
    }
}
