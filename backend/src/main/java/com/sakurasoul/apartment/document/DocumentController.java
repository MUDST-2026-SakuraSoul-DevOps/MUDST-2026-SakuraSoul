package com.sakurasoul.apartment.document;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;

/**
 * คลังเอกสารสแกน (SSK-172) ตามสัญญา API docs/api-contract-documents.md ตัวไฟล์เปิดผ่าน /api/attachments/{id}/content
 * <p>
 * ค่าในฟอร์มรับเป็นข้อความทั้งหมด DocumentRules ตอบ 400 ด้วยข้อความในสัญญาเอง
 * roomId กับ tenantId ของการค้นที่แปลงเป็นตัวเลขไม่ได้ Spring ตีกลับเป็น 400 เอง แบบเดียวกับ /api/usage
 */
@RestController
public class DocumentController {

    private final DocumentService documentService;

    public DocumentController(DocumentService documentService) {
        this.documentService = documentService;
    }

    @PostMapping(value = "/api/documents", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @ResponseStatus(HttpStatus.CREATED)
    public DocumentResponse upload(@RequestParam(required = false) MultipartFile file,
            @RequestParam(required = false) String type,
            @RequestParam(required = false) String scanDate,
            @RequestParam(required = false) String description,
            @RequestParam(required = false) String leaseId,
            @RequestParam(required = false) String ticketId,
            @RequestParam(required = false) String receiptId,
            Authentication authentication) {
        return documentService.upload(file, type, scanDate, description, leaseId, ticketId, receiptId,
                authentication.getName());
    }

    @GetMapping("/api/documents")
    public List<DocumentResponse> list(@RequestParam(required = false) String type,
            @RequestParam(required = false) Long roomId,
            @RequestParam(required = false) Long tenantId,
            @RequestParam(required = false) String from,
            @RequestParam(required = false) String to,
            @RequestParam(required = false) String q) {
        return documentService.list(DocumentQuery.of(type, roomId, tenantId, from, to, q));
    }

    @DeleteMapping("/api/documents/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable long id, Authentication authentication) {
        documentService.delete(id, authentication.getName());
    }
}
