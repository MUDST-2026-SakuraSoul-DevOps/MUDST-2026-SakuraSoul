package com.sakurasoul.apartment.tenant;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public final class TenantDtos {

    private TenantDtos() {
    }

    public record CreateTenantRequest(
            @NotBlank(message = "ต้องกรอกชื่อผู้เช่า")
            @Size(max = 200, message = "ชื่อยาวเกิน 200 ตัวอักษร")
            String fullName,

            @Size(max = 30, message = "เบอร์โทรยาวเกิน 30 ตัวอักษร")
            String phone,

            @Size(max = 20, message = "เลขบัตรประชาชนยาวเกิน 20 ตัวอักษร")
            String nationalId) {
    }

    public record TenantResponse(Long id, String fullName, String phone, String nationalId) {

        public static TenantResponse of(Tenant tenant) {
            return new TenantResponse(tenant.getId(), tenant.getFullName(), tenant.getPhone(),
                    tenant.getNationalId());
        }
    }
}
