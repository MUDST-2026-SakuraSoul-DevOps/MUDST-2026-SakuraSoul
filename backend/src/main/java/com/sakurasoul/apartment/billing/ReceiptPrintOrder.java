package com.sakurasoul.apartment.billing;

import com.sakurasoul.apartment.lease.LeaseRoomSnapshot;

import java.util.Comparator;

/**
 * ลำดับหน้าของไฟล์พิมพ์รวม (SSK-169) ตามผังตึก แล้วตามเดือน แล้วตาม id ของใบ
 * <p>
 * ผังตึกคือชั้น ความยาวของเลขห้อง แล้วเลขห้อง ลำดับเดียวกับ RoomRepository.findAllInLayoutOrder
 * (ห้อง 1001 จึงมาหลัง 212 ไม่ใช่ก่อน 101 แบบเรียงตัวอักษร) ถ้าแก้ที่หนึ่งต้องแก้อีกที่ด้วย
 * <p>
 * อ่านเลขห้องกับชั้นจากสำเนาในสัญญา (SSK-180) ไม่ใช่ห้องปัจจุบัน เพราะเป็นเลขที่พิมพ์อยู่บนหน้านั้น
 * คนที่ไล่แจกกระดาษเห็นลำดับตามเลขที่อ่านได้ และห้องที่ถูกลบออกจากผังแล้วก็ยังมีที่ของมัน
 * ตอนนี้สองค่านี้ไม่ต่างกัน เพราะห้องที่เคยมีสัญญาเปลี่ยนเลขหรือลบไม่ได้
 * <p>
 * ใบของห้องเดียวกันเรียงตามเดือน ใบที่ถูกยกยอดจึงอยู่ก่อนบิลที่รับยอดไป ห้องเดียวกันเดือนเดียวกัน (คนละสัญญา)
 * ตัดสินด้วย id ใบที่ออกก่อนอยู่ก่อน ลำดับจึงตายตัวทุกครั้ง
 */
final class ReceiptPrintOrder {

    static final Comparator<Receipt> BY_ROOM_THEN_MONTH = Comparator
            .comparing((Receipt receipt) -> room(receipt).getFloor())
            .thenComparing(receipt -> room(receipt).getRoomNumber().length())
            .thenComparing(receipt -> room(receipt).getRoomNumber())
            .thenComparing(Receipt::getBillingMonth)
            .thenComparing(Receipt::getId);

    private ReceiptPrintOrder() {
    }

    private static LeaseRoomSnapshot room(Receipt receipt) {
        return receipt.getLease().getRoomSnapshot();
    }
}
