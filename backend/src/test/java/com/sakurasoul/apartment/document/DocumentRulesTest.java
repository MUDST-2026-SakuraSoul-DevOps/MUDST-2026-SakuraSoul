package com.sakurasoul.apartment.document;

import com.sakurasoul.apartment.attachment.OwnerRef;
import com.sakurasoul.apartment.attachment.OwnerType;
import com.sakurasoul.apartment.document.DocumentRules.NewDocument;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class DocumentRulesTest {

    private static final LocalDate TODAY = LocalDate.of(2026, 11, 28);

    @Test
    @DisplayName("SSK-172 ค่าครบได้เอกสารใหม่ คำอธิบายตัดช่องว่าง ว่างเป็น null วันนี้ใช้ได้")
    void aValidDocument() {
        assertThat(check("MAINTENANCE_REPORT", "2026-11-28", "  รายงานซ่อมแอร์ห้อง 203 ", null, "41", null))
                .isEqualTo(new NewDocument(DocumentType.MAINTENANCE_REPORT, TODAY, "รายงานซ่อมแอร์ห้อง 203",
                        new OwnerRef(OwnerType.MAINTENANCE_TICKET, 41)));
        assertThat(check("CONTRACT_SCAN", "2026-01-05", "   ", "4", "", " ").description()).isNull();
        assertThat(check("RECEIPT_SCAN", "2026-01-05", null, null, null, "12").owner())
                .isEqualTo(new OwnerRef(OwnerType.RECEIPT, 12));
    }

    @Test
    @DisplayName("SSK-172 ชนิดผิดหรือไม่ส่ง ได้ข้อความในสัญญา และถูกตรวจก่อนข้ออื่น")
    void typeComesFirst() {
        for (String type : new String[] {null, "", "Contract", "contract_scan", "PHOTO"}) {
            assertThatThrownBy(() -> check(type, "bad", null, null, null, null))
                    .as(type)
                    .hasMessage("Document type must be CONTRACT_SCAN, MAINTENANCE_REPORT or RECEIPT_SCAN");
        }
    }

    @Test
    @DisplayName("SSK-172 วันที่สแกนไม่ส่ง ผิดรูป หรือไม่มีจริง ได้ข้อความเดียวกัน วันพรุ่งนี้ได้ข้อความวันในอนาคต")
    void scanDate() {
        for (String date : new String[] {null, "", "28/11/2026", "2026-11-28T10:00", "2026-02-30", "2026-1-5"}) {
            assertThatThrownBy(() -> check("CONTRACT_SCAN", date, null, "4", null, null))
                    .as(date)
                    .hasMessage("Please choose the scan date (YYYY-MM-DD)");
        }
        assertThatThrownBy(() -> check("CONTRACT_SCAN", "2026-11-29", null, "4", null, null))
                .hasMessage("The scan date cannot be in the future");
        // ปี 0000 ผ่าน LocalDate.parse และ PostgreSQL เก็บเป็นปีก่อนคริสตกาล
        for (String date : new String[] {"0000-01-01", "0001-01-01", "1899-12-31"}) {
            assertThatThrownBy(() -> check("CONTRACT_SCAN", date, null, "4", null, null))
                    .as(date)
                    .hasMessage("Please choose the scan date (YYYY-MM-DD)");
        }
        assertThat(check("CONTRACT_SCAN", "1900-01-01", null, "4", null, null).scanDate())
                .isEqualTo(LocalDate.of(1900, 1, 1));
        // วันที่ตรวจก่อนเจ้าของ
        assertThatThrownBy(() -> check("CONTRACT_SCAN", "2026-11-29", null, null, null, null))
                .hasMessage("The scan date cannot be in the future");
    }

    @Test
    @DisplayName("SSK-172 เจ้าของต้องหนึ่งช่องพอดี เป็นจำนวนเต็มบวก")
    void exactlyOneOwner() {
        String[][] owners = {{null, null, null}, {"4", "41", null}, {"4", null, "12"}, {"", " ", ""},
                {"abc", null, null}, {"0", null, null}, {"-1", null, null}};
        for (String[] owner : owners) {
            assertThatThrownBy(() -> check("CONTRACT_SCAN", "2026-11-01", null, owner[0], owner[1], owner[2]))
                    .as("%s %s %s", owner[0], owner[1], owner[2])
                    .hasMessage("Choose one lease, ticket or receipt for this document");
        }
    }

    @Test
    @DisplayName("SSK-172 คำอธิบาย 200 ตัวพอดีผ่าน 201 ตัวไม่ผ่าน นับตัวอักษรไทยทีละตัว ตรวจหลังเจ้าของ")
    void descriptionLength() {
        assertThat(check("CONTRACT_SCAN", "2026-11-01", "ก".repeat(200), "4", null, null).description())
                .hasSize(200);
        assertThatThrownBy(() -> check("CONTRACT_SCAN", "2026-11-01", "ก".repeat(201), "4", null, null))
                .hasMessage("The description must be 200 characters or fewer");
        // อีโมจิ 200 ตัวเป็น 400 char ของ Java แต่ 200 ตัวอักษรตามที่ PostgreSQL นับ
        assertThat(check("CONTRACT_SCAN", "2026-11-01", "😀".repeat(200), "4", null, null)).isNotNull();
        assertThatThrownBy(() -> check("CONTRACT_SCAN", "2026-11-01", "ก".repeat(201), null, null, null))
                .hasMessage("Choose one lease, ticket or receipt for this document");
    }

    @Test
    @DisplayName("SSK-172 อักขระควบคุมในคำอธิบายถูกตัด (PostgreSQL ไม่รับ NUL) ช่องว่าง NBSP รอบค่าถูกตัดทุกช่อง")
    void controlCharactersAndNbsp() {
        assertThat(check("CONTRACT_SCAN", "2026-11-01", "a\u0000b\tc\n", "4", null, null).description())
                .isEqualTo("abc");
        assertThat(check("CONTRACT_SCAN", "2026-11-01", "\u0000", "4", null, null).description()).isNull();
        NewDocument padded = check("CONTRACT_SCAN\u00A0", "\u00A02026-11-01", null, "\u00A04\u00A0", null, null);
        assertThat(padded.type()).isEqualTo(DocumentType.CONTRACT_SCAN);
        assertThat(padded.owner()).isEqualTo(new OwnerRef(OwnerType.LEASE, 4));
    }

    private static NewDocument check(String type, String scanDate, String description, String leaseId,
            String ticketId, String receiptId) {
        return DocumentRules.check(type, scanDate, description, leaseId, ticketId, receiptId, TODAY);
    }
}
