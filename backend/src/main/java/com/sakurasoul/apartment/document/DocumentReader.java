package com.sakurasoul.apartment.document;

import com.sakurasoul.apartment.attachment.AttachmentResponse;
import com.sakurasoul.apartment.attachment.OwnerType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * อ่านเอกสารสแกนพร้อมไฟล์ เจ้าของ ห้อง และผู้เช่าในคิวรีเดียว (SSK-172) ไม่มีการโหลดทีละฉบับ
 * <p>
 * เป็น SQL ตรงเพราะเจ้าของมีสามชนิดและห้องกับผู้เช่ามาคนละทาง ใบเสร็จต้องผ่านสัญญาก่อนถึงห้อง
 * ตัวกรองต่อเข้า WHERE เฉพาะตัวที่ส่งมา ค่าของผู้ใช้ส่งเป็นพารามิเตอร์ทั้งหมด ไม่ได้ต่อเข้า SQL ตรง ๆ
 * ไม่อ่านตาราง attachment_content รายการจึงไม่ลากตัวไฟล์มาด้วย
 */
@Component
class DocumentReader {

    private static final String SELECT = """
            SELECT d.id, d.document_type, d.description, d.scan_date,
                   a.id AS attachment_id, a.file_name, a.content_type, a.size_bytes, a.sha256, a.uploaded_at,
                   a.uploaded_by, a.lease_id, a.ticket_id, a.receipt_id,
                   COALESCE(ol.room_id, rl.room_id, t.room_id) AS room_id,
                   COALESCE(ol.room_number_snapshot, rl.room_number_snapshot, tr.room_number) AS room_number,
                   COALESCE(ol.tenant_id, rl.tenant_id) AS tenant_id,
                   tn.full_name AS tenant_name
            FROM document d
            JOIN attachment a ON a.id = d.attachment_id
            LEFT JOIN lease ol ON ol.id = a.lease_id
            LEFT JOIN receipt r ON r.id = a.receipt_id
            LEFT JOIN lease rl ON rl.id = r.lease_id
            LEFT JOIN maintenance_ticket t ON t.id = a.ticket_id
            LEFT JOIN room tr ON tr.id = t.room_id
            LEFT JOIN tenant tn ON tn.id = COALESCE(ol.tenant_id, rl.tenant_id)
            WHERE a.deleted_at IS NULL
            """;

    /** วันที่สแกนใหม่สุดก่อน วันเดียวกันเรียงตามเวลาอัปโหลด แล้วตาม id ให้ลำดับตายตัว */
    private static final String ORDER = " ORDER BY d.scan_date DESC, a.uploaded_at DESC, d.id DESC";

    private final JdbcClient jdbc;

    DocumentReader(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    List<DocumentResponse> find(DocumentQuery query) {
        StringBuilder sql = new StringBuilder(SELECT);
        Map<String, Object> params = new LinkedHashMap<>();
        if (query.type() != null) {
            sql.append(" AND d.document_type = :type");
            params.put("type", query.type().name());
        }
        if (query.roomId() != null) {
            sql.append(" AND COALESCE(ol.room_id, rl.room_id, t.room_id) = :roomId");
            params.put("roomId", query.roomId());
        }
        if (query.tenantId() != null) {
            sql.append(" AND COALESCE(ol.tenant_id, rl.tenant_id) = :tenantId");
            params.put("tenantId", query.tenantId());
        }
        if (query.from() != null) {
            sql.append(" AND d.scan_date >= :from");
            params.put("from", query.from());
        }
        if (query.to() != null) {
            sql.append(" AND d.scan_date <= :to");
            params.put("to", query.to());
        }
        if (query.q() != null) {
            sql.append("""
                     AND (d.description ILIKE :q ESCAPE '\\' OR a.file_name ILIKE :q ESCAPE '\\'
                          OR COALESCE(ol.room_number_snapshot, rl.room_number_snapshot, tr.room_number) ILIKE :q ESCAPE '\\'
                          OR tn.full_name ILIKE :q ESCAPE '\\')""");
            params.put("q", query.likePattern());
        }
        return jdbc.sql(sql.append(ORDER).toString()).params(params).query(DocumentReader::row).list();
    }

    /** เอกสารที่ยังไม่ถูกลบ */
    Optional<DocumentResponse> findById(long id) {
        return jdbc.sql(SELECT + " AND d.id = :id").param("id", id).query(DocumentReader::row).optional();
    }

    private static DocumentResponse row(ResultSet rs, int rowNum) throws SQLException {
        long attachmentId = rs.getLong("attachment_id");
        return new DocumentResponse(
                rs.getLong("id"),
                DocumentType.valueOf(rs.getString("document_type")),
                rs.getString("description"),
                rs.getObject("scan_date", LocalDate.class),
                owner(rs),
                rs.getString("file_name"),
                rs.getString("content_type"),
                rs.getLong("size_bytes"),
                rs.getString("sha256"),
                rs.getTimestamp("uploaded_at").toInstant(),
                rs.getString("uploaded_by"),
                attachmentId,
                AttachmentResponse.contentUrl(attachmentId));
    }

    private static DocumentResponse.Owner owner(ResultSet rs) throws SQLException {
        OwnerType kind;
        long ownerId;
        if (rs.getObject("lease_id") != null) {
            kind = OwnerType.LEASE;
            ownerId = rs.getLong("lease_id");
        } else if (rs.getObject("receipt_id") != null) {
            kind = OwnerType.RECEIPT;
            ownerId = rs.getLong("receipt_id");
        } else if (rs.getObject("ticket_id") != null) {
            kind = OwnerType.MAINTENANCE_TICKET;
            ownerId = rs.getLong("ticket_id");
        } else {
            throw new IllegalStateException("Document " + rs.getLong("id") + " has no lease, receipt or ticket");
        }
        Long tenantId = rs.getObject("tenant_id", Long.class);
        return new DocumentResponse.Owner(kind, ownerId, rs.getLong("room_id"), rs.getString("room_number"),
                tenantId, rs.getString("tenant_name"));
    }
}
