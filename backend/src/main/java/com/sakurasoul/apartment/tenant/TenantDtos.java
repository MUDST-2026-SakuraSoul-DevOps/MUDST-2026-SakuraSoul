package com.sakurasoul.apartment.tenant;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public final class TenantDtos {

    private TenantDtos() {
    }

    /**
     * ชุดฟิลด์ตามคำตัดสินของอาจารย์ (11 ก.ย. 2569) บังคับ fullName, nationalId,
     * phone ส่วน lineId กับ email ไม่บังคับ รายละเอียดอยู่ในหัวข้อ US-03 ของ
     * docs/api-contract-lease.md
     * <p>
     * ข้อความทุกอันเขียนแบบเดียวกับ validateTenant ใน frontend/src/domain/tenant.ts
     * คือ "Please enter the" + ชื่อช่องบนหน้าจอ เพราะหน้าเว็บเอา detail ไปโชว์ใต้ฟอร์มตรง ๆ
     * ผู้ใช้จึงต้องเห็นประโยคเดียวกันไม่ว่าจะถูกดักฝั่งไหน
     * <p>
     * <b>ทำไม email ไม่มี @Pattern</b> ฟอร์มฝั่งหน้าเว็บส่งช่องว่างมาเป็นสตริงว่าง
     * ไม่ใช่ null ถ้าแปะ @Pattern ตัวเดียวกับหน้าเว็บ (^[^\s@]+@[^\s@]+\.[^\s@]+$)
     * สตริงว่างจะไม่ผ่านทันที กลายเป็นว่าช่องที่ไม่บังคับกรอกไม่ได้เลยถ้าเว้นว่าง
     * ทางแก้แบบ regex คือเติม ^$| เข้าไปข้างหน้า ซึ่งทำให้ regex สองฝั่งไม่ตรงกันแล้ว
     * ไล่เทียบทีหลังยาก จึงย้ายไปเช็คที่ TenantService.create แทน หลังจาก trim และ
     * แปลงค่าว่างเป็น null เรียบร้อยแล้ว โดยโยน IllegalArgumentException ที่
     * ApiExceptionHandler แปลงเป็น 400 ข้อความ "That email address is not valid" เหมือนกันเป๊ะ
     */
    public record CreateTenantRequest(
            @NotBlank(message = "Please enter the full name")
            @Size(max = 200, message = "The full name cannot be longer than 200 characters")
            String fullName,

            // ผู้เช่าต่างชาติใช้เลขพาสปอร์ตแทนเลขบัตรประชาชน (ดู Kenji Watanabe ใน
            // DevDataSeeder) รูปแบบจึงรับได้ทั้งตัวเลข 13 หลักและพาสปอร์ต 6-20 ตัวอักษร
            //
            // ที่ regexp มี \s* เป็นตัวเลือกแรกเพราะช่องนี้มีสองกฎซ้อนกัน ถ้าไม่ใส่ไว้
            // ค่าที่เป็นช่องว่างล้วนจะผิดทั้ง @NotBlank และ @Pattern พร้อมกัน แล้ว
            // ApiExceptionHandler ที่หยิบ error ตัวแรกไปใส่ detail จะได้ประโยคไหนก็ได้
            // เพราะ bean validation คืน violation มาเป็น Set ที่ไม่มีลำดับแน่นอน
            // สัญญา API สัญญาไว้ว่าเคส "ไม่ได้กรอกเลขบัตร" ต้องได้ "Please enter the national ID"
            // เสมอ การให้ค่าว่างผ่าน @Pattern ไปโดน @NotBlank ตัวเดียวจึงทำให้ตอบตรงสัญญา
            // ทุกครั้ง ส่วนค่าที่กรอกมาจริงแต่ผิดรูปแบบยังโดน @Pattern เหมือนเดิม
            @NotBlank(message = "Please enter the national ID")
            @Pattern(regexp = "^(\\s*|\\d{13}|[A-Za-z0-9]{6,20})$",
                    message = "The national ID must be 13 digits, or a passport number of 6 to 20 characters")
            String nationalId,

            /*
             * ไม่บังคับแล้ว ฟอร์มเพิ่มผู้เช่าที่ทีมหน้าเว็บ merge เข้ามา (SSK-99) ยังไม่มีช่อง
             * Line ID ถ้ายังบังคับไว้ ทุกครั้งที่แอดมินกดเพิ่มผู้เช่าจะได้ 400 กลับมา
             * เก็บเพดานความยาวไว้เพื่อกันค่าที่ยาวเกินคอลัมน์ ค่าว่างจะลงฐานเป็น null (ดู V10)
             */
            @Size(max = 100, message = "The Line ID cannot be longer than 100 characters")
            String lineId,

            @NotBlank(message = "Please enter the phone number")
            @Size(max = 30, message = "The phone number cannot be longer than 30 characters")
            String phone,

            @Size(max = 255, message = "The email cannot be longer than 255 characters")
            String email) {
    }

    public record TenantResponse(Long id, String fullName, String nationalId, String lineId,
            String phone, String email) {

        public static TenantResponse of(Tenant tenant) {
            return new TenantResponse(tenant.getId(), tenant.getFullName(), tenant.getNationalId(),
                    tenant.getLineId(), tenant.getPhone(), tenant.getEmail());
        }
    }
}
