-- อัตราค่าสาธารณูปโภคของตึก (US-16) เก็บชุดเดียวทั้งตึก ไม่ได้แยกรายห้อง
-- เพราะ requirement พูดถึงอัตราระดับอพาร์ตเมนต์ ถ้าวันหลังต้องแยกรายห้องค่อยเพิ่มตารางทับ
--
-- ตารางนี้ถูกเขียนทับทุกครั้งที่แอดมินแก้อัตรา ไม่มีประวัติเก็บไว้ จึงใช้เป็นแหล่งอ้างอิง
-- ของสัญญาหรือใบเสร็จโดยตรงไม่ได้ ทั้งสองอย่างต้องคัดลอกอัตราไปเก็บไว้ในตัวเอง
-- ตอนบันทึก (ดูคอลัมน์ชุด rate ในตาราง lease)
--
-- updated_at เป็น TIMESTAMPTZ ไม่ใช่ DATE เพราะหน้าเว็บเทียบว่า updatedAt ครั้งหลัง
-- ต้องมากกว่าครั้งก่อน (frontend/src/api/client.test.ts) ถ้าเป็นแค่วันที่ การแก้สองครั้ง
-- ในวันเดียวจะเทียบไม่ได้

CREATE TABLE apartment_config (
    id                     SMALLINT       PRIMARY KEY,
    electric_rate_per_unit NUMERIC(10, 2) NOT NULL,
    water_rate_per_unit    NUMERIC(10, 2) NOT NULL,
    common_area_fee        NUMERIC(10, 2) NOT NULL,
    internet_fee           NUMERIC(10, 2) NOT NULL,
    updated_at             TIMESTAMPTZ    NOT NULL DEFAULT now(),

    -- บังคับให้มีแถวเดียวตลอดไป ไม่ต้องพึ่งวินัยของโค้ดฝั่งแอปอย่างเดียว
    CONSTRAINT apartment_config_single_row_ck CHECK (id = 1),

    -- ศูนย์ใช้ได้ หอบางที่ไม่คิดค่าส่วนกลางหรือค่าอินเทอร์เน็ต
    CONSTRAINT apartment_config_rates_ck CHECK (electric_rate_per_unit >= 0
                                            AND water_rate_per_unit >= 0
                                            AND common_area_fee >= 0
                                            AND internet_fee >= 0)
);

-- อัตราตั้งต้นอิงราคาหอพักแถวมหาวิทยาลัยจริง ชุดเดียวกับที่ backend จำลองฝั่งหน้าเว็บ
-- seed ไว้ (frontend/src/api/mockApi.ts) แอดมินเข้าไปแก้ได้ที่หน้า Apartment Config
--
-- ที่อยู่ใน migration ไม่ใช่ DevDataSeeder เพราะตารางนี้ต้องมีแถวอยู่เสมอ ระบบถึงจะ
-- ตอบ GET ได้ ไม่ใช่ข้อมูลตัวอย่างที่มีก็ได้ไม่มีก็ได้
INSERT INTO apartment_config
    (id, electric_rate_per_unit, water_rate_per_unit, common_area_fee, internet_fee, updated_at)
VALUES
    (1, 8.00, 18.00, 300.00, 250.00, now());
