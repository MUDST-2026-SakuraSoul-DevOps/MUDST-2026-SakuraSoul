package com.sakurasoul.apartment.document;

import com.sakurasoul.apartment.attachment.Attachment;
import com.sakurasoul.apartment.attachment.AttachmentService;
import com.sakurasoul.apartment.common.NotFoundException;
import com.sakurasoul.apartment.document.DocumentRules.NewDocument;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.time.Clock;
import java.time.LocalDate;
import java.util.List;

/**
 * คลังเอกสารสแกน (SSK-172) ไฟล์เก็บในที่เก็บกลางของ SSK-161 เอกสารเพิ่มชนิด คำอธิบาย และวันที่สแกน
 * <p>
 * ลำดับการตรวจตอนอัปโหลดตามสัญญา API: ไม่มีไฟล์ → ค่าในฟอร์ม (DocumentRules) → ไม่พบเจ้าของ → ขนาด → ชนิดไฟล์
 * สามข้อหลังตรวจที่ AttachmentService.store ตัวเดียวกับไฟล์แนบ
 */
@Service
public class DocumentService {

    private final AttachmentService attachmentService;
    private final DocumentRepository documentRepository;
    private final DocumentReader documentReader;

    /** "วันนี้" ตามเวลาไทยของกฎวันที่สแกนห้ามเป็นวันในอนาคต ดู config.SchedulingConfig */
    private final Clock clock;

    public DocumentService(AttachmentService attachmentService, DocumentRepository documentRepository,
            DocumentReader documentReader, Clock clock) {
        this.attachmentService = attachmentService;
        this.documentRepository = documentRepository;
        this.documentReader = documentReader;
        this.clock = clock;
    }

    @Transactional
    public DocumentResponse upload(MultipartFile file, String type, String scanDate, String description,
            String leaseId, String ticketId, String receiptId, String username) {
        AttachmentService.requireFile(file);
        NewDocument checked = DocumentRules.check(type, scanDate, description, leaseId, ticketId, receiptId,
                LocalDate.now(clock));
        Attachment attachment = attachmentService.store(file, checked.owner(), username);
        Document document = documentRepository.saveAndFlush(
                Document.of(attachment.getId(), checked.type(), checked.description(), checked.scanDate()));
        return documentReader.findById(document.getId())
                .orElseThrow(() -> new IllegalStateException("Document " + document.getId() + " was just saved"));
    }

    @Transactional(readOnly = true)
    public List<DocumentResponse> list(DocumentQuery query) {
        return documentReader.find(query);
    }

    /**
     * soft delete ทำเครื่องหมายที่ไฟล์ของเอกสาร เอกสารกับไฟล์จึงหายพร้อมกัน ไฟล์ดาวน์โหลดไม่ได้อีก
     * ร่องรอยว่าใครลบเมื่อไหร่กับไบต์ยังอยู่ในฐานข้อมูล (ตัดสิน 11 พ.ย.) ยังไม่มี endpoint กู้คืนในเฟสนี้
     */
    @Transactional
    public void delete(long id, String username) {
        DocumentResponse document = documentReader.findById(id)
                .orElseThrow(() -> new NotFoundException("document", id));
        attachmentService.deleteDocumentFile(document.attachmentId(), username);
    }
}
