package com.sakurasoul.apartment.room;

import java.util.Collection;
import java.util.Set;

/**
 * ตารางที่เก็บประวัติของห้อง ห้องที่มีประวัติลบไม่ได้ ทั้งลบทีละห้อง (RoomService.delete) และลดผังตึก (BuildingConfigService)
 * <p>
 * ทุกตารางที่มี foreign key มาที่ room ต้องเป็นอย่างใดอย่างหนึ่ง (ทีมตัดสิน 10 พ.ย. 2569)
 * <ul>
 *   <li><b>ประวัติ</b> ที่หอต้องเก็บไว้ เช่น สัญญา งานซ่อม ค่ามิเตอร์ ให้เพิ่ม bean ที่ implement interface นี้
 *       แล้วทั้งสองที่จะเช็คให้เองโดยไม่ต้องแก้โค้ดตรงนั้น เดิมต้องจำไปแก้สองที่ ลืมที่ไหนผู้ใช้ได้ 409 ข้อความกลาง ๆ</li>
 *   <li><b>ค่าตั้งของห้อง</b> เช่น room_rate กับ room_extra_charge ใส่ ON DELETE CASCADE ให้ลบตามห้อง ไม่ต้องอยู่ที่นี่</li>
 * </ul>
 * ลำดับของ bean ตาม {@link org.springframework.core.annotation.Order} คือลำดับที่ RoomService.delete ไล่เช็ค
 * ข้อความ 409 บอกประวัติตัวแรกที่เจอ สัญญามาก่อนเพราะเป็นเหตุผลที่ผู้ใช้เจอบ่อยที่สุด
 */
public interface RoomHistorySource {

    /** คำที่ต่อในข้อความ 409 "Unit 101 has &lt;label&gt; and cannot be deleted" */
    String label();

    /** ห้องไหนบ้างในชุดนี้ที่มีประวัติในตารางนี้ ถามทีเดียวทั้งชุด เพราะการลดผังเช็คได้หลายพันห้องในคำขอเดียว */
    Set<Long> roomIdsAmong(Collection<Long> roomIds);
}
