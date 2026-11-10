package com.sakurasoul.apartment.lease;

import com.sakurasoul.apartment.tenant.Tenant;
import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;

/**
 * ข้อมูลผู้เช่าที่พิมพ์ลงเอกสารสัญญา ณ วันทำสัญญา (SSK-180)
 * <p>
 * ตาราง tenant ยังแก้ได้ตามปกติ เช่นผู้เช่าเปลี่ยนเบอร์หรือเปลี่ยนชื่อ แต่ PDF สัญญาที่เซ็นไปแล้วต้องเหมือนเดิม
 * จึงเก็บครบทั้งสี่ช่องที่แม่แบบสัญญาพิมพ์ ไม่ใช่แค่ชื่อ ถ้าเก็บแค่ชื่อ PDF จะยังต้องไปอ่านเบอร์กับ LINE
 * จากตาราง tenant แล้วเอกสารเก่าจะเปลี่ยนตามการแก้สองช่องนั้นอยู่ดี
 * <p>
 * ใช้กับเอกสารสัญญาเท่านั้น หน้ารายการสัญญากับใบเสร็จยังโชว์ชื่อปัจจุบันของผู้เช่า
 */
@Embeddable
public class LeaseTenantSnapshot {

    @Column(name = "tenant_name_snapshot", nullable = false, length = 200)
    private String fullName;

    @Column(name = "tenant_national_id_snapshot", nullable = false, length = 20)
    private String nationalId;

    @Column(name = "tenant_phone_snapshot", nullable = false, length = 30)
    private String phone;

    /** ว่างได้เหมือน tenant.line_id ตั้งแต่ V10 */
    @Column(name = "tenant_line_id_snapshot", length = 100)
    private String lineId;

    protected LeaseTenantSnapshot() {
    }

    private LeaseTenantSnapshot(String fullName, String nationalId, String phone, String lineId) {
        this.fullName = fullName;
        this.nationalId = nationalId;
        this.phone = phone;
        this.lineId = lineId;
    }

    /** ถ่ายสำเนาผู้เช่า ณ ตอนนี้ */
    public static LeaseTenantSnapshot of(Tenant tenant) {
        return new LeaseTenantSnapshot(tenant.getFullName(), tenant.getNationalId(),
                tenant.getPhone(), tenant.getLineId());
    }

    public String getFullName() {
        return fullName;
    }

    public String getNationalId() {
        return nationalId;
    }

    public String getPhone() {
        return phone;
    }

    public String getLineId() {
        return lineId;
    }
}
