package com.sakurasoul.apartment.billing;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/** หนี้ค้างของแต่ละสัญญา (SSK-163) ตาม docs/api-contract-payments-phase2.md หัวข้อ "หนี้ค้าง" */
@RestController
@RequestMapping("/api/debts")
public class DebtController {

    private final DebtService debtService;

    public DebtController(DebtService debtService) {
        this.debtService = debtService;
    }

    /** หนึ่งแถวต่อสัญญาที่บิลล่าสุดยังมียอดต้องจ่าย ค้างนานสุดก่อน */
    @GetMapping
    public List<DebtResponse> list() {
        return debtService.list();
    }
}
