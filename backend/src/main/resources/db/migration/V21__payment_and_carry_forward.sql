-- รับชำระบางส่วน ยกยอดค้าง และดอกเบี้ยค้างชำระ (SSK-163, SSK-164)
-- สัญญา API อยู่ที่ docs/api-contract-payments-phase2.md กฎที่ทำจริงอยู่ที่ docs/api-contract-phase2-backend.md
--
-- ข้อเดียวที่ทั้งระบบพึ่ง สำหรับทุกสัญญา ณ ทุกเวลา
--   balanceDue ของใบล่าสุด = total_amount − เงินที่บันทึกบนใบนั้น = ผลรวมยอดค้างของทุกใบในสัญญา
-- กฎ "จ่ายที่ใบล่าสุดเท่านั้น", "ออกใบตามลำดับเดือน", "ยกเลิกได้เฉพาะก้อนล่าสุด" มีไว้รักษาสมการนี้
-- ข้อมูลเก่าก่อน V21 ถูกปรับให้สมการนี้จริงในส่วนท้ายของไฟล์

-- ---------------------------------------------------------------------------------------------------------------
-- อัตราดอกเบี้ยค้างชำระกับวันผ่อนผัน: ค่าตั้ง (สำหรับสัญญาใหม่) และสำเนาในสัญญา (ล็อกตอนเซ็น)
-- ค่าตั้งต้น 0 คือไม่คิดดอกเบี้ย สัญญาที่ทำก่อน Phase 2 จึงไม่ถูกคิดดอกเบี้ยตามข้อสรุป SSK-164 โดยไม่ต้อง UPDATE แยก
-- (ต่างจากคอลัมน์สำเนาของ V16 ที่ตั้งใจไม่ใส่ default เพราะ 0 ที่นี่มีความหมายถูกต้อง ไม่ใช่ช่องว่าง)
-- การเริ่มคิดดอกเบี้ยเป็นการตัดสินใจที่แอดมินกดเองผ่าน PUT /api/apartment-config/late-interest (ตัดสิน 10 พ.ย.)
ALTER TABLE apartment_config
    ADD COLUMN late_interest_percent_per_month NUMERIC(5, 2) NOT NULL DEFAULT 0,
    ADD COLUMN grace_days                      SMALLINT      NOT NULL DEFAULT 0,
    ADD CONSTRAINT apartment_config_late_interest_ck CHECK (late_interest_percent_per_month BETWEEN 0 AND 100),
    ADD CONSTRAINT apartment_config_grace_days_ck    CHECK (grace_days BETWEEN 0 AND 31);

ALTER TABLE lease
    ADD COLUMN late_interest_percent_per_month NUMERIC(5, 2) NOT NULL DEFAULT 0,
    ADD COLUMN grace_days                      SMALLINT      NOT NULL DEFAULT 0,
    ADD CONSTRAINT lease_late_interest_ck CHECK (late_interest_percent_per_month BETWEEN 0 AND 100),
    ADD CONSTRAINT lease_grace_days_ck    CHECK (grace_days BETWEEN 0 AND 31);

-- ---------------------------------------------------------------------------------------------------------------
-- ใบเสร็จ: ยอดยกมากับดอกเบี้ยถูกแช่แข็งตั้งแต่ตอนออก ไม่ใช่แถวใน receipt_line
--
-- total_amount เปลี่ยนความหมายเป็นยอดที่พิมพ์บนบิล = ค่าใช้จ่ายเดือนนี้ + previous_balance + interest_amount
-- ใบเก่ามีสองยอดใหม่เป็น 0 ตัวเลขจึงเท่าเดิม ค่าใช้จ่ายเดือนนี้ไม่เก็บเป็นคอลัมน์ คิดที่ Receipt.chargesAmount ที่เดียว
--
-- previous_balance_receipts คือเลขที่ใบที่ถูกยกมา ใช้เป็น detail ของบรรทัด Previous balance
-- ต้องเก็บ เพราะ carried_to_receipt_id ของใบเก่าถูกชี้ต่อไปบิลใหม่กว่าทุกครั้งที่ออกบิล อ่านย้อนไม่ได้ว่าบิลเดือนก่อนรวมใบไหน
-- interest_principal กับ interest_rate_percent คือฐานของดอกเบี้ย ใช้เป็น detail "1.50% of ฿3,000.00"
-- อัตราคัดลอกจากสัญญาลงใบ หลักเดียวกับที่ใบเสร็จคัดลอกอัตราค่าน้ำไฟ
ALTER TABLE receipt
    ADD COLUMN previous_balance          NUMERIC(10, 2) NOT NULL DEFAULT 0,
    ADD COLUMN previous_balance_receipts TEXT,
    ADD COLUMN interest_amount           NUMERIC(10, 2) NOT NULL DEFAULT 0,
    ADD COLUMN interest_principal        NUMERIC(10, 2) NOT NULL DEFAULT 0,
    ADD COLUMN interest_rate_percent     NUMERIC(5, 2)  NOT NULL DEFAULT 0,
    ADD COLUMN carried_to_receipt_id     BIGINT;

-- PARTIAL คือถูกตัดยอดไปบางส่วน receipt_paid_ck ของ V9 ยังถูกอยู่ (PARTIAL ไม่มี paid_at)
ALTER TABLE receipt DROP CONSTRAINT receipt_status_ck;
ALTER TABLE receipt
    ADD CONSTRAINT receipt_status_ck CHECK (status IN ('PENDING', 'PARTIAL', 'PAID')),
    ADD CONSTRAINT receipt_carried_to_fk FOREIGN KEY (carried_to_receipt_id) REFERENCES receipt (id),
    ADD CONSTRAINT receipt_carried_to_not_self_ck CHECK (carried_to_receipt_id <> id),
    ADD CONSTRAINT receipt_previous_balance_ck
        CHECK (previous_balance >= 0 AND (previous_balance > 0) = (previous_balance_receipts IS NOT NULL)),
    -- สูตรดอกเบี้ยถูกบังคับที่ฐานข้อมูล round(numeric, 2) ปัดครึ่งออกจากศูนย์ เท่ากับ HALF_UP ของ Money.round สำหรับค่าบวก
    -- ถ้าวันหลังมีการลดหรือยกเว้นดอกเบี้ย ต้องแก้ constraint นี้ด้วย migration
    ADD CONSTRAINT receipt_interest_ck
        CHECK (interest_principal BETWEEN 0 AND previous_balance
           AND interest_rate_percent BETWEEN 0 AND 100
           AND interest_amount = round(interest_principal * interest_rate_percent / 100, 2)),
    -- ค่าใช้จ่ายเดือนนี้ติดลบไม่ได้
    ADD CONSTRAINT receipt_total_covers_carry_ck CHECK (total_amount >= previous_balance + interest_amount),
    -- ให้ payment กับ payment_allocation อ้างคู่ (id, lease_id) ได้ ฐานข้อมูลจึงกันเงินของสัญญาหนึ่งไปตัดใบของอีกสัญญา
    ADD CONSTRAINT receipt_id_lease_uk UNIQUE (id, lease_id);

-- หน้า Debts และ PDF ถามว่าใบไหนถูกยกมาที่ใบนี้ แถวส่วนใหญ่เป็น NULL จึงเป็น partial index
CREATE INDEX receipt_carried_to_ix ON receipt (carried_to_receipt_id) WHERE carried_to_receipt_id IS NOT NULL;

-- ---------------------------------------------------------------------------------------------------------------
-- การชำระหนึ่งก้อน บันทึกบนบิล (ใบล่าสุดของสัญญาตอนนั้น) แล้วถูกตัดเข้าใบที่ค้างแบบ FIFO ผ่าน payment_allocation
-- ยกเลิกแล้วเก็บแถวไว้ทั้งสองตาราง (voided_at) เพราะประวัติการชำระของบิลต้องแสดงรายการที่ยกเลิกด้วย
-- ทุกคิวรีที่รวมยอดต้องกรอง voided_at IS NULL
CREATE TABLE payment (
    id          BIGINT         GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    receipt_id  BIGINT         NOT NULL,
    -- ซ้ำกับ receipt.lease_id โดยตั้งใจ แบบเดียวกับ receipt_line ใน V18 ใช้กับ foreign key คู่ข้างล่าง
    lease_id    BIGINT         NOT NULL,
    amount      NUMERIC(10, 2) NOT NULL,
    -- วันที่ได้รับเงินจริง ต่างจาก recorded_at ที่เป็นเวลาที่แอดมินบันทึก
    paid_on     DATE           NOT NULL,
    method      VARCHAR(10)    NOT NULL,
    reference   VARCHAR(100),
    note        VARCHAR(500),
    recorded_at TIMESTAMPTZ    NOT NULL,
    voided_at   TIMESTAMPTZ,

    CONSTRAINT payment_receipt_fk  FOREIGN KEY (receipt_id, lease_id) REFERENCES receipt (id, lease_id),
    CONSTRAINT payment_lease_fk    FOREIGN KEY (lease_id) REFERENCES lease (id),
    CONSTRAINT payment_id_lease_uk UNIQUE (id, lease_id),
    -- การคืนเงินใช้การยกเลิก ไม่ใช่แถวติดลบ
    CONSTRAINT payment_amount_ck   CHECK (amount > 0),
    CONSTRAINT payment_method_ck   CHECK (method IN ('CASH', 'TRANSFER', 'QR', 'OTHER')),
    -- ห้ามเป็นวันในอนาคตเทียบกับวันที่บันทึกตามเวลาไทย PaymentRules ตรวจก่อนเพื่อข้อความ 400 ตัวนี้เป็นด่านสุดท้าย
    CONSTRAINT payment_paid_on_ck  CHECK (paid_on <= (recorded_at AT TIME ZONE 'Asia/Bangkok')::date),
    CONSTRAINT payment_voided_ck   CHECK (voided_at IS NULL OR voided_at >= recorded_at)
);

CREATE INDEX payment_receipt_ix ON payment (receipt_id);
-- หา "การชำระล่าสุดที่ยังไม่ถูกยกเลิกของสัญญา" ตอนยกเลิก
CREATE INDEX payment_lease_ix ON payment (lease_id, id DESC);

-- เงินก้อนหนึ่งตัดใบไหนไปเท่าไหร่ แยกดอกเบี้ยกับต้นเงิน (ในใบเดียวกันตัดดอกเบี้ยก่อน ป.พ.พ. ม.329)
-- ใบที่ถูกตัดอาจเก่ากว่าบิลที่บันทึก foreign key คู่ (…, lease_id) ทั้งสามเส้นทำให้เงินไม่ข้ามสัญญาแม้โค้ดจะพลาด
-- ผลรวมของแถวต่อการชำระหนึ่งก้อนต้องเท่ากับ payment.amount และสถานะของใบต้องตรงกับผลรวมที่ตัดเข้า
-- สองข้อนี้เป็นผลรวมข้ามแถว ฐานข้อมูลกันไม่ได้ PaymentService กันภายใต้ล็อกของสัญญา (ไม่ใช้ trigger เหมือนทั้ง repo)
CREATE TABLE payment_allocation (
    id               BIGINT         GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    payment_id       BIGINT         NOT NULL,
    receipt_id       BIGINT         NOT NULL,
    lease_id         BIGINT         NOT NULL,
    interest_amount  NUMERIC(10, 2) NOT NULL,
    principal_amount NUMERIC(10, 2) NOT NULL,

    CONSTRAINT payment_allocation_payment_fk FOREIGN KEY (payment_id, lease_id) REFERENCES payment (id, lease_id),
    CONSTRAINT payment_allocation_receipt_fk FOREIGN KEY (receipt_id, lease_id) REFERENCES receipt (id, lease_id),
    -- การชำระหนึ่งก้อนตัดใบหนึ่งใบได้แถวเดียว ดอกเบี้ยกับต้นเงินอยู่แถวเดียวกัน
    CONSTRAINT payment_allocation_payment_receipt_uk UNIQUE (payment_id, receipt_id),
    -- ไม่มีแถวว่าง ใบที่ไม่ถูกตัดไม่มีแถว
    CONSTRAINT payment_allocation_amounts_ck
        CHECK (interest_amount >= 0 AND principal_amount >= 0 AND interest_amount + principal_amount > 0)
);

CREATE INDEX payment_allocation_receipt_ix ON payment_allocation (receipt_id);

-- ---------------------------------------------------------------------------------------------------------------
-- ข้อมูลเก่า: ทั้งหมดอยู่ใน transaction เดียวของ Flyway พังกลางทางย้อนทั้งไฟล์
-- ก่อน V21 backend มีแค่ PENDING กับ PAID และจ่ายใบไหนก่อนก็ได้ การชำระบางส่วนที่หน้าเว็บเก็บใน localStorage ย้ายมาไม่ได้

-- (ก) ใบยอดศูนย์ที่ยังรอชำระถือว่าไม่มีอะไรต้องจ่าย กฎเดียวกับใบใหม่ (PAID ตั้งแต่ออก)
UPDATE receipt SET status = 'PAID', paid_at = issued_at WHERE status = 'PENDING' AND total_amount = 0;

-- (ข) ใบที่ PAID อยู่แล้วได้การชำระหนึ่งก้อนเต็มยอด ตัดเข้าต้นเงินของตัวเอง
-- ช่องทางเป็น OTHER และข้อความเดิมเก็บใน note แบบเดียวกับ /pay เดิม paid_at กับ payment_method ของใบไม่ถูกแตะ
-- เรียงตาม paid_at id ของการชำระจึงเรียงตามเวลา การหา "ก้อนล่าสุด" ด้วย id ใช้กับแถวเหล่านี้ได้ด้วย
INSERT INTO payment (receipt_id, lease_id, amount, paid_on, method, note, recorded_at)
SELECT id, lease_id, total_amount, (paid_at AT TIME ZONE 'Asia/Bangkok')::date, 'OTHER', payment_method, paid_at
FROM receipt
WHERE status = 'PAID' AND total_amount > 0
ORDER BY paid_at, id;

INSERT INTO payment_allocation (payment_id, receipt_id, lease_id, interest_amount, principal_amount)
SELECT id, receipt_id, lease_id, 0, amount FROM payment;

-- (ค) ใบเก่าที่ยังค้างของแต่ละสัญญายกเข้าใบล่าสุดของสัญญานั้น ดอกเบี้ย 0 (ตัดสิน 10 พ.ย.)
-- หลัง V21 จ่ายได้เฉพาะใบล่าสุด ถ้าไม่ยก ใบเก่าที่ค้างจะไม่มีปุ่มจ่ายและไม่ขึ้นในหน้าหนี้ค้างจนกว่าจะออกบิลถัดไป
-- ราคาที่จ่ายคือยอดของใบล่าสุดที่ออกไปแล้วเปลี่ยนหนึ่งครั้ง (ได้บรรทัด Previous balance)
-- ใบล่าสุดที่จ่ายแล้วแต่มีใบเก่าค้าง (จ่ายข้ามใบ) ยังเป็น PAID เพราะสถานะดูจากค่าใช้จ่ายของใบเอง แต่ balanceDue มากกว่า 0
WITH latest AS (
    SELECT DISTINCT ON (lease_id) id, lease_id, billing_month
    FROM receipt
    ORDER BY lease_id, billing_month DESC
), owed AS (
    SELECT l.id AS latest_id,
           sum(r.total_amount) AS amount,
           string_agg(r.receipt_no, ', ' ORDER BY r.billing_month) AS numbers
    FROM latest l
    JOIN receipt r ON r.lease_id = l.lease_id AND r.billing_month < l.billing_month AND r.status = 'PENDING'
    GROUP BY l.id
)
UPDATE receipt t
SET previous_balance = o.amount,
    previous_balance_receipts = o.numbers,
    total_amount = t.total_amount + o.amount
FROM owed o
WHERE t.id = o.latest_id;

UPDATE receipt r
SET carried_to_receipt_id = l.id
FROM (SELECT DISTINCT ON (lease_id) id, lease_id, billing_month
      FROM receipt
      ORDER BY lease_id, billing_month DESC) l
WHERE r.lease_id = l.lease_id AND r.billing_month < l.billing_month AND r.status = 'PENDING';
