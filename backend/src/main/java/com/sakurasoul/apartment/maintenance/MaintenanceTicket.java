package com.sakurasoul.apartment.maintenance;

import com.sakurasoul.apartment.room.Room;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;

/**
 * ใบแจ้งซ่อมหนึ่งใบ (US-12 บันทึกงานซ่อม / US-13 ประวัติรายห้อง)
 * <p>
 * ถือ Room เป็น association ไม่ใช่ id เปล่า ๆ เพราะทุก response ของใบแจ้งซ่อมต้องส่ง
 * เลขห้องไปด้วยตามสัญญา API (ฟิลด์ roomNumber ใน MaintenanceTicket ฝั่งหน้าเว็บ)
 * เหตุผลเดียวกับ Lease โหลดแบบ LAZY แล้วแตะตอนแปลงเป็น DTO ซึ่งยังอยู่ใน transaction เดิม
 * <p>
 * ของที่ใช้ไปในงานนี้ไม่ได้ผูกเป็น collection ไว้ที่นี่ แต่เก็บเป็นแถวในตาราง
 * maintenance_supply_usage แล้วให้ MaintenanceService ดึงมารวมทีเดียวตอนประกอบ
 * response เหตุผลคือหน้าจอที่ต้องการรายการของที่ใช้มีแค่ตอนตอบ API และการ join
 * collection มากับทุกคิวรีรายการจะทำให้แถวซ้ำโดยไม่ได้ใช้
 */
@Entity
@Table(name = "maintenance_ticket")
public class MaintenanceTicket {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "room_id", nullable = false)
    private Room room;

    @Column(name = "title", nullable = false, length = 200)
    private String title;

    @Column(name = "detail", length = 2000)
    private String detail;

    @Column(name = "maintenance_type", length = 50)
    private String maintenanceType;

    @Enumerated(EnumType.STRING)
    @Column(name = "priority", nullable = false, length = 10)
    private Priority priority;

    @Column(name = "assigned_to", length = 100)
    private String assignedTo;

    @Column(name = "reported_by", length = 100)
    private String reportedBy;

    @Column(name = "scheduled_date")
    private LocalDate scheduledDate;

    /** ว่างได้ ตอนเปิดใบยังไม่รู้ราคา ค่อยมากรอกตอนปิดงาน */
    @Column(name = "cost", precision = 10, scale = 2)
    private BigDecimal cost;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 15)
    private TicketStatus status;

    @Enumerated(EnumType.STRING)
    @Column(name = "source", nullable = false, length = 10)
    private TicketSource source;

    /** ใบแจ้งเตือนที่เป็นต้นทาง ว่างได้ ใบที่แอดมินเปิดเองไม่มีต้นทาง */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "reminder_id")
    private MaintenanceReminder reminder;

    @Column(name = "reported_at", nullable = false)
    private Instant reportedAt;

    @Column(name = "closed_at")
    private Instant closedAt;

    protected MaintenanceTicket() {
    }

    /** ใบที่แอดมินกดเปิดเอง เริ่มที่ OPEN เสมอ การปิดงานทำผ่าน changeStatus */
    public MaintenanceTicket(Room room, String title, String detail, String maintenanceType,
            Priority priority, String assignedTo, String reportedBy, LocalDate scheduledDate,
            BigDecimal cost) {
        this.room = room;
        this.title = title;
        this.detail = detail;
        this.maintenanceType = maintenanceType;
        this.priority = priority;
        this.assignedTo = trimToNull(assignedTo);
        this.reportedBy = reportedBy;
        this.scheduledDate = scheduledDate;
        this.cost = cost;
        this.status = TicketStatus.OPEN;
        this.source = TicketSource.MANUAL;
    }

    /**
     * ใบที่ระบบสร้างให้เองจากการแจ้งเตือนตามรอบ (US-14-S2)
     * <p>
     * ชื่อเรื่องกับรายละเอียดคัดลอกมาจากใบแจ้งเตือน ณ วันที่ยิง ไม่ได้อ้างอิงกลับไปอ่านสด
     * เพราะแอดมินแก้ชื่อใบแจ้งเตือนทีหลังได้ ถ้าอ้างกลับไป ประวัติงานซ่อมของเดือนก่อน
     * จะเปลี่ยนชื่อตามไปด้วยทั้งที่งานที่ทำไปแล้วคืออีกงานหนึ่ง หลักการเดียวกับอัตรา
     * ค่าสาธารณูปโภคที่ถูกล็อกไว้ในสัญญา (ดู LeaseCharges)
     */
    public static MaintenanceTicket fromReminder(MaintenanceReminder reminder, Room room) {
        MaintenanceTicket ticket = new MaintenanceTicket(room, reminder.getName(), reminder.getNotes(),
                null, reminder.getPriority(), null, null, reminder.getNextDueDate(), null);
        ticket.source = TicketSource.RECURRING;
        ticket.reminder = reminder;
        return ticket;
    }

    @PrePersist
    void onCreate() {
        if (reportedAt == null) {
            reportedAt = Instant.now();
        }
    }

    /**
     * เปลี่ยนสถานะงาน พร้อมดูแลเวลาปิดงานให้สอดคล้องกันเสมอ
     * <p>
     * ปิดงานแล้วตั้ง closedAt เปิดใบกลับมาใหม่แล้วล้างทิ้ง ที่ต้องล้างเพราะใบที่กลับมา
     * เป็น OPEN แต่ยังมีเวลาปิดงานติดอยู่จะทำให้รายงานนับงานที่ปิดแล้วเกินจริง
     * <p>
     * **ไม่แตะธง under_maintenance ของห้องเลย** การล็อกห้องเป็นซ่อมบำรุงเป็นเรื่องของ
     * US-15 ที่แอดมินกดเองผ่าน PATCH /api/rooms/{id}/status ถ้าการปิดใบแจ้งซ่อมไป
     * ปลดล็อกห้องให้เอง ห้องที่แอดมินตั้งใจปิดไว้ซ่อมใหญ่จะถูกเปิดคืนเพราะงานย่อยงานหนึ่ง
     * เสร็จ ซึ่งไม่ใช่สิ่งที่ผู้ใช้สั่ง (สองเรื่องนี้แยกกันตามที่เขียนไว้ใน V5__room_under_maintenance.sql)
     */
    public void changeStatus(TicketStatus newStatus, Instant now) {
        this.status = newStatus;
        this.closedAt = newStatus.isClosed() ? now : null;
    }

    /**
     * มอบหมายงานให้ช่าง หรือถอนการมอบหมายเมื่อส่งค่าว่างมา
     * <p>
     * ที่ต้องเก็บช่องว่างล้วนเป็น null เพราะป้ายบนหน้าจอคำนวณจาก
     * {@code status === 'OPEN' && assignedTo == null} ขึ้น Wait for Assign
     * (ดู docs/api-contract-maintenance.md) ถ้าเก็บเป็นสตริงว่าง ใบที่ยังไม่มีคนรับ
     * จะขึ้นป้าย Pending ทั้งที่ยังไม่มีใครรับงาน และแอดมินจะถอนการมอบหมายไม่ได้เลย
     * เพราะ PATCH ถือว่าช่องที่ไม่ส่งมาคือ "ไม่แก้" กฎ trim นี้ชุดเดียวกับ SKU ของอุปกรณ์
     */
    public void assignTo(String assignedTo) {
        this.assignedTo = trimToNull(assignedTo);
    }

    public void prioritize(Priority priority) {
        this.priority = priority;
    }

    public void reschedule(LocalDate scheduledDate) {
        this.scheduledDate = scheduledDate;
    }

    public void recordCost(BigDecimal cost) {
        this.cost = cost;
    }

    public void describe(String detail) {
        this.detail = detail;
    }

    /** ยังเป็นงานค้างของห้องอยู่ไหม ใช้นับ openMaintenanceCount บนการ์ดห้อง */
    public boolean isOpen() {
        return !status.isClosed();
    }

    /** ชื่อช่างที่กรอกมาเป็นช่องว่างล้วนถือว่ายังไม่มีคนรับงาน กฎเดียวกับ SKU ใน SupplyService */
    private static String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    public Long getId() {
        return id;
    }

    public Room getRoom() {
        return room;
    }

    public String getTitle() {
        return title;
    }

    public String getDetail() {
        return detail;
    }

    public String getMaintenanceType() {
        return maintenanceType;
    }

    public Priority getPriority() {
        return priority;
    }

    public String getAssignedTo() {
        return assignedTo;
    }

    public String getReportedBy() {
        return reportedBy;
    }

    public LocalDate getScheduledDate() {
        return scheduledDate;
    }

    public BigDecimal getCost() {
        return cost;
    }

    public TicketStatus getStatus() {
        return status;
    }

    public TicketSource getSource() {
        return source;
    }

    public MaintenanceReminder getReminder() {
        return reminder;
    }

    public Instant getReportedAt() {
        return reportedAt;
    }

    public Instant getClosedAt() {
        return closedAt;
    }
}
