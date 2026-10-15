package com.sakurasoul.apartment.billingschedule;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface BillingScheduleRunRepository extends JpaRepository<BillingScheduleRun, Long> {

    /** เดือนนี้รันไปแล้วหรือยัง ใช้คิด nextRunAt ตัวกันรันซ้ำจริงคือ billing_schedule_run_period_uk */
    boolean existsByPeriod(String period);

    /** รอบล่าสุดที่หน้าเว็บโชว์เป็น Last run */
    Optional<BillingScheduleRun> findTopByOrderByStartedAtDesc();
}
