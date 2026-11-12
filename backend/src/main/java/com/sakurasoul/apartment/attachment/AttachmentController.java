package com.sakurasoul.apartment.attachment;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
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
 * ที่เก็บไฟล์กลาง (SSK-161) ตามสัญญา API docs/api-contract-documents.md ทุก endpoint ต้องล็อกอิน รวม URL ของตัวไฟล์
 * <p>
 * ทุกพารามิเตอร์ไม่บังคับที่นี่และ ownerId รับเป็นข้อความ service ตอบ 400 ด้วยข้อความในสัญญาเอง
 * ไม่ประกาศ produces เพราะ fetch ของหน้าเว็บ (send ใน client.ts) ส่ง Accept: application/json ทุกครั้ง
 * ถ้าประกาศ การดาวน์โหลดไฟล์ด้วย fetch จะได้ 406 (บทเรียนจาก SSK-169)
 */
@RestController
public class AttachmentController {

    private final AttachmentService attachmentService;

    public AttachmentController(AttachmentService attachmentService) {
        this.attachmentService = attachmentService;
    }

    @PostMapping(value = "/api/attachments", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @ResponseStatus(HttpStatus.CREATED)
    public AttachmentResponse upload(@RequestParam(required = false) MultipartFile file,
            @RequestParam(required = false) String ownerType,
            @RequestParam(required = false) String ownerId,
            Authentication authentication) {
        return attachmentService.upload(file, ownerType, ownerId, authentication.getName());
    }

    @GetMapping("/api/attachments")
    public List<AttachmentResponse> list(@RequestParam(required = false) String ownerType,
            @RequestParam(required = false) String ownerId) {
        return attachmentService.list(ownerType, ownerId);
    }

    @GetMapping("/api/attachments/{id}/content")
    public ResponseEntity<byte[]> content(@PathVariable long id) {
        return attachmentService.content(id).asInline();
    }

    @DeleteMapping("/api/attachments/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable long id, Authentication authentication) {
        attachmentService.delete(id, authentication.getName());
    }
}
