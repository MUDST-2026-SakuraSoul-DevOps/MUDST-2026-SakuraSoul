-- ค่าเช่าผูกกับชนิดห้อง ไม่ใช่รายห้อง (SSK-127 / feedback อาจารย์ 13 ก.ย. ข้อ 5)
--
-- อาจารย์สั่งว่า "ค่าเช่าฟิกตาม room type ไม่ต้องกรอก rent amount"
-- V11 เพิ่มคอลัมน์ชนิดห้องไปแล้ว รอบนี้ย้ายตัวเลขค่าเช่ามาผูกกับชนิด แล้วเลิกใช้ room.base_rent
--
-- ทำไมเป็นตารางลุกอัป ไม่ใช่สองคอลัมน์ใน apartment_config
-- US-16 นิยาม apartment_config ไว้ว่าเป็น "อัตราต่อหน่วยสำหรับคำนวณใบเสร็จ" และระบุสี่ช่อง
-- ตรงตัว (ไฟ น้ำ ส่วนกลาง อินเทอร์เน็ต) ค่าเช่าไม่ใช่อัตราต่อหน่วยและไม่ได้คิดตามหน่วยที่ใช้
-- การยัดเข้าไปคือการขยาย acceptance criteria ที่ตกลงกันไว้แล้ว
--
-- ทำไมไม่เก็บทั้ง room_type และ base_rent ไว้ด้วยกัน
-- จะมีแหล่งความจริงสองที่ที่ขัดกันเองได้ ซึ่งเป็นบั๊กตระกูลเดียวกับที่อาจารย์เพิ่งจับได้
-- (ตารางผู้เช่าโชว์ 45,000 แต่ป็อปอัปโชว์ 3,500 เพราะอ่านคนละแหล่ง)
-- ถ้าวันหนึ่งต้องตั้งราคารายห้องจริง ค่อยเพิ่มคอลัมน์ override ที่ room แล้ว COALESCE เอา
CREATE TABLE room_type (
    code         VARCHAR(10)    PRIMARY KEY,
    monthly_rent NUMERIC(10, 2) NOT NULL,

    -- ผูกกับ enum RoomType ฝั่ง Java ที่ map ด้วย @Enumerated(EnumType.STRING)
    -- ถ้าเพิ่มชนิดใหม่ต้องแก้สามที่ คือ INSERT ข้างล่าง CHECK ตัวนี้ และ enum ฝั่ง Java
    -- ขาดที่ใดที่หนึ่งแล้วแถวใหม่จะใส่ไม่ได้ หรือใส่ได้แต่อ่านกลับมาเป็น Java ไม่ได้
    -- convention เดียวกับ lease_cycle_ck และ lease_status_ck ใน V4
    CONSTRAINT room_type_code_ck CHECK (code IN ('SINGLE', 'DOUBLE')),
    CONSTRAINT room_type_rent_ck CHECK (monthly_rent >= 0)
);

-- ค่าเช่าต่อเดือน เคาะกับเจ้าของงานเมื่อ 18 ก.ย. 2569
--
-- หมายเหตุที่ต้องรู้: seed เดิมใน V2 ตั้งค่าเช่าตาม "ชั้น" (ชั้น 1 = 3,500 / ชั้น 2 = 3,800)
-- ส่วนรอบนี้ตั้งตาม "ชนิด" และ V11 เติมชนิดตามชั้นไว้ แปลว่าห้องชั้น 2 ทั้ง 12 ห้อง
-- (201-212) ค่าเช่าขยับจาก 3,800 เป็น 4,500
--
-- สัญญาที่ทำไปแล้วไม่กระทบ เพราะ lease.monthly_rent เก็บค่าที่ตกลงกันไว้ ณ ตอนเซ็น
-- มีผลกับสัญญาใหม่เท่านั้น ข้อนี้มีเทสคุมไว้ที่ LeaseServiceTest และ LeaseApiTest
INSERT INTO room_type (code, monthly_rent) VALUES
    ('SINGLE', 3500.00),
    ('DOUBLE', 4500.00);

-- FK คุมค่าที่รับได้แทน CHECK ที่ V11 ใส่ไว้ ตารางกลายเป็นตัวนิยามชนิดห้องแทน
ALTER TABLE room DROP CONSTRAINT room_type_ck;
ALTER TABLE room ADD CONSTRAINT room_type_fk FOREIGN KEY (room_type) REFERENCES room_type (code);

-- เลิกใช้ค่าเช่ารายห้อง ค่าที่ API ตอบกลับคำนวณจากชนิดห้องแทน (RoomService)
--
-- ⚠️ ถอยกลับไป branch ก่อนหน้าบนฐานที่รัน V12 ไปแล้วจะสตาร์ตไม่ขึ้น Flyway ไม่ฟ้องเพราะ
-- ตั้ง ignoreMigrationPatterns ไว้ที่ future แต่ Hibernate ddl-auto: validate จะฟ้องว่า
-- missing column [base_rent] ต้อง docker compose down -v ให้ฐานสร้างใหม่ก่อน
ALTER TABLE room DROP CONSTRAINT room_rent_ck;
ALTER TABLE room DROP COLUMN base_rent;
