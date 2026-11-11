package com.sakurasoul.apartment.attachment;

import com.sakurasoul.apartment.common.ConflictException;
import com.sakurasoul.apartment.common.FileTooLargeException;
import com.sakurasoul.apartment.common.NotFoundException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;

/**
 * ที่เก็บไฟล์กลาง (SSK-161) ไฟล์แนบของสัญญา ใบแจ้งซ่อม ใบเสร็จ และการชำระ เอกสารสแกน (SSK-172) เก็บไฟล์ผ่าน {@link #store}
 * <p>
 * ลำดับการตรวจตอนอัปโหลดตามสัญญา API: ไม่มีไฟล์ (400) → ค่าอื่นในฟอร์ม (400) → ไม่พบเจ้าของ (404) → ขนาด (413) → ชนิด (415)
 * ข้อแรกกับข้อที่สองผู้เรียกตรวจ เพราะค่าในฟอร์มของไฟล์แนบกับเอกสารต่างกัน ส่วนที่เหลือตรวจใน store
 */
@Service
public class AttachmentService {

    static final String CHOOSE_FILE = "Please choose a file";

    private final AttachmentRepository attachmentRepository;
    private final AttachmentStore attachmentStore;
    private final AttachmentOwners attachmentOwners;
    private final Clock clock;

    public AttachmentService(AttachmentRepository attachmentRepository, AttachmentStore attachmentStore,
            AttachmentOwners attachmentOwners, Clock clock) {
        this.attachmentRepository = attachmentRepository;
        this.attachmentStore = attachmentStore;
        this.attachmentOwners = attachmentOwners;
        this.clock = clock;
    }

    /** ข้อแรกของการตรวจ ไม่ส่งไฟล์มาหรือไฟล์ว่าง (0 ไบต์) */
    public static void requireFile(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new IllegalArgumentException(CHOOSE_FILE);
        }
    }

    @Transactional
    public AttachmentResponse upload(MultipartFile file, String ownerType, String ownerId, String username) {
        requireFile(file);
        OwnerRef owner = OwnerRef.parse(ownerType, ownerId);
        return AttachmentResponse.of(store(file, owner, username));
    }

    /**
     * ตรวจเจ้าของ ขนาด และชนิด แล้วบันทึกข้อมูลของไฟล์กับตัวไฟล์ใน transaction เดียว ผู้เรียกตรวจว่ามีไฟล์มาแล้ว
     * <p>
     * ดูขนาดที่ Spring บอกก่อนอ่านไบต์ ไฟล์ที่ใหญ่เกินจึงไม่ถูกอ่านเข้าหน่วยความจำ CheckedFile ตรวจซ้ำจากไบต์จริง
     */
    @Transactional
    public Attachment store(MultipartFile file, OwnerRef owner, String username) {
        attachmentOwners.requireExists(owner);
        if (file.getSize() > CheckedFile.MAX_BYTES) {
            throw new FileTooLargeException(CheckedFile.TOO_LARGE);
        }
        CheckedFile checked = CheckedFile.of(file.getOriginalFilename(), bytesOf(file));
        Attachment attachment = attachmentRepository.saveAndFlush(Attachment.create(owner, checked, username, now()));
        attachmentStore.put(attachment.getId(), checked.content());
        return attachment;
    }

    /** ไฟล์แนบของเจ้าของรายหนึ่ง ใหม่สุดก่อน ไม่รวมไฟล์ที่ลบแล้วและไฟล์ของเอกสารสแกน */
    @Transactional(readOnly = true)
    public List<AttachmentResponse> list(String ownerType, String ownerId) {
        OwnerRef owner = OwnerRef.parse(ownerType, ownerId);
        attachmentOwners.requireExists(owner);
        return attachmentRepository.findLooseByOwner(owner.type().name(), owner.id()).stream()
                .map(AttachmentResponse::of)
                .toList();
    }

    /** ตัวไฟล์ ทั้งไฟล์แนบและไฟล์ของเอกสารสแกน ไฟล์ที่ลบแล้วได้ 404 */
    @Transactional(readOnly = true)
    public AttachmentFile content(long id) {
        Attachment attachment = findActive(id);
        return new AttachmentFile(attachment.getFileName(), attachment.kind(), attachmentStore.get(id));
    }

    /**
     * soft delete ทำเครื่องหมายว่าใครลบเมื่อไหร่ ไบต์ยังอยู่ (ตัดสิน 11 พ.ย.)
     * ไฟล์ของเอกสารสแกนลบที่นี่ไม่ได้ (409) ต้องลบที่ตัวเอกสาร เอกสารจะได้ไม่เหลือแต่ข้อมูลที่ไม่มีไฟล์
     */
    @Transactional
    public void delete(long id, String username) {
        Attachment attachment = findActive(id);
        if (attachmentRepository.belongsToDocument(id)) {
            throw new ConflictException("This file belongs to a document. Delete the document instead");
        }
        attachment.markDeleted(username, now());
    }

    /** ใช้กับเอกสารสแกนที่ลบผ่าน /api/documents เอกสารกับไฟล์ของมันถูกลบพร้อมกันที่แถวเดียวนี้ */
    @Transactional
    public void deleteDocumentFile(long id, String username) {
        findActive(id).markDeleted(username, now());
    }

    private Attachment findActive(long id) {
        return attachmentRepository.findByIdAndDeletedAtIsNull(id)
                .orElseThrow(() -> new NotFoundException("attachment", id));
    }

    /** ตัดเศษให้เหลือมิลลิวินาที ค่าที่ตอบตอนอัปโหลดจะได้เท่ากับค่าที่อ่านกลับจากฐานข้อมูลทีหลัง */
    private Instant now() {
        return clock.instant().truncatedTo(ChronoUnit.MILLIS);
    }

    private static byte[] bytesOf(MultipartFile file) {
        try {
            return file.getBytes();
        } catch (IOException ex) {
            throw new UncheckedIOException("Could not read the uploaded file", ex);
        }
    }
}
