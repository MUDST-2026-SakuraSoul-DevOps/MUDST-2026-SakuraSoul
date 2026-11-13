package com.sakurasoul.apartment.maintenance;

/**
 * ความมั่นใจของคำแนะนำรอบซ่อม (SSK-173) ชื่อค่าตรงกับ PredictionConfidence ใน frontend/src/api/types.ts
 * <p>
 * มาจากว่าช่วงห่างระหว่างงานที่ผ่านมาแกว่งแค่ไหน (MAD หารด้วยมัธยฐาน) ดู MaintenancePredictor.confidenceOf
 */
public enum PredictionConfidence {
    /** ช่วงห่างแกว่งไม่เกิน 10% ของมัธยฐาน */
    HIGH,
    /** แกว่งไม่เกิน 30% */
    MEDIUM,
    /** แกว่งมากกว่านั้น วันที่คาดการณ์เป็นแค่จุดตั้งต้นให้แอดมินคิดต่อ */
    LOW
}
