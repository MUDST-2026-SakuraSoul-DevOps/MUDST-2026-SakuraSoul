package com.sakurasoul.apartment.meter;

import com.sakurasoul.apartment.meter.MeterReadingDtos.MeterImportReport;
import com.sakurasoul.apartment.meter.MeterReadingDtos.MeterReadingResponse;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;

/**
 * หน่วยน้ำไฟรายเดือน (SSK-166)
 * <p>
 * ช่อง file ไม่บังคับที่นี่ เพราะไม่ส่งไฟล์มาต้องได้ข้อความที่ตกลงไว้ (Please choose a CSV file) จาก service
 * ไม่ใช่ข้อความของ framework ค่าตั้งต้นของ dryRun เป็น true เหมือน backend จำลอง ลืมส่งจึงไม่บันทึกอะไร
 */
@RestController
public class MeterReadingController {

    private final MeterReadingService meterReadingService;

    public MeterReadingController(MeterReadingService meterReadingService) {
        this.meterReadingService = meterReadingService;
    }

    @GetMapping("/api/meter-readings")
    public List<MeterReadingResponse> list(@RequestParam(required = false) String month) {
        return meterReadingService.list(month);
    }

    @PostMapping(value = "/api/meter-readings/import", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public MeterImportReport importCsv(@RequestParam(name = "file", required = false) MultipartFile file,
            @RequestParam(defaultValue = "true") boolean dryRun,
            @RequestParam(defaultValue = "false") boolean overwrite) {
        return meterReadingService.importCsv(file, dryRun, overwrite);
    }
}
