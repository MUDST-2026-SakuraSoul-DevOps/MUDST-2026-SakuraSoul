package com.sakurasoul.apartment.lease;

/**
 * รอบการเรียกเก็บค่าเช่า ค่าที่รับได้ตรงกับ CHECK constraint lease_cycle_ck ใน V4
 * และตรงกับ type BillingCycle ฝั่งหน้าเว็บ (frontend/src/api/types.ts)
 */
public enum BillingCycle {

    MONTHLY,
    YEARLY
}
