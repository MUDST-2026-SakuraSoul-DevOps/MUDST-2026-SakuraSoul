package com.sakurasoul.apartment.config;

import io.opentelemetry.api.common.AttributeKey;
import io.opentelemetry.api.common.Attributes;
import io.opentelemetry.api.trace.Span;
import io.opentelemetry.api.trace.SpanContext;
import io.opentelemetry.api.trace.SpanKind;
import io.opentelemetry.api.trace.TraceFlags;
import io.opentelemetry.api.trace.TraceState;
import io.opentelemetry.context.Context;
import io.opentelemetry.sdk.trace.samplers.Sampler;
import io.opentelemetry.sdk.trace.samplers.SamplingDecision;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * เทสหน่วยของตัวกรอง span ของ SQL ที่ไม่มี span แม่ (SSK-186) ไม่ต้องใช้ Docker หรือ Spring
 * <p>
 * ที่ต้องมีเพราะรอบแรกใช้ SpanExportingPredicate ของ Micrometer แล้วดูเหมือนใช้ได้ แต่จริงๆ ไม่มีผลกับ span ของ JDBC
 * (ตรวจจาก Tempo จริงแล้วยังเห็น root trace ของ SQL) เทสนี้ล็อกพฤติกรรมที่ตั้งใจไว้ที่ Sampler
 */
class TracingSamplerTest {

    private static final String TRACE_ID = "0af7651916cd43dd8448eb211c80319c";

    private final Sampler sampler = new TracingNoiseConfig().tracingSampler(1.0);

    private static Attributes db() {
        return Attributes.of(AttributeKey.stringKey("db.system"), "postgresql");
    }

    private static Context withValidParent() {
        SpanContext parent = SpanContext.create(TRACE_ID, "b7ad6b7169203331", TraceFlags.getSampled(), TraceState.getDefault());
        return Context.root().with(Span.wrap(parent));
    }

    private SamplingDecision decide(Context ctx, Attributes attributes) {
        return sampler.shouldSample(ctx, TRACE_ID, "SELECT sakura", SpanKind.CLIENT, attributes, List.of()).getDecision();
    }

    @Test
    @DisplayName("SQL ที่ไม่มี span แม่ (เช่นตอน scrape หรือตอนสตาร์ต) ไม่ถูกเก็บ")
    void orphanDatabaseSpanIsDropped() {
        assertThat(decide(Context.root(), db())).isEqualTo(SamplingDecision.DROP);
    }

    @Test
    @DisplayName("SQL ที่เกิดภายในคำขอ (มี span แม่) ยังถูกเก็บ")
    void databaseSpanUnderRequestIsKept() {
        assertThat(decide(withValidParent(), db())).isEqualTo(SamplingDecision.RECORD_AND_SAMPLE);
    }

    @Test
    @DisplayName("span ที่ไม่ใช่ฐานข้อมูลและไม่มี span แม่ (คำขอ HTTP ใหม่ งานตามเวลา) ยังถูกเก็บตามอัตราตั้งต้น")
    void nonDatabaseRootSpanIsKept() {
        assertThat(decide(Context.root(), Attributes.empty())).isEqualTo(SamplingDecision.RECORD_AND_SAMPLE);
    }

    @Test
    @DisplayName("รู้จัก attribute ฐานข้อมูลทั้งสองชื่อ (db.system และ db.system.name)")
    void bothDatabaseAttributeNamesAreRecognised() {
        Attributes newer = Attributes.of(AttributeKey.stringKey("db.system.name"), "postgresql");
        assertThat(decide(Context.root(), newer)).isEqualTo(SamplingDecision.DROP);
    }

    @Test
    @DisplayName("อัตราเก็บ 0 ไม่เก็บ span ที่ไม่ใช่ฐานข้อมูลด้วย (ตรงกับ management.tracing.sampling.probability)")
    void zeroProbabilityDropsEverything() {
        Sampler none = new TracingNoiseConfig().tracingSampler(0.0);
        assertThat(none.shouldSample(Context.root(), TRACE_ID, "http get", SpanKind.SERVER, Attributes.empty(), List.of())
                .getDecision()).isEqualTo(SamplingDecision.DROP);
    }
}
