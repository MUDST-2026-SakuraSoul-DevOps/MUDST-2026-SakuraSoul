package com.sakurasoul.apartment.tenant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;

import java.time.Instant;

@Entity
@Table(name = "tenant")
public class Tenant {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "full_name", nullable = false, length = 200)
    private String fullName;

    /**
     * เลขบัตรประชาชนหรือเลขพาสปอร์ต บังคับตามคำตัดสินของอาจารย์ (11 ก.ย. 2569)
     * และห้ามซ้ำ ตัวกันซ้ำจริงคือ constraint tenant_national_id_uk ใน V6
     */
    @Column(name = "national_id", nullable = false, length = 20)
    private String nationalId;

    @Column(name = "line_id", nullable = false, length = 100)
    private String lineId;

    @Column(name = "phone", nullable = false, length = 30)
    private String phone;

    /** ช่องเดียวของผู้เช่าที่ไม่บังคับ จึงเป็นช่องเดียวที่เป็น null ได้ ดูเหตุผลใน V6 */
    @Column(name = "email", length = 255)
    private String email;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected Tenant() {
    }

    /**
     * ลำดับพารามิเตอร์เรียงตามลำดับช่องในฟอร์มเพิ่มผู้เช่า (ชื่อ เลขบัตร Line เบอร์โทร อีเมล)
     * ให้คนอ่านเทียบกับหน้าจอได้ตรง ๆ ตัวสุดท้ายเป็น null ได้ตัวเดียว
     */
    public Tenant(String fullName, String nationalId, String lineId, String phone, String email) {
        this.fullName = fullName;
        this.nationalId = nationalId;
        this.lineId = lineId;
        this.phone = phone;
        this.email = email;
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

    public String getFullName() {
        return fullName;
    }

    public void setFullName(String fullName) {
        this.fullName = fullName;
    }

    public String getNationalId() {
        return nationalId;
    }

    public void setNationalId(String nationalId) {
        this.nationalId = nationalId;
    }

    public String getLineId() {
        return lineId;
    }

    public void setLineId(String lineId) {
        this.lineId = lineId;
    }

    public String getPhone() {
        return phone;
    }

    public void setPhone(String phone) {
        this.phone = phone;
    }

    public String getEmail() {
        return email;
    }

    public void setEmail(String email) {
        this.email = email;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
