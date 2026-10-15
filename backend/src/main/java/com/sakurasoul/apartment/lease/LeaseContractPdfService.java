package com.sakurasoul.apartment.lease;

import com.sakurasoul.apartment.common.AppTime;
import com.sakurasoul.apartment.common.NotFoundException;
import com.sakurasoul.apartment.pdf.PdfDocument;
import com.sakurasoul.apartment.pdf.PdfRenderer;
import com.sakurasoul.apartment.pdf.DocumentFormat;
import com.sakurasoul.apartment.room.Room;
import com.sakurasoul.apartment.tenant.Tenant;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * ทำไฟล์ PDF ของสัญญาเช่าไว้ให้ทั้งสองฝ่ายเซ็น (US-11 / SSK-17)
 * <p>
 * เอกสารนี้พิมพ์จากข้อมูลที่ล็อกไว้กับสัญญาใบนั้นล้วน ๆ ไม่ได้อ่าน apartment_config เลย
 * ด้วยเหตุผลเดียวกับใบเสร็จ (US-16-S3) สัญญาที่เซ็นไปแล้วต้องพิมพ์ออกมาได้เงื่อนไข
 * ชุดเดิมเสมอ ถึงแอดมินจะขึ้นค่าไฟของตึกไปแล้วสิบรอบก็ตาม
 * <p>
 * อยู่ใน package lease ไม่ใช่ pdf เพราะเป็นเรื่องของสัญญาเช่า ส่วน package pdf
 * เก็บเฉพาะเครื่องมือกลางที่ทั้งใบเสร็จและสัญญาใช้ร่วมกัน (ตัว render กับตัวฟอร์แมต)
 * ถ้าเอา service ของแต่ละ feature ไปกองไว้ที่นั่นด้วย จะกลายเป็นการแบ่งโค้ดตามชนิด
 * ของงานแทนที่จะแบ่งตาม feature ซึ่งเป็นสิ่งที่ README บอกว่าโปรเจกต์นี้ไม่ทำ
 */
@Service
public class LeaseContractPdfService {

    /** ข้อความแทนวันสิ้นสุดที่ยังไม่กำหนด ต้องเป็นคำ ไม่ใช่ช่องว่างบนกระดาษที่เซ็นกัน */
    private static final String OPEN_ENDED = "No end date";

    private final LeaseRepository leaseRepository;
    private final PdfRenderer pdfRenderer;

    public LeaseContractPdfService(LeaseRepository leaseRepository, PdfRenderer pdfRenderer) {
        this.leaseRepository = leaseRepository;
        this.pdfRenderer = pdfRenderer;
    }

    /**
     * อ่านสัญญาแล้ว render เป็น PDF
     * <p>
     * ทั้งก้อนอยู่ใน transaction เดียวเพราะต้องแตะห้องกับผู้เช่าที่โหลดแบบ LAZY
     * และ application.yml ปิด open-in-view ไว้
     * <p>
     * ชื่อไฟล์เป็น lease-contract-{id}.pdf ตัวอักษรอังกฤษล้วนโดยตั้งใจ ชื่อไฟล์ภาษาไทย
     * ต้องเข้ารหัสเพิ่มใน header ตาม RFC 6266 ซึ่งเบราว์เซอร์เก่าบางตัวยังอ่านไม่ตรงกัน
     * แล้วผู้ใช้จะได้ไฟล์ชื่ออ่านไม่ออก ส่วนเลข id ทำให้ดาวน์โหลดหลายใบแล้วไม่ทับกัน
     */
    @Transactional(readOnly = true)
    public PdfDocument render(Long id) {
        Lease lease = leaseRepository.findById(id)
                .orElseThrow(() -> new NotFoundException("lease", id));

        byte[] content = pdfRenderer.render("pdf/lease-contract", modelOf(lease));
        return new PdfDocument("lease-contract-" + lease.getId() + ".pdf", content);
    }

    private static Map<String, Object> modelOf(Lease lease) {
        Tenant tenant = lease.getTenant();
        Room room = lease.getRoom();
        LeaseCharges charges = lease.getCharges();

        Map<String, Object> model = new LinkedHashMap<>();
        // วันที่ออกเอกสารคือวันนี้ตามเวลาไทย ไม่ใช่วันที่เซ็นสัญญา เพราะสัญญาใบเดียว
        // พิมพ์ซ้ำได้หลายครั้ง เช่นตอนผู้เช่าทำหาย ส่วนวันเริ่มสัญญาอยู่ในข้อ 3 อยู่แล้ว
        model.put("issuedDate", DocumentFormat.date(AppTime.today()));

        model.put("tenantName", tenant.getFullName());
        model.put("tenantNationalId", tenant.getNationalId());
        model.put("tenantPhone", tenant.getPhone());
        model.put("tenantLineId", tenant.getLineId());

        model.put("roomNumber", room.getRoomNumber());
        model.put("floor", String.valueOf(room.getFloor()));

        model.put("startDate", DocumentFormat.date(lease.getStartDate()));
        model.put("endDate", DocumentFormat.dateOrDash(lease.getEndDate(), OPEN_ENDED));
        model.put("monthlyRent", DocumentFormat.money(lease.getMonthlyRent()));
        model.put("billingCycle", billingCycleText(lease.getBillingCycle()));

        model.put("securityDeposit", DocumentFormat.money(charges.getSecurityDeposit()));
        model.put("electricRatePerUnit", DocumentFormat.money(charges.getElectricRatePerUnit()));
        model.put("waterRatePerUnit", DocumentFormat.money(charges.getWaterRatePerUnit()));
        model.put("commonAreaFee", DocumentFormat.money(charges.getCommonAreaFee()));
        model.put("internetFee", DocumentFormat.money(charges.getInternetFee()));
        return model;
    }

    /** เอกสารที่ผู้เช่าเซ็นต้องอ่านรู้เรื่องทั้งใบ ค่า enum ตรง ๆ ไม่ใช่ภาษาคน */
    private static String billingCycleText(BillingCycle billingCycle) {
        return billingCycle == BillingCycle.YEARLY ? "Yearly" : "Monthly";
    }
}
