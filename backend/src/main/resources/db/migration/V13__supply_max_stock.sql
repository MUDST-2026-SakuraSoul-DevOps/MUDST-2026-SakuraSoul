-- เพดานของในคลังอุปกรณ์ (SSK-23 ตาม BUG-M6 ของ SSK-111 ที่ QA ขอ)
--
-- min_stock เตือนตอนของใกล้หมด ส่วน max_stock กันการสั่งของเกินความจำเป็น หน้าเว็บบังคับกรอกเพดาน
-- และตรวจสามข้อมาตั้งแต่ SSK-111 แต่ตอนนั้นเก็บอยู่ใน state ของหน้าเว็บอย่างเดียว พอต่อ API จริง
-- backend ต้องรู้เพดานด้วย ไม่งั้นการเติมของผ่าน API จะดันยอดทะลุเพดานได้ ซึ่งเป็นบั๊กเดียวกับที่ QA
-- เจอบนหน้าเว็บ (LED Bulbs 60W มี 284 ชิ้นทั้งที่ตั้งเพดานไว้ 200)
--
-- ทำไมบังคับ ไม่ปล่อยเป็น NULL = ไม่จำกัด
-- ฟอร์มบังคับกรอกอยู่แล้ว ถ้าฐานยอมให้ว่าง ทุกที่ที่ใช้เพดาน (ตาราง ฟอร์มเติมของ กฎสามข้อ) ต้องเขียน
-- ทางแยกของค่าว่างเพิ่มทั้งสองฝั่ง เพื่อรองรับข้อมูลที่หน้าเว็บไม่มีทางสร้างขึ้นมาได้
--
-- ของที่มีอยู่ก่อนแล้วได้เพดานเป็นสองเท่าของค่าที่มากกว่าระหว่างยอดคงเหลือกับขั้นต่ำ
-- ผ่านกฎทั้งสามข้อเสมอ และยังเติมของต่อได้ทันที (ถ้าตั้งเท่ายอดคงเหลือพอดี ของที่มีเกินขั้นต่ำ
-- อยู่แล้วจะเติมไม่ได้เลยจนกว่าจะมีคนไปแก้เพดาน) ของที่ยอดกับขั้นต่ำเป็นศูนย์ทั้งคู่ได้เพดานศูนย์
-- ซึ่งยังถูกกฎ แค่ต้องแก้เพดานก่อนเติมของ
ALTER TABLE supply_item ADD COLUMN max_stock INTEGER;

UPDATE supply_item SET max_stock = GREATEST(stock, min_stock) * 2;

ALTER TABLE supply_item ALTER COLUMN max_stock SET NOT NULL;

-- ด่านสุดท้ายแบบเดียวกับ supply_item_stock_ck ใน V8 ข้อความที่ผู้ใช้เห็นมาจาก SupplyItem ที่ตรวจก่อนเขียน
-- ส่วนการเติมของสองคำขอพร้อมกันกันด้วยการล็อกแถว (SupplyItemRepository.findForUpdateById)
-- คำขอที่สองจึงอ่านยอดหลังคำขอแรกแล้วค่อยเช็คเพดาน
ALTER TABLE supply_item ADD CONSTRAINT supply_item_max_stock_ck CHECK (max_stock >= 0);
ALTER TABLE supply_item ADD CONSTRAINT supply_item_min_max_ck CHECK (max_stock >= min_stock);
ALTER TABLE supply_item ADD CONSTRAINT supply_item_stock_max_ck CHECK (stock <= max_stock);
