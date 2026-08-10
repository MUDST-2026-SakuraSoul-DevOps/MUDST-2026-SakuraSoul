-- ห้อง 24 ห้องเป็นข้อมูลตั้งต้นของตึก ไม่ใช่ข้อมูลทดลอง เลยอยู่ใน migration ได้
-- ชั้น 1 คือ 101 ถึง 112 ชั้น 2 คือ 201 ถึง 212
INSERT INTO room (room_number, floor, base_rent)
SELECT (f * 100 + n)::text,
       f::smallint,
       CASE WHEN f = 1 THEN 3500.00 ELSE 3800.00 END
FROM generate_series(1, 2) AS f,
     generate_series(1, 12) AS n;
