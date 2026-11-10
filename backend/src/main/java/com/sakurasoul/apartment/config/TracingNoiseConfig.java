package com.sakurasoul.apartment.config;

import io.micrometer.observation.ObservationPredicate;
import io.opentelemetry.api.common.AttributeKey;
import io.opentelemetry.api.common.Attributes;
import io.opentelemetry.api.trace.Span;
import io.opentelemetry.api.trace.SpanKind;
import io.opentelemetry.context.Context;
import io.opentelemetry.sdk.trace.data.LinkData;
import io.opentelemetry.sdk.trace.samplers.Sampler;
import io.opentelemetry.sdk.trace.samplers.SamplingResult;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.server.observation.ServerRequestObservationContext;

import java.util.List;

/**
 * ไม่เก็บ trace ที่ไม่มีใครอยากดู (SSK-186)
 * <p>
 * k8s ยิง /actuator/health ทุกไม่กี่วินาทีเป็น probe และ Prometheus ยิง /actuator/prometheus ทุก 15 วินาที
 * ถ้าเก็บทั้งหมด Tempo จะเต็มไปด้วย trace ที่ไม่มีใครอยากดู จน trace ของคำขอจริงของผู้ใช้หายไปในกอง
 *
 * <h2>ข้อแลกเปลี่ยนที่ต้องรู้</h2>
 * ObservationPredicate ที่คืน false ทำให้ observation ของคำขอนั้นเป็น no-op ทั้งก้อน หายทั้ง span
 * <b>และ</b> metric ของ Micrometer (Timer http.server.requests) ของ /actuator/** ด้วย
 * ผลคือกราฟคำขอต่อวินาทีและ latency ใน dashboard System Health นับเฉพาะคำขอของผู้ใช้จริง
 * ช่วงที่ไม่มีใครใช้เว็บ (เช่นเพิ่ง deploy ก่อนเดโม) กราฟเหล่านั้นจึงเป็น 0 ไม่ใช่เส้นที่ probe ทำให้ขยับตลอด
 * (panel คำขอต่อวินาทีจึงใช้ "or vector(0)" ให้ขึ้น 0 แทน No data) ตั้งใจให้เป็นแบบนี้เพราะตัวเลขที่เจ้าของหอดูคือคำขอของคนจริง
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

    /**
     * ไม่เก็บ span ของ SQL ที่ไม่มี span แม่ (ไม่ได้เกิดภายในคำขอ HTTP หรืองานตามเวลาที่มี span แม่)
     * <p>
     * ตัวอย่างคือ SQL ที่ BusinessMetrics รันเมื่อแคชหมดอายุระหว่าง Prometheus scrape, SQL ตอน Flyway/สตาร์ตแอป และ pool ของ Hikari
     * ถ้าเก็บ แต่ละคำสั่งจะกลายเป็น root trace ของตัวเอง (เช่น "SELECT sakura") ท่วมหน้า Search ของ Tempo
     * ส่วน SQL ที่เกิดภายในคำขอจริงยังอยู่ครบเป็น span ลูกของคำขอนั้น
     * <p>
     * ทำที่ Sampler ของ OpenTelemetry ไม่ใช่ SpanExportingPredicate ของ Micrometer เพราะ span ของ JDBC สร้างด้วย OpenTelemetry API ตรงๆ
     * ไม่ผ่านสะพานของ Micrometer predicate จึงไม่เห็น (ลองแล้ว root trace ของ SQL ยังออกไป Tempo)
     * Sampler ตัวนี้แทนตัวตั้งต้นของ Spring Boot จึงต้องคิดอัตราเก็บเองให้ตรงกับ management.tracing.sampling.probability
     */
    @Bean
    Sampler tracingSampler(@Value("${management.tracing.sampling.probability:1.0}") double probability) {
        // เหมือนตัวตั้งต้นของ Spring Boot: ถ้ามี span แม่ตามแม่ ถ้าไม่มีสุ่มตามอัตรา
        Sampler standard = Sampler.parentBased(Sampler.traceIdRatioBased(probability));
        return new DropOrphanDatabaseSampler(standard);
    }

    /** ตัดสินที่ตอนสร้าง span: span ฝั่ง client ของฐานข้อมูลที่ไม่มี span แม่ที่ใช้ได้ ไม่เก็บ ที่เหลือใช้กติกาปกติ */
    static final class DropOrphanDatabaseSampler implements Sampler {

        // ชื่อ attribute ของฐานข้อมูลมีสองแบบตามรุ่นของ semantic convention
        private static final AttributeKey<String> DB_SYSTEM = AttributeKey.stringKey("db.system");
        private static final AttributeKey<String> DB_SYSTEM_NAME = AttributeKey.stringKey("db.system.name");

        private final Sampler delegate;

        DropOrphanDatabaseSampler(Sampler delegate) {
            this.delegate = delegate;
        }

        @Override
        public SamplingResult shouldSample(Context parentContext, String traceId, String name, SpanKind spanKind,
                Attributes attributes, List<LinkData> parentLinks) {
            boolean database = attributes.get(DB_SYSTEM) != null || attributes.get(DB_SYSTEM_NAME) != null;
            boolean orphan = !Span.fromContext(parentContext).getSpanContext().isValid();
            if (database && orphan) {
                return SamplingResult.drop();
            }
            return delegate.shouldSample(parentContext, traceId, name, spanKind, attributes, parentLinks);
        }

        @Override
        public String getDescription() {
            return "DropOrphanDatabaseSampler{" + delegate.getDescription() + "}";
        }
    }
}
