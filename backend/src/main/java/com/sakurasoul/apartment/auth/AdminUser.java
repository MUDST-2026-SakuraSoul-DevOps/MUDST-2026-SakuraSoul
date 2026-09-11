package com.sakurasoul.apartment.auth;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;

import java.time.Instant;

/**
 * แอดมินหนึ่งคนที่เข้าสู่ระบบได้ ตรงกับตาราง admin_user ใน V7
 * <p>
 * เก็บเฉพาะ hash ของรหัสผ่าน ไม่มีที่ไหนในระบบเก็บรหัสจริง เพราะฉะนั้นลืมรหัสแล้ว
 * กู้คืนไม่ได้ ต้องตั้งใหม่ให้เท่านั้น
 * <p>
 * ไม่มี setter ของ passwordHash เพราะการเปลี่ยนรหัสผ่านยังไม่มีในเฟสนี้ ตอนจะทำ
 * ให้เพิ่มเมธอดที่รับ hash ที่เข้ารหัสมาแล้ว อย่าเพิ่ม setter ที่รับรหัสดิบ
 */
@Entity
@Table(name = "admin_user")
public class AdminUser {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "username", nullable = false, length = 50)
    private String username;

    @Column(name = "password_hash", nullable = false, length = 100)
    private String passwordHash;

    @Column(name = "display_name", nullable = false, length = 200)
    private String displayName;

    @Column(name = "email", length = 255)
    private String email;

    @Column(name = "phone", length = 30)
    private String phone;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected AdminUser() {
    }

    public AdminUser(String username, String passwordHash, String displayName, String email, String phone) {
        this.username = username;
        this.passwordHash = passwordHash;
        this.displayName = displayName;
        this.email = email;
        this.phone = phone;
    }

    @PrePersist
    void onCreate() {
        if (createdAt == null) {
            createdAt = Instant.now();
        }
    }

    public Long getId() {
        return id;
    }

    public String getUsername() {
        return username;
    }

    public String getPasswordHash() {
        return passwordHash;
    }

    public String getDisplayName() {
        return displayName;
    }

    public void setDisplayName(String displayName) {
        this.displayName = displayName;
    }

    public String getEmail() {
        return email;
    }

    public void setEmail(String email) {
        this.email = email;
    }

    public String getPhone() {
        return phone;
    }

    public void setPhone(String phone) {
        this.phone = phone;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
