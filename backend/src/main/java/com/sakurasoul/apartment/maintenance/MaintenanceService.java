package com.sakurasoul.apartment.maintenance;

import com.sakurasoul.apartment.common.NotFoundException;
import com.sakurasoul.apartment.maintenance.MaintenanceDtos.CreateTicketRequest;
import com.sakurasoul.apartment.maintenance.MaintenanceDtos.SupplyUsageRequest;
import com.sakurasoul.apartment.maintenance.MaintenanceDtos.SupplyUsageResponse;
import com.sakurasoul.apartment.maintenance.MaintenanceDtos.TicketResponse;
import com.sakurasoul.apartment.maintenance.MaintenanceDtos.UpdateTicketRequest;
import com.sakurasoul.apartment.room.Room;
import com.sakurasoul.apartment.room.RoomRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * งานซ่อมของ US-12 (บันทึกงานซ่อม) และ US-13 (ประวัติรายห้อง)
 * <p>
 * การตัดสต็อกอุปกรณ์อยู่ในเมธอดเดียวกับการสร้างใบโดยตั้งใจ ทั้งสองอย่างอยู่ใน
 * transaction เดียว ถ้าของไม่พอสักชิ้น ใบแจ้งซ่อมทั้งใบจะไม่ถูกบันทึกเลย ไม่ใช่บันทึกใบ
 * ไว้แล้วค่อยฟ้องว่าเบิกของไม่ได้ ซึ่งจะทิ้งใบครึ่ง ๆ กลาง ๆ ไว้ให้แอดมินตามลบเอง
 */
@Service
public class MaintenanceService {

    /**
     * cost เป็น NUMERIC(10,2) ฐานข้อมูลปัดให้เหลือสองตำแหน่งอยู่แล้ว ถ้าไม่ปัดเองก่อน
     * ตอบกลับ คนที่ส่ง 250.005 มาจะได้ response ว่า 250.005 แต่ GET รอบถัดไปได้ 250.01
     * เหตุผลเดียวกับ MONEY_SCALE ใน LeaseService
     */
    private static final int MONEY_SCALE = 2;

    private final MaintenanceTicketRepository ticketRepository;
    private final MaintenanceSupplyUsageRepository usageRepository;
    private final SupplyItemRepository supplyRepository;
    private final RoomRepository roomRepository;
    private final Clock clock;

    public MaintenanceService(MaintenanceTicketRepository ticketRepository,
            MaintenanceSupplyUsageRepository usageRepository, SupplyItemRepository supplyRepository,
            RoomRepository roomRepository, Clock clock) {
        this.ticketRepository = ticketRepository;
        this.usageRepository = usageRepository;
        this.supplyRepository = supplyRepository;
        this.roomRepository = roomRepository;
        this.clock = clock;
    }

    /**
     * ใบแจ้งซ่อมทั้งอพาร์ตเมนต์ ใบใหม่สุดขึ้นก่อน (US-13-S1) กรองด้วย status กับ roomId ได้
     * <p>
     * กรองในหน่วยความจำด้วยเหตุผลเดียวกับ LeaseService.list คือสองตัวกรองที่ใส่มา
     * ไม่ใส่มาก็ได้รวมกันเป็นสี่แบบ และปริมาณใบแจ้งซ่อมของหอ 24 ห้องอยู่ในหลักร้อย
     * การดึงมาแล้วกรองต่อจึงถูกกว่าความซับซ้อนของ Specification ที่ต้องจ่ายไป
     */
    @Transactional(readOnly = true)
    public List<TicketResponse> list(String status, Long roomId) {
        TicketStatus filter = status == null ? null : TicketStatus.parse(status);

        List<MaintenanceTicket> tickets = ticketRepository.findAllByOrderByReportedAtDescIdDesc().stream()
                .filter(ticket -> filter == null || ticket.getStatus() == filter)
                .filter(ticket -> roomId == null || ticket.getRoom().getId().equals(roomId))
                .toList();

        return responsesOf(tickets);
    }

    /**
     * ประวัติงานซ่อมของห้องเดียว (US-13-S1) ใบใหม่สุดขึ้นก่อน
     * <p>
     * หาห้องก่อนเสมอ ห้องที่ไม่มีต้องได้ 404 ไม่ใช่ลิสต์ว่าง เพราะสองอย่างนั้นคนละเรื่องกัน
     * ห้องที่มีอยู่แต่ไม่เคยซ่อมคือลิสต์ว่าง ส่วน id ที่ไม่มีอยู่คือคำขอที่ผิด
     */
    @Transactional(readOnly = true)
    public List<TicketResponse> listForRoom(Long roomId) {
        findRoom(roomId);
        return responsesOf(ticketRepository.findByRoomIdOrderByReportedAtDescIdDesc(roomId));
    }

    @Transactional(readOnly = true)
    public TicketResponse get(Long id) {
        return responseOf(findTicket(id));
    }

    /**
     * เปิดใบแจ้งซ่อมใหม่ (US-12-S1) พร้อมตัดสต็อกของที่เบิกไปในคำขอเดียวกัน
     * <p>
     * บันทึกใบก่อนแล้วค่อยบันทึกการเบิกของ เพราะแถวการเบิกต้องอ้าง id ของใบ
     * ทั้งหมดอยู่ใน transaction เดียว ของไม่พอสักชิ้นก็ย้อนกลับหมดทั้งใบ
     */
    @Transactional
    public TicketResponse create(CreateTicketRequest request) {
        Room room = findRoom(request.roomId());

        MaintenanceTicket ticket = new MaintenanceTicket(room, request.title(), request.detail(),
                request.maintenanceType(), Priority.parseOrDefault(request.priority()),
                request.assignedTo(), request.reportedBy(), request.scheduledDate(),
                round(request.cost()));

        MaintenanceTicket saved = ticketRepository.save(ticket);
        List<MaintenanceSupplyUsage> usages = consume(saved, request.suppliesUsed());

        return TicketResponse.of(saved, usages.stream().map(SupplyUsageResponse::of).toList());
    }

    /**
     * แก้ใบทีละช่องตามที่หน้าจอสั่ง ช่องที่ไม่ส่งมาแปลว่าไม่แก้
     * <p>
     * การปิดงานตั้ง closedAt ให้เอง และการเปิดใบกลับมาใหม่ล้างทิ้งให้เอง ดู
     * MaintenanceTicket.changeStatus ซึ่งอธิบายไว้ด้วยว่าทำไมการปิดใบต้องไม่ไปแตะ
     * ธงปิดซ่อมของห้อง (US-15 เป็นการล็อกที่แอดมินกดเอง คนละเรื่องกัน)
     */
    @Transactional
    public TicketResponse update(Long id, UpdateTicketRequest request) {
        MaintenanceTicket ticket = findTicket(id);

        if (request.status() != null) {
            ticket.changeStatus(TicketStatus.parse(request.status()), Instant.now(clock));
        }
        // ส่ง "" มาแปลว่าถอนการมอบหมาย ต่างจากไม่ส่งช่องนี้มาเลยซึ่งแปลว่าไม่แก้
        // ใบต้องกลับไปเป็น Wait for Assign ได้ ไม่ใช่ติดชื่อช่างคนเดิมไปตลอด
        if (request.assignedTo() != null) {
            ticket.assignTo(request.assignedTo());
        }
        if (request.priority() != null) {
            ticket.prioritize(Priority.parse(request.priority()));
        }
        if (request.scheduledDate() != null) {
            ticket.reschedule(request.scheduledDate());
        }
        if (request.cost() != null) {
            ticket.recordCost(round(request.cost()));
        }
        if (request.detail() != null) {
            ticket.describe(request.detail());
        }

        return responseOf(ticketRepository.saveAndFlush(ticket));
    }

    /** เบิกของเพิ่มให้ใบที่เปิดไว้แล้ว กฎการตัดสต็อกชุดเดียวกับตอนสร้างใบ */
    @Transactional
    public TicketResponse addSupply(Long id, SupplyUsageRequest request) {
        MaintenanceTicket ticket = findTicket(id);
        consume(ticket, List.of(request));
        return responseOf(ticket);
    }

    /**
     * ตัดสต็อกแล้วบันทึกว่าใบนี้ใช้อะไรไปเท่าไหร่
     * <p>
     * ของที่ไม่มีในคลังเป็น 404 (คำขออ้างถึงของที่ไม่มีอยู่) ส่วนของที่มีแต่ไม่พอเป็น 400
     * (คำขอถูกรูปแบบแต่ทำตามไม่ได้) สองอย่างนี้ต้องแยกกัน เพราะสิ่งที่แอดมินต้องทำต่อ
     * คนละอย่าง อันแรกคือเลือกของผิดชิ้น อันหลังคือไปเติมของก่อน
     * <p>
     * อ่านของด้วย findForUpdateById ไม่ใช่ findById เพราะตรงนี้เป็นการ "อ่านยอดแล้วเขียน
     * ยอดใหม่" ซึ่งสองคำขอที่เข้ามาพร้อมกันจะเขียนทับกันจนของหายไปเงียบ ๆ ถ้าไม่ล็อกแถว
     * เหตุผลเต็มอยู่ที่ SupplyItemRepository.findForUpdateById
     */
    private List<MaintenanceSupplyUsage> consume(MaintenanceTicket ticket,
            Collection<SupplyUsageRequest> requested) {
        if (requested == null || requested.isEmpty()) {
            return List.of();
        }

        Instant now = Instant.now(clock);
        List<MaintenanceSupplyUsage> usages = new ArrayList<>();

        for (SupplyUsageRequest usage : requested) {
            if (usage.quantity() == null || usage.quantity() <= 0) {
                throw new IllegalArgumentException("The quantity used must be greater than 0");
            }

            SupplyItem supply = supplyRepository.findForUpdateById(usage.supplyId())
                    .orElseThrow(() -> new NotFoundException("supply", usage.supplyId()));

            supply.withdraw(usage.quantity());
            supplyRepository.save(supply);
            usages.add(usageRepository.save(
                    new MaintenanceSupplyUsage(ticket, supply, usage.quantity(), now)));
        }

        return usages;
    }

    /** ปัดให้ตรงกับที่ NUMERIC(10,2) เก็บจริง ค่าว่างยังคงว่าง ดู MONEY_SCALE */
    private static BigDecimal round(BigDecimal cost) {
        return cost == null ? null : cost.setScale(MONEY_SCALE, RoundingMode.HALF_UP);
    }

    private Room findRoom(Long roomId) {
        return roomRepository.findById(roomId)
                .orElseThrow(() -> new NotFoundException("unit", roomId));
    }

    private MaintenanceTicket findTicket(Long id) {
        return ticketRepository.findById(id)
                .orElseThrow(() -> new NotFoundException("maintenance ticket", id));
    }

    private TicketResponse responseOf(MaintenanceTicket ticket) {
        return responsesOf(List.of(ticket)).getFirst();
    }

    /**
     * ประกอบ response พร้อมรายการของที่ใช้ โดยดึงการเบิกของทุกใบมาในคิวรีเดียว
     * แล้วจับกลุ่มในหน่วยความจำ ไม่ยิงถามทีละใบ ซึ่งจะกลายเป็น N+1 ทันทีที่หน้า
     * Maintenance Log โหลดใบเป็นร้อย
     */
    private List<TicketResponse> responsesOf(List<MaintenanceTicket> tickets) {
        if (tickets.isEmpty()) {
            return List.of();
        }

        List<Long> ticketIds = tickets.stream().map(MaintenanceTicket::getId).toList();
        Map<Long, List<SupplyUsageResponse>> usagesByTicket =
                usageRepository.findByTicketIdInOrderByIdAsc(ticketIds).stream()
                        .collect(Collectors.groupingBy(usage -> usage.getTicket().getId(),
                                Collectors.mapping(SupplyUsageResponse::of, Collectors.toList())));

        return tickets.stream()
                .map(ticket -> TicketResponse.of(ticket,
                        usagesByTicket.getOrDefault(ticket.getId(), List.of())))
                .toList();
    }
}
