-- ผังตึกตั้งค่าได้ (SSK-160) และสำเนาข้อมูลห้อง ผู้เช่า กับแม่แบบลงในสัญญา (SSK-180)
--
-- สองการ์ดอยู่ไฟล์เดียวกันเพราะแตะตาราง lease กับแม่แบบสัญญาชุดเดียวกัน คอมเมนต์ของหัวหน้าทีมใน SSK-160
-- ขอให้ทำพร้อม SSK-180 ถ้าแยกไฟล์ จะมีช่วงที่ผังตึกเปลี่ยนได้แล้วแต่สัญญาเก่ายังอ่านเลขห้องจากห้องปัจจุบัน
-- ซึ่งเป็นปัญหาที่ SSK-180 ตั้งใจกันตั้งแต่ต้น
--
-- ข้อสรุปที่ทีมตกลงไว้วันที่ 7 พ.ย. 2569 (คอมเมนต์ในการ์ด SSK-180):
-- - ทำสำเนาในสัญญา ไม่ทำ amendment จึงไม่มีตาราง lease_amendment ถ้าจะเปลี่ยนเงื่อนไขให้ปิดสัญญาแล้วทำใบใหม่
-- - อัตราดอกเบี้ยกับวันผ่อนผันยังไม่อยู่ในไฟล์นี้ ค่าต้นทางใน apartment_config ยังไม่มี จะเพิ่มพร้อม
--   migration ของ SSK-164 แล้ว backfill สัญญาเดิมเป็น 0 ตามคอมเมนต์ในการ์ดนั้น

-- 1) ชั้นไม่ถูกล็อกไว้ที่ 1 ถึง 2 อีกต่อไป
--
-- เพดาน 50 ชั้นเป็นกฎของการตั้งผังที่ building_config กับ BuildingConfigRules ไม่ใช่ของห้อง
-- ห้องหนึ่งห้องรู้แค่ว่าตัวเองอยู่ชั้นที่เท่าไหร่ ตัวที่ต้องรู้ว่าตึกสูงได้แค่ไหนคือผัง
ALTER TABLE room DROP CONSTRAINT room_floor_ck;
ALTER TABLE room ADD CONSTRAINT room_floor_ck CHECK (floor >= 1);

-- 2) ผังตึก จำนวนชั้นกับจำนวนห้องต่อชั้น มีชุดเดียวทั้งระบบ แบบเดียวกับ apartment_config ใน V3
--
-- ห้องจริงยังอยู่ที่ตาราง room เหมือนเดิม ตารางนี้เก็บแค่ผังที่แอดมินตั้งไว้ล่าสุด
-- PUT /api/building-config เพิ่มห้องที่ผังมีแต่ยังไม่มีจริง และลบห้องที่อยู่นอกผังใน transaction เดียวกัน
-- จำนวนห้องที่มีจริงจึงอาจน้อยกว่า floors x rooms_per_floor ได้ ถ้าเคยลบห้องทีละห้องด้วย DELETE /api/rooms/{id}
-- (API ตอบจำนวนจริงจากตาราง room เป็น totalRooms)
--
-- ค่าตั้งต้น 2 ชั้น ชั้นละ 12 ห้อง ตรงกับห้อง 24 ห้องที่ V2__seed_rooms.sql ใส่ไว้
CREATE TABLE building_config (
    id              SMALLINT    PRIMARY KEY,
    floors          SMALLINT    NOT NULL,
    rooms_per_floor SMALLINT    NOT NULL,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT building_config_single_row_ck CHECK (id = 1),
    CONSTRAINT building_config_floors_ck     CHECK (floors BETWEEN 1 AND 50),
    -- ลำดับห้องในชั้นมีสองหลัก ห้องที่ 100 ของชั้น 1 จะได้เลข 200 ชนกับห้องแรกของชั้น 2
    CONSTRAINT building_config_rooms_ck      CHECK (rooms_per_floor BETWEEN 1 AND 99)
);

INSERT INTO building_config (id, floors, rooms_per_floor, updated_at)
VALUES (1, 2, 12, now());

-- 3) สำเนาในสัญญา (SSK-180) อาจารย์ให้คอมเมนต์ว่า "สัญญาเก่าต้องไม่เปลี่ยนเมื่อมีการเปลี่ยนแปลงใหม่"
--
-- เดิม PDF สัญญาอ่านเลขห้องกับชั้นจากตาราง room และข้อมูลผู้เช่าจากตาราง tenant ปัจจุบัน พอผังตึกตั้งได้
-- หรือแก้ชื่อผู้เช่า เอกสารที่เซ็นไปแล้วจะเปลี่ยนตาม สัญญาจึงต้องเก็บค่าพวกนี้ไว้ในตัวเองตอนสร้าง
-- เหมือนที่เก็บค่าเช่ากับอัตราค่าน้ำค่าไฟไว้ตั้งแต่ V4
--
-- ผู้เช่าเก็บสี่ช่องที่ PDF สัญญาพิมพ์ (ชื่อ เลขบัตร เบอร์ LINE) ไม่ใช่แค่ชื่อ เพื่อให้ PDF ไม่ต้องอ่านตาราง tenant เลย
-- ตาราง tenant ยังแก้ได้ตามปกติ สำเนาชุดนี้มีไว้ให้เอกสารสัญญา
--
-- contract_template_version คือเวอร์ชันแม่แบบเอกสาร (templates/pdf/lease-contract-v1.html)
-- ถ้าวันหลังแก้ถ้อยคำสัญญา ให้ทำไฟล์ v2 แล้วสัญญาเก่าจะยังพิมพ์ด้วยแม่แบบที่ใช้ตอนเซ็น
ALTER TABLE lease
    ADD COLUMN room_number_snapshot        VARCHAR(10),
    ADD COLUMN room_floor_snapshot         SMALLINT,
    ADD COLUMN room_type_snapshot          VARCHAR(10),
    ADD COLUMN tenant_name_snapshot        VARCHAR(200),
    ADD COLUMN tenant_national_id_snapshot VARCHAR(20),
    ADD COLUMN tenant_phone_snapshot       VARCHAR(30),
    ADD COLUMN tenant_line_id_snapshot     VARCHAR(100),
    ADD COLUMN contract_template_version   SMALLINT;

-- ⚠️ สัญญาที่มีอยู่ก่อน Phase 2 ได้ค่า ณ วันที่ migrate ไม่ใช่ค่า ณ วันเซ็นจริง เพราะก่อนหน้านี้ไม่มีที่เก็บ
-- ค่าตอนเซ็นไว้เลย ถ้าห้องหรือผู้เช่าเคยถูกแก้ก่อนวัน migrate สำเนาจะเป็นค่าหลังแก้
-- แม่แบบมีฉบับเดียวมาตลอดจึงเป็นเวอร์ชัน 1 ทุกใบ
UPDATE lease AS l
SET room_number_snapshot        = r.room_number,
    room_floor_snapshot         = r.floor,
    room_type_snapshot          = r.room_type,
    tenant_name_snapshot        = t.full_name,
    tenant_national_id_snapshot = t.national_id,
    tenant_phone_snapshot       = t.phone,
    tenant_line_id_snapshot     = t.line_id,
    contract_template_version   = 1
FROM room AS r, tenant AS t
WHERE r.id = l.room_id
  AND t.id = l.tenant_id;

-- ไม่ใส่ค่า default ให้คอลัมน์สำเนาโดยตั้งใจ แถวที่ไม่มีสำเนาต้องใส่ไม่เข้า ดีกว่าได้สัญญาที่พิมพ์ช่องว่างออกมา
-- LINE ว่างได้เหมือนตาราง tenant ตั้งแต่ V10
ALTER TABLE lease
    ALTER COLUMN room_number_snapshot        SET NOT NULL,
    ALTER COLUMN room_floor_snapshot         SET NOT NULL,
    ALTER COLUMN room_type_snapshot          SET NOT NULL,
    ALTER COLUMN tenant_name_snapshot        SET NOT NULL,
    ALTER COLUMN tenant_national_id_snapshot SET NOT NULL,
    ALTER COLUMN tenant_phone_snapshot       SET NOT NULL,
    ALTER COLUMN contract_template_version   SET NOT NULL;

-- ไม่ใส่ CHECK ของชนิดห้องในสำเนา ถ้าวันหลังเพิ่มหรือเลิกใช้ชนิดห้อง สำเนาของสัญญาเก่าต้องยังเก็บค่าเดิมได้
ALTER TABLE lease
    ADD CONSTRAINT lease_room_floor_snapshot_ck       CHECK (room_floor_snapshot >= 1),
    ADD CONSTRAINT lease_contract_template_version_ck CHECK (contract_template_version >= 1);
