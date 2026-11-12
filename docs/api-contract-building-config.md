# สัญญา API: ผังตึก (SSK-160) และสำเนาข้อมูลในสัญญา (SSK-180)

**สถานะ:** ฝั่ง Spring ทำแล้วพร้อม migration `V16__building_config_and_lease_snapshot.sql`

หน้าเว็บของ SSK-160 อยู่ใน PR #175 ซึ่งเขียนสเปกฝั่งหน้าเว็บไว้ใน `docs/api-contract-lease.md` หัวข้อ "โครงสร้างอาคาร (SSK-160)"
ของ branch นั้น เอกสารนี้แยกไฟล์ออกมาเพื่อไม่ให้ชนกับการแก้ไฟล์เดียวกันใน #175 รูปร่าง request/response ตรงกับสเปกนั้นทุกช่อง
และตรงกับ backend จำลอง (`frontend/src/api/mockApi.ts`, `frontend/src/domain/buildingLayout.ts`) พอ #175 merge แล้ว
ให้แก้หัวข้อ "ที่ฝั่ง Spring ต้องทำ (ยังไม่ได้ทำ)" ในไฟล์นั้นให้ชี้มาที่นี่

ข้อสรุปที่ใช้มาจากคอมเมนต์ในการ์ด SSK-180 ที่ทีมตกลงวันที่ 7 พ.ย. 2569: ทำสำเนาในสัญญา ไม่ทำ amendment
ถ้าจะเปลี่ยนเงื่อนไขของสัญญาให้ปิดสัญญาแล้วทำใบใหม่

## V16 เปลี่ยนอะไรใน schema

| ตาราง | การเปลี่ยนแปลง |
| --- | --- |
| `room` | `room_floor_ck` จาก `floor BETWEEN 1 AND 2` เป็น `floor >= 1` เพดาน 50 ชั้นเป็นกฎของผังตึก ไม่ใช่ของห้อง |
| `building_config` (ใหม่) | แถวเดียว `id = 1` เก็บ `floors` (1–50), `rooms_per_floor` (1–99), `updated_at` seed เป็น 2 กับ 12 |
| `lease` | เพิ่ม `room_number_snapshot`, `room_floor_snapshot`, `room_type_snapshot`, `tenant_name_snapshot`, `tenant_national_id_snapshot`, `tenant_phone_snapshot`, `tenant_line_id_snapshot`, `contract_template_version` |

- สัญญาที่มีอยู่ก่อน V16 ถูก backfill ด้วยค่าห้องและผู้เช่า **ณ วันที่ migrate** ไม่ใช่ค่า ณ วันเซ็นจริง เพราะก่อนหน้านี้ไม่มีที่เก็บ
  ถ้าห้องหรือผู้เช่าเคยถูกแก้ก่อนวัน migrate สำเนาจะเป็นค่าหลังแก้
- คอลัมน์สำเนาไม่มีค่า default โดยตั้งใจ (ยกเว้น LINE ที่ว่างได้เหมือน `tenant.line_id`) insert สัญญาที่ไม่มีสำเนาจะไม่ผ่าน
- ทีมต้อง `git pull` แล้วรันใหม่ได้เลย V16 ต่อท้ายและ backfill ให้เอง ยกเว้นเคยรัน V16 ฉบับร่างจาก branch นี้ หรือจะสลับกลับไป
  branch ที่ไม่มี V16 ต้อง `docker compose down -v` ก่อน (checksum ไม่ตรง หรือ Hibernate ไม่เจอคอลัมน์)

## GET /api/building-config

```json
{ "floors": 2, "roomsPerFloor": 12, "totalRooms": 24, "updatedAt": "2026-11-08T08:15:30.000Z" }
```

- `totalRooms` นับจากตาราง `room` จริง อาจน้อยกว่า `floors x roomsPerFloor` ถ้าเคยลบห้องทีละห้องด้วย `DELETE /api/rooms/{id}`
- `updatedAt` รูปแบบเดียวกับ `apartment-config` (UTC มิลลิวินาทีสามหลัก ความยาวคงที่)

## PUT /api/building-config

body `{ "floors": 3, "roomsPerFloor": 10, "newRoomType": "SINGLE" }` ทำทั้งหมดใน transaction เดียว

1. ตรวจค่า ผิดตอบ **400** ข้อความของช่องแรกที่ผิด ตรงกับ `validateBuildingLayout` ฝั่งหน้าเว็บ
   - `Number of floors must be a whole number from 1 to 50`
   - `Rooms per floor must be a whole number from 1 to 99`
   - `Room type for new units must be SINGLE or DOUBLE` (ตัวพิมพ์ใหญ่ตรงตัว `single` ไม่ผ่าน)
   - `2.5` ได้ข้อความ "whole number" ส่วน `2.0` ผ่าน ค่าที่ไม่ใช่ตัวเลขเลยอย่าง `"abc"` Jackson อ่านไม่ออกก่อนถึงกฎ
     ได้ข้อความกลางของ `ApiExceptionHandler` คือ `The floors field must be a number`
2. ล็อกแถว `building_config` (`SELECT ... FOR UPDATE`) backend มีสอง pod คำขอปรับผังที่มาพร้อมกันจึงทำทีละคำขอ
3. เทียบห้องที่มีอยู่กับผังใหม่ด้วยเลขห้องอย่างเดียว เลขห้อง = เลขชั้นตามด้วยลำดับสองหลัก (ชั้น 3 ห้องที่ 7 = `307`)
   ห้องที่อยู่ในผังอยู่แล้วไม่ถูกแตะเลย (id ชนิดห้อง สถานะ สัญญา)
4. ล็อกห้องที่อยู่นอกผัง ถ้าห้องไหนมี **สัญญาใดก็ได้ (รวม ENDED) ใบแจ้งซ่อม รอบแจ้งเตือนซ่อม หรือค่ามิเตอร์ (SSK-166)** ตอบ **409** ทั้งก้อน
   ไม่เปลี่ยนอะไรเลย ไม่เพิ่มห้องค้างไว้ครึ่งทาง เลขห้องเรียงตามผังตึก
   - `Unit 110 has lease, maintenance or meter reading history and cannot be removed. Nothing was changed.`
   - `Units 103, 110 have lease, maintenance or meter reading history and cannot be removed. Nothing was changed.`
   - ใบเสร็จไม่ต้องเช็คแยก ใบเสร็จผูกกับสัญญา ห้องที่มีใบเสร็จจึงมีสัญญาเสมอ
5. ลบห้องนอกผัง เพิ่มห้องที่ขาดเป็นชนิด `newRoomType` บันทึกผังกับ `updatedAt` แล้วตอบก้อนเดียวกับ `GET`

ห้องนอกผังที่ไม่มีประวัติถูกลบได้ถึงจะติดธงซ่อมบำรุง (`under_maintenance`) หรือมีโน้ตอยู่ เพราะสองอย่างนี้ไม่ใช่ประวัติ
ที่ต้องเก็บ กฎเดียวกับ `planLayoutChange` และ backend จำลองฝั่งหน้าเว็บ

ห้องที่เพิ่มใหม่ได้ค่าเช่าตามชนิดห้อง (`room_type` จาก V12) และทำสัญญาได้ทันที `lease_no_overlap` ใช้กับห้องใหม่เหมือนห้องเดิม

**ผังใหญ่ ๆ** เช็คประวัติทีเดียวทั้งชุด (ตารางละหนึ่งคิวรี `... where room_id in (...)`) และลบด้วย `DELETE ... WHERE id IN (...)`
คำสั่งเดียว วัดบน docker compose แล้ว ขยาย 2 x 12 เป็น 50 x 99 (เพิ่ม 4,926 ห้อง) ใช้ 2.3 วินาที ลดกลับเป็น 2 x 12 ใช้ 1.0 วินาที
(ก่อนแก้ ลดกลับใช้ 19.9 วินาทีเพราะเช็คและลบทีละห้อง) มีเทสผังใหญ่สุดคุมใน `BuildingConfigApiTest`

**ตารางใหม่ที่มี foreign key มาที่ `room`** ต้องตัดสินก่อนว่าเป็นประวัติหรือเป็นค่าตั้งของห้อง (ทีมตัดสินวันที่ 10 พ.ย. 2569)
- **ประวัติ** (สัญญา งานซ่อม และ `meter_reading` ของ SSK-166) บล็อกการลบ ให้เพิ่ม bean ที่ implement `RoomHistorySource`
  แล้วทั้งการลดผังและ `DELETE /api/rooms/{id}` เช็คให้เอง ถ้าลืม ลดผังแล้วไปตายที่ foreign key ได้ 409 ข้อความกลาง
  `This conflicts with data that already exists` แทนข้อความที่บอกเลขห้อง (ข้อมูลไม่เสีย แต่ผู้ใช้ไม่รู้ว่าห้องไหนติด)
- **ค่าตั้งของห้อง** (`room_rate` SSK-162, `room_extra_charge` SSK-165) ใช้ `ON DELETE CASCADE` ลบตามห้องไปเลย
  เพราะไม่ใช่ประวัติที่ต้องเก็บ สัญญาและใบเสร็จมีสำเนาของตัวเองอยู่แล้ว และ `room_rate` ลบแถวไม่ได้
  ถ้าให้บล็อก ตั้งอัตราผิดแถวเดียวห้องนั้นจะลบไม่ได้ตลอดไป

**การชนกับงานอื่น** ขั้นที่ 4 ใช้ล็อกแถวห้องตัวเดียวกับที่ `LeaseService` ใช้ตอนสร้าง/แก้สัญญา (PR #192)
ถ้าสร้างสัญญาของห้องนั้น commit ก่อน การปรับผังจะเห็นสัญญาแล้วตอบ 409 ถ้าปรับผังได้ล็อกก่อน คำขอสร้างสัญญาจะรอแล้วได้ 404
ใบแจ้งซ่อมหรือรอบแจ้งเตือนที่สร้างแทรกพอดีโดน foreign key กันเป็นด่านสุดท้าย (ได้ 409 ข้อความกลาง)
เลขห้องซ้ำที่หลุดมาถึงฐานข้อมูลได้ 409 `A unit with this number already exists` (`room_number_uk`)

## GET /api/rooms กับ DELETE /api/rooms/{id}

- `GET /api/rooms` เรียงตาม **ชั้น แล้วตามเลขห้องแบบตัวเลข** (เรียงความยาวก่อนแล้วตามข้อความ) ห้อง `1001` ของชั้น 10
  จึงมาหลัง `912` ไม่ใช่ก่อน `101` แบบเรียงข้อความ ลำดับเดียวกับ `byFloorThenNumber` ของ backend จำลอง
- `DELETE /api/rooms/{id}` เช็ครอบแจ้งเตือนซ่อมด้วยแล้ว ได้ 409 `Unit 101 has maintenance history and cannot be deleted`
  แทน 409 ข้อความกลางจาก foreign key แบบเดิม (สัญญาและใบแจ้งซ่อมเช็คเหมือนเดิม)
  ห้องที่มีค่ามิเตอร์ (SSK-166) ได้ `Unit 101 has meter reading history and cannot be deleted` ห้องที่มีหลายอย่างได้ข้อความของสัญญาก่อน

## สำเนาในสัญญา (SSK-180)

สร้างสัญญา (`POST /api/leases`) คัดลอกค่าพวกนี้ลงสัญญาใบนั้น ทำใน constructor ของ `Lease` จึงไม่มีทางสร้างสัญญาที่ไม่มีสำเนา

| สำเนา | มาจาก | ใช้ที่ไหน |
| --- | --- | --- |
| เลขห้อง ชั้น ชนิดห้อง | ห้อง ณ วันทำสัญญา | `LeaseResponse.roomNumber`, `floor`, `roomType`, PDF สัญญา, เลขห้องในใบเสร็จ PDF และอีเมล |
| ชื่อ เลขบัตร เบอร์ LINE ของผู้เช่า | ผู้เช่า ณ วันทำสัญญา | PDF สัญญาอย่างเดียว |
| `contract_template_version` | `ContractTemplate.CURRENT_VERSION` (ตอนนี้ 1) | เลือกแม่แบบ `templates/pdf/lease-contract-v{n}.html` |

- `LeaseResponse` เพิ่ม `floor` กับ `roomType` และ `roomNumber` อ่านจากสำเนา ส่วน `roomId` ยังชี้ห้องจริง และ `tenantName` ยังเป็นชื่อปัจจุบัน
  (ตาราง `tenant` ยังแก้ได้ตามปกติ สำเนาผู้เช่ามีไว้ให้เอกสารสัญญา)
- แก้สัญญา (`PUT /api/leases/{id}`) ไม่ถ่ายสำเนาห้องใหม่ (ย้ายห้องไม่ได้อยู่แล้ว) สำเนาผู้เช่าถ่ายใหม่เฉพาะตอนเปลี่ยน `tenantId`
  เป็นอีกคน ซึ่งคือการแก้ที่กรอกผิดคนตอนเซ็น ผู้เช่าคนเดิมคงสำเนาเดิม แก้ชื่อหรือเบอร์ในตาราง `tenant` จึงไม่ไหลเข้าเอกสารสัญญาเก่า
  เหตุผลที่ยอมให้ทางนี้เปลี่ยน PDF ได้ อยู่ใน `api-contract-lease.md` หัวข้อ "เปลี่ยนผู้เช่าของสัญญากับสำเนาในสัญญา"
- PDF สัญญาไม่อ่านตาราง `room` กับ `tenant` เลย เปลี่ยนเลขห้อง ปรับผัง หรือแก้ข้อมูลผู้เช่าทีหลัง ข้อความใน PDF ของสัญญาเก่าเท่าเดิม
  ทุกตัวอักษร (ยกเว้นวันที่ออกเอกสารซึ่งเป็นวันที่พิมพ์)
- แก้ถ้อยคำสัญญาเมื่อไหร่ อย่าแก้ไฟล์ v1 ให้คัดลอกเป็น `lease-contract-v2.html` แก้ที่ไฟล์ใหม่ แล้วขยับ `CURRENT_VERSION`
  สัญญาเก่ายังพิมพ์ด้วยแม่แบบที่ใช้ตอนเซ็น

### แก้เงื่อนไขการเงินของสัญญาได้ 409

`PUT /api/leases/{id}` ที่ส่งค่าเหล่านี้มาไม่ตรงกับค่าที่ล็อกไว้ ได้ **409**

| ช่อง | ข้อความ |
| --- | --- |
| `securityDeposit` | `Security deposit is locked into this lease and cannot be changed. End this lease and create a new one with the new terms` |
| `electricRatePerUnit` | `Electricity rate per unit is locked into this lease ...` (ท้ายประโยคเหมือนกันทุกช่อง) |
| `waterRatePerUnit` | `Water rate per unit is locked into this lease ...` |
| `commonAreaFee` | `Common area fee is locked into this lease ...` |
| `internetFee` | `Internet fee is locked into this lease ...` |
| `billingCycle` | `Billing cycle is locked into this lease ...` |

- เทียบหลังปัดสองตำแหน่งแบบ HALF_UP เหมือนที่ `NUMERIC(10,2)` เก็บ ส่งค่าเดิมกลับมา (ฟอร์มแก้สัญญาส่งอัตราน้ำไฟเดิมมาทุกครั้ง) ผ่าน
  ช่องที่ไม่ส่งมาถือว่าคงค่าเดิม `monthlyRent` ถูกมองข้ามเหมือนเดิมตั้งแต่ V12
- รอบบิลอยู่ในชุดนี้เพราะตารางล็อกในการ์ด SSK-180 จัดไว้แถวเดียวกับค่าเงิน วันเริ่ม/วันจบกับผู้เช่ายังแก้ได้ตาม US-06
- **หน้าเว็บต้องตาม:** ฟอร์ม Edit Contract (`ContractFormDialog.tsx`) ยังพิมพ์แก้ช่อง Security Deposit กับเลือก Billing cycle ได้
  ควรล็อกสองช่องนี้ในโหมดแก้ และ backend จำลองควรตอบ 409 แบบเดียวกัน ระหว่างนี้ผู้ใช้จะเห็นข้อความ 409 ข้างบนใต้ฟอร์ม

### ยังไม่อยู่ในงานนี้

- อัตราดอกเบี้ยกับวันผ่อนผันในสัญญา (SSK-164) เพิ่มพร้อม migration ของ SSK-164 ที่ใส่ค่าต้นทางใน `apartment_config`
  สัญญาก่อนหน้านั้นนับเป็น 0 ตามคอมเมนต์ในการ์ด
- สำเนาค่าใช้จ่ายพิเศษในสัญญา (SSK-165) และสำเนาบัญชีธนาคารในใบเสร็จ (SSK-168)
- amendment ทีมตัดสินว่าไม่ทำใน Phase 2

## เทสที่คุม

| เทส | พิสูจน์อะไร |
| --- | --- |
| `BuildingLayoutTest`, `BuildingConfigRulesTest` | เลขห้อง ห้องที่ต้องเพิ่ม/ลบ ข้อความ 400/409 แบบตารางเคส ไม่ยก database |
| `BuildingConfigApiTest` | ผังตั้งต้น ขยายเป็น 3 ชั้นแล้วห้องเดิมไม่ถูกแตะ ห้องใหม่ทำสัญญาได้และสัญญาทับยังได้ 409 ลดผังชนสัญญาที่ปิดแล้ว/ใบแจ้งซ่อม/รอบแจ้งเตือนได้ 409 และไม่เปลี่ยนอะไร 400 ทุกข้อความ ลำดับห้อง 10 ชั้น สองคำขอพร้อมกัน |
| `LeaseSnapshotApiTest` | golden test เปลี่ยนเลขห้องเป็น `A111` และแก้ชื่อ เบอร์ LINE ผู้เช่า แล้ว PDF สัญญาเดิมได้ข้อความเท่าเดิมทุกตัวอักษร รายการสัญญากับใบเสร็จยังเป็นห้องตามวันเซ็น |
| `LeaseApiTest`, `LeaseServiceTest` | `floor`/`roomType` ใน response สำเนาตอนสร้าง กฎถ่ายสำเนาผู้เช่าตอนแก้ 409 เงื่อนไขการเงิน ค่าเดิมส่งกลับมาผ่าน |
| `V16MigrationIntegrationTest` | migrate ถึง V15 ใส่ข้อมูลจริง แล้ว migrate V16 ต่อ backfill ถูก ข้อมูลครบ ห้องชั้น 3 ใส่ได้ เลขห้องซ้ำกับชั้น 0 ใส่ไม่ได้ |
| `deploy.yml` ข้อ 5 | cluster จริงได้ห้องเท่ากับ `floors x roomsPerFloor` ของผังตึก แทนการฝังเลข 24 |
