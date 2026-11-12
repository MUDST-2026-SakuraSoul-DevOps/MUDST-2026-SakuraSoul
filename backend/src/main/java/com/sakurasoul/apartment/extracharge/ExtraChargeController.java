package com.sakurasoul.apartment.extracharge;

import com.sakurasoul.apartment.extracharge.ExtraChargeDtos.ExtraChargeRequest;
import com.sakurasoul.apartment.extracharge.ExtraChargeDtos.ExtraChargeResponse;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/** ค่าใช้จ่ายพิเศษต่อห้อง (SSK-165) ไม่ใส่ @Valid เพราะ ExtraChargeRules เป็นคนตอบข้อความ 400 */
@RestController
public class ExtraChargeController {

    private final ExtraChargeService extraChargeService;

    public ExtraChargeController(ExtraChargeService extraChargeService) {
        this.extraChargeService = extraChargeService;
    }

    @GetMapping("/api/extra-charges")
    public List<ExtraChargeResponse> all() {
        return extraChargeService.all();
    }

    @GetMapping("/api/rooms/{id}/extra-charges")
    public List<ExtraChargeResponse> ofRoom(@PathVariable Long id) {
        return extraChargeService.ofRoom(id);
    }

    @PostMapping("/api/rooms/{id}/extra-charges")
    @ResponseStatus(HttpStatus.CREATED)
    public ExtraChargeResponse add(@PathVariable Long id, @RequestBody ExtraChargeRequest request) {
        return extraChargeService.add(id, request);
    }

    @PutMapping("/api/rooms/{id}/extra-charges/{chargeId}")
    public ExtraChargeResponse update(@PathVariable Long id, @PathVariable Long chargeId,
            @RequestBody ExtraChargeRequest request) {
        return extraChargeService.update(id, chargeId, request);
    }

    @DeleteMapping("/api/rooms/{id}/extra-charges/{chargeId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable Long id, @PathVariable Long chargeId) {
        extraChargeService.delete(id, chargeId);
    }
}
