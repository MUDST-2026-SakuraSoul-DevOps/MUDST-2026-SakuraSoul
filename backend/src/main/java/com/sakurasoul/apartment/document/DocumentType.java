package com.sakurasoul.apartment.document;

import com.sakurasoul.apartment.common.Whitespace;

/**
 * ชนิดของเอกสารสแกน (SSK-172) ตรงกับ document_type_ck (V23)
 * หมวดในหน้าเว็บ 'Contract', 'Maintenance report', 'Receipt' ตรงกับสามค่านี้ตามลำดับ
 */
public enum DocumentType {

    CONTRACT_SCAN,
    MAINTENANCE_REPORT,
    RECEIPT_SCAN;

    static final String MESSAGE = "Document type must be CONTRACT_SCAN, MAINTENANCE_REPORT or RECEIPT_SCAN";

    /** ตรงตัวพิมพ์ ตัดช่องว่างหัวท้าย ค่าอื่นได้ 400 ตามสัญญา */
    static DocumentType parse(String text) {
        if (text != null) {
            for (DocumentType type : values()) {
                if (type.name().equals(Whitespace.trim(text))) {
                    return type;
                }
            }
        }
        throw new IllegalArgumentException(MESSAGE);
    }
}
