-- ฟิลด์ติดต่อของผู้เช่าตาม US-03 (SSK-9)
--
-- ชุดฟิลด์ที่บังคับมาจากคำตัดสินของอาจารย์ในโน้ตบน Figma (11 ก.ย. 2569) คือ
-- เลขบัตรประชาชน Line ID และเบอร์โทร บังคับทั้งสามช่อง ส่วนอีเมลไม่บังคับ
-- ของเดิมใน docs/api-contract-lease.md เขียนกลับกัน (อีเมลบังคับ เลขบัตรไม่บังคับ)
-- เอกสารถูกเขียนใหม่พร้อม migration นี้แล้ว ถ้าอ่านเจอฉบับเก่าที่ไหนอีกให้ยึดอันนี้
--
-- email ยังเป็น NULL ได้เพราะอาจารย์ให้เป็นช่องไม่บังคับ ผู้เช่าหลายคนของหอไม่มีอีเมล
-- ที่ใช้จริง ถ้าตั้ง NOT NULL แล้วบังคับให้แอดมินกรอก สิ่งที่จะได้คืออีเมลมั่ว ๆ เต็มตาราง
-- ซึ่งแย่กว่าไม่มีค่าเลย ตอนทำใบเสร็จค่อยเช็คว่ามีอีเมลไหมก่อนส่ง
--
-- สามบรรทัด UPDATE ข้างล่างเป็นการเติมค่าแทนที่ก่อนตั้ง NOT NULL เพราะ V1 เปิดให้
-- phone กับ national_id เป็น NULL ได้ ค่าปลอมพวกนี้จะไปโดนเฉพาะข้อมูลใน dev
-- ที่ DevDataSeeder ใส่ไว้เท่านั้น ตอนนี้ยังไม่มี production ที่ไหนรันอยู่จริงสักที่
-- (ดูหัวข้อ "ที่ยังไม่มี" ใน README ข้อ deploy) ถ้าวันหนึ่งมีข้อมูลจริงแล้วต้องย้อนดู
-- ให้ค้นแถวที่ national_id ขึ้นต้นด้วย UNKNOWN- แล้วตามเก็บเอกสารจากผู้เช่าอีกรอบ
ALTER TABLE tenant
    ADD COLUMN line_id VARCHAR(100),
    ADD COLUMN email   VARCHAR(255);

UPDATE tenant SET phone = '-' WHERE phone IS NULL;
UPDATE tenant SET line_id = '-' WHERE line_id IS NULL;
UPDATE tenant SET national_id = 'UNKNOWN-' || id WHERE national_id IS NULL;

ALTER TABLE tenant
    ALTER COLUMN phone       SET NOT NULL,
    ALTER COLUMN line_id     SET NOT NULL,
    ALTER COLUMN national_id SET NOT NULL;

-- ก่อนตั้ง constraint กันซ้ำต้องล้างของเก่าที่ซ้ำอยู่แล้วออกก่อน เพราะ API ชุดเดิมไม่มี
-- กฎห้ามเลขบัตรซ้ำเลย ใครที่กดเพิ่มคนเดิมสองรอบตอนลองฟอร์มเก่าจะมีแถวซ้ำค้างอยู่ใน
-- database ของเครื่องตัวเอง ซึ่ง docker-compose เก็บไว้ใน volume ชื่อ db-data ไม่ได้หายไป
-- ตอนปิด container ถ้าไม่ล้างตรงนี้ ADD CONSTRAINT ข้างล่างจะล้ม Flyway จะไม่ยอมรัน
-- migration ที่เหลือ แล้ว backend จะสตาร์ตไม่ขึ้นทั้งที่โค้ดไม่ได้ผิดอะไร
-- แถวที่ id น้อยสุดของแต่ละเลขได้เก็บเลขเดิมไว้ ที่เหลือถูกเปลี่ยนเป็น DUP-<id> ให้ค้นเจอ
-- ด้วย prefix แบบเดียวกับ UNKNOWN- ข้างบน แล้วตามแก้ทีหลังได้ว่าตัวไหนคือคนจริง
-- ถ้าไม่อยากตามเก็บ ข้อมูล dev ทิ้งได้หมดด้วย docker compose down -v แล้ว DevDataSeeder
-- จะใส่ข้อมูลตัวอย่างให้ใหม่ตอนเปิดรอบถัดไป
UPDATE tenant t
SET national_id = 'DUP-' || t.id
WHERE EXISTS (SELECT 1
              FROM tenant o
              WHERE o.national_id = t.national_id
                AND o.id < t.id);

-- ตัวกันผู้เช่าซ้ำคนของจริงอยู่ตรงนี้ที่เดียว การเช็ค existsByNationalId ใน TenantService
-- เป็นแค่การทำให้ข้อความที่ผู้ใช้เห็นอ่านรู้เรื่อง กันสองคำขอที่เข้ามาพร้อมกันไม่ได้
-- กฎเดียวกับ lease_no_overlap ใน V4 และ ApiExceptionHandler แปลชื่อ constraint นี้
-- กลับเป็นข้อความไทยชุดเดียวกับที่ service โยน เส้นทางไหนผู้ใช้ก็เห็นประโยคเดียวกัน
ALTER TABLE tenant ADD CONSTRAINT tenant_national_id_uk UNIQUE (national_id);
