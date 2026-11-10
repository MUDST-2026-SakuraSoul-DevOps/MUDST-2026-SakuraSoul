-- บัญชีรับเงินและ PromptPay บนใบเสร็จ (SSK-168)
-- สัญญา API อยู่ที่ docs/api-contract-payments-phase2.md กฎที่ทำจริงอยู่ที่ docs/api-contract-phase2-backend.md
--
-- ทุกคอลัมน์เป็น NULL ได้ NULL ทั้งชุดคือยังไม่ได้ตั้งบัญชี ใบเสร็จออกได้ตามปกติและไม่มีบล็อกบัญชี
-- ไม่มีค่าตั้งต้นและไม่ backfill เพราะบัญชีตัวอย่างบนใบเสร็จจริงจะพาผู้เช่าไปโอนเงินผิดที่
-- เพิ่มคอลัมน์อย่างเดียว ไม่แตะแถวที่มีอยู่

-- ---------------------------------------------------------------------------------------------------------------
-- ค่าตั้ง: บัญชีที่ใบเสร็จใบถัดไปจะคัดลอก ตั้งผ่าน PUT /api/apartment-config/bank-account เท่านั้น
-- bank_account_number เก็บตามที่แอดมินกรอก (มีขีดหรือเว้นวรรคได้) เพราะเป็นข้อความที่พิมพ์ให้ผู้เช่าอ่าน
-- bank_prompt_pay_id เก็บเฉพาะตัวเลข (เบอร์มือถือ 10 หลักที่ขึ้นต้นด้วย 0 หรือเลขประจำตัว 13 หลัก) เพราะเป็นค่าที่เข้า QR
-- BankAccountRules ตรวจก่อนเพื่อตอบข้อความ 400 ตามสัญญา constraint เหล่านี้เป็นด่านสุดท้าย
-- CHECK ที่ผลเป็น NULL ถือว่าผ่าน การตรวจรูปแบบจึงไม่ต้องเขียน IS NULL OR
ALTER TABLE apartment_config
    ADD COLUMN bank_name           VARCHAR(100),
    ADD COLUMN bank_account_name   VARCHAR(100),
    ADD COLUMN bank_account_number VARCHAR(30),
    ADD COLUMN bank_prompt_pay_id  VARCHAR(13),
    -- สามช่องของบัญชีมีครบหรือว่างครบ
    ADD CONSTRAINT apartment_config_bank_all_or_none_ck
        CHECK ((bank_name IS NULL) = (bank_account_name IS NULL)
           AND (bank_name IS NULL) = (bank_account_number IS NULL)),
    -- ช่องว่างล้วนไม่นับว่ากรอก
    ADD CONSTRAINT apartment_config_bank_not_blank_ck
        CHECK (btrim(bank_name) <> '' AND btrim(bank_account_name) <> ''),
    -- ตัวเลข 10 ถึง 15 หลัก คั่นด้วยขีดหรือเว้นวรรคได้
    ADD CONSTRAINT apartment_config_bank_account_number_ck
        CHECK (bank_account_number ~ '^[0-9 -]+$'
           AND length(regexp_replace(bank_account_number, '[^0-9]', '', 'g')) BETWEEN 10 AND 15),
    -- PromptPay มีได้เมื่อมีบัญชีแล้วเท่านั้น
    ADD CONSTRAINT apartment_config_prompt_pay_needs_bank_ck
        CHECK (bank_prompt_pay_id IS NULL OR bank_name IS NOT NULL),
    ADD CONSTRAINT apartment_config_prompt_pay_id_ck
        CHECK (bank_prompt_pay_id ~ '^(0[0-9]{9}|[0-9]{13})$');

-- ---------------------------------------------------------------------------------------------------------------
-- ใบเสร็จ: สำเนาบัญชี ณ ตอนออกใบ หลักเดียวกับอัตราค่าน้ำไฟที่ใบเสร็จคัดลอกไว้ (US-16-S3) และตารางล็อกของ SSK-180
-- เปลี่ยนค่าตั้งทีหลังไม่กระทบใบที่ออกแล้ว ใบที่ออกก่อน V22 หรือออกตอนยังไม่ตั้งบัญชีเป็น NULL ทั้งชุด
-- แอปไม่มีทางแก้สี่คอลัมน์นี้หลังออกใบ (mapping เป็น updatable = false) ไม่มีปุ่มออกใบแจ้งหนี้ใหม่ในเฟสนี้ (ตัดสิน 10 พ.ย.)
-- ไม่ตรวจรูปแบบเลขบัญชีซ้ำที่นี่เพราะเป็นข้อความที่พิมพ์อย่างเดียว ส่วน PromptPay ID ถูกอ่านไปสร้าง QR ทุกครั้งที่เปิดใบ
-- ค่าที่ผิดรูปแบบจะทำให้รายการใบเสร็จทั้งหน้าพัง จึงกันที่ฐานข้อมูลด้วย
ALTER TABLE receipt
    ADD COLUMN bank_name           VARCHAR(100),
    ADD COLUMN bank_account_name   VARCHAR(100),
    ADD COLUMN bank_account_number VARCHAR(30),
    ADD COLUMN bank_prompt_pay_id  VARCHAR(13),
    ADD CONSTRAINT receipt_bank_all_or_none_ck
        CHECK ((bank_name IS NULL) = (bank_account_name IS NULL)
           AND (bank_name IS NULL) = (bank_account_number IS NULL)),
    ADD CONSTRAINT receipt_bank_prompt_pay_needs_bank_ck
        CHECK (bank_prompt_pay_id IS NULL OR bank_name IS NOT NULL),
    ADD CONSTRAINT receipt_bank_prompt_pay_id_ck
        CHECK (bank_prompt_pay_id ~ '^(0[0-9]{9}|[0-9]{13})$');
