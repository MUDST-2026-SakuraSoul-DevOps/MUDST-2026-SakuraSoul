package com.sakurasoul.apartment.auth;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.slf4j.LoggerFactory;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * เทสของ US-01 ส่วนที่ว่าแอดมินคนแรกมาจากไหน
 * <p>
 * สามเคสในนี้คือสามทางที่ตัวสร้างแอดมินเดินได้ และทั้งสามทางมีราคาแพงถ้าพลาด
 * สร้างซ้ำ = รหัสผ่านที่แอดมินตั้งเองถูก environment variable ตั้งกลับทุกครั้งที่ pod restart
 * ไม่สร้างทั้งที่ควรสร้าง = ระบบที่เพิ่ง deploy ไม่มีใครล็อกอินได้เลย
 * เงียบตอนไม่ได้ตั้งรหัส = คนดูแลไล่หาสาเหตุไม่เจอว่าทำไมล็อกอินไม่ได้
 * <p>
 * เป็น unit test ล้วน ไม่ยก Spring context ไม่แตะ database ไม่ต้องใช้ Docker
 * จึงรันได้ทุกเครื่องเสมอ ต่างจาก AuthApiTest ที่เทสของจริงทั้งเส้น
 */
@ExtendWith(MockitoExtension.class)
class AdminUserInitializerTest {

    @Mock
    private AdminUserRepository adminUserRepository;

    @Mock
    private PasswordEncoder passwordEncoder;

    private ListAppender<ILoggingEvent> logs;
    private Logger initializerLogger;

    /** ดัก log ไว้เอง เพราะข้อความเตือนคือสิ่งที่ต้องพิสูจน์ในเคสที่สาม ไม่ใช่ผลข้างเคียง */
    @BeforeEach
    void captureLogs() {
        initializerLogger = (Logger) LoggerFactory.getLogger(AdminUserInitializer.class);
        logs = new ListAppender<>();
        logs.start();
        initializerLogger.addAppender(logs);
    }

    @AfterEach
    void releaseLogs() {
        initializerLogger.detachAppender(logs);
        logs.stop();
    }

    @Test
    @DisplayName("ตารางว่างและตั้งรหัสผ่านไว้ ต้องสร้างแอดมินคนแรกด้วย hash ไม่ใช่รหัสดิบ")
    void createsTheFirstAdminWhenTableIsEmptyAndPasswordIsSet() {
        when(adminUserRepository.count()).thenReturn(0L);
        when(passwordEncoder.encode("sakura-1234")).thenReturn("hash-ของ-sakura-1234");

        initializer(new AdminProperties("somsri", "sakura-1234", "สมศรี ผู้ดูแล")).run(null);

        ArgumentCaptor<AdminUser> saved = ArgumentCaptor.forClass(AdminUser.class);
        verify(adminUserRepository).save(saved.capture());
        assertThat(saved.getValue().getUsername()).isEqualTo("somsri");
        assertThat(saved.getValue().getDisplayName()).isEqualTo("สมศรี ผู้ดูแล");
        // ที่เก็บลงฐานต้องเป็นผลของ encoder เท่านั้น ถ้าวันไหนมีคนเผลอเก็บรหัสดิบ
        // บรรทัดนี้จะแดงก่อนที่ของจะขึ้นไปถึง k8s
        assertThat(saved.getValue().getPasswordHash()).isEqualTo("hash-ของ-sakura-1234");
    }

    /**
     * ไม่ใช่แค่ "ห้ามสร้างซ้ำ" แต่ห้ามแตะของเดิมเลย ถ้าเขียนทับทุกครั้งที่สตาร์ต
     * รหัสผ่านที่แอดมินเปลี่ยนเองจะถูกค่าใน Secret ตั้งกลับทุกครั้งที่ pod restart
     * ซึ่งเป็นบั๊กที่ไล่จับยากมากเพราะมันหายเองเมื่อไม่มีใคร restart
     */
    @Test
    @DisplayName("มีแอดมินอยู่แล้ว ต้องไม่สร้างเพิ่มและไม่เขียนทับของเดิม")
    void doesNothingWhenAnAdminAlreadyExists() {
        when(adminUserRepository.count()).thenReturn(1L);

        initializer(new AdminProperties("somsri", "sakura-1234", "สมศรี ผู้ดูแล")).run(null);

        verify(adminUserRepository, never()).save(any());
        verify(passwordEncoder, never()).encode(any());
    }

    @Test
    @DisplayName("ตารางว่างแต่ไม่ได้ตั้งรหัสผ่าน ต้องไม่สร้างใครและต้องเตือนวิธีตั้งค่าไว้ใน log")
    void warnsAndCreatesNothingWhenPasswordIsBlank() {
        when(adminUserRepository.count()).thenReturn(0L);

        initializer(new AdminProperties(null, "   ", null)).run(null);

        verify(adminUserRepository, never()).save(any());

        List<ILoggingEvent> warnings = logs.list.stream()
                .filter(event -> event.getLevel() == Level.WARN)
                .toList();
        assertThat(warnings).hasSize(1);
        // ต้องบอกชื่อ environment variable ตรง ๆ ไม่ใช่แค่ "ยังไม่ได้ตั้งค่า"
        // คนที่เจอ log นี้ต้องแก้ได้เลยโดยไม่ต้องเปิดโค้ดอ่าน
        assertThat(warnings.get(0).getFormattedMessage()).contains("APP_ADMIN_PASSWORD");
    }

    @Test
    @DisplayName("ไม่ได้ตั้งชื่อผู้ใช้กับชื่อที่แสดง ต้องได้ค่าตั้งต้น admin และ Administrator")
    void fallsBackToTheDefaultUsernameAndDisplayName() {
        when(adminUserRepository.count()).thenReturn(0L);
        when(passwordEncoder.encode("sakura-1234")).thenReturn("hash");

        initializer(new AdminProperties(null, "sakura-1234", "")).run(null);

        ArgumentCaptor<AdminUser> saved = ArgumentCaptor.forClass(AdminUser.class);
        verify(adminUserRepository).save(saved.capture());
        assertThat(saved.getValue().getUsername()).isEqualTo("admin");
        assertThat(saved.getValue().getDisplayName()).isEqualTo("Administrator");
    }

    private AdminUserInitializer initializer(AdminProperties properties) {
        return new AdminUserInitializer(adminUserRepository, passwordEncoder, properties);
    }
}
