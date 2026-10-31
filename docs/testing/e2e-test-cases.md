# E2E Test Cases — Sakura Soul

> เอกสารนี้เก็บ **รายการเทสเคส** ของชั้น E2E เท่านั้น
> ภาพรวมแผนทดสอบทั้งโปรเจกต์อยู่ใน `ssk-test-plan.md` · วิธีติดตั้งและรันอยู่ใน `e2e/README.md`
> โค้ดอยู่ที่ `e2e/cypress/e2e/**/*.cy.ts` (Cypress) · ปรับปรุงล่าสุด 16 ต.ค. 2569

## สารบัญ

- [ขอบเขตและสามโปรเจกต์](#ขอบเขตและสามโปรเจกต์)
- [สภาพแวดล้อมและข้อมูลทดสอบ](#สภาพแวดล้อมและข้อมูลทดสอบ)
- [1. โปรเจกต์ mock-api (15 เคส)](#1-โปรเจกต์-mock-api-15-เคส)
- [2. โปรเจกต์ stubbed-api (2 เคส)](#2-โปรเจกต์-stubbed-api-2-เคส)
- [3. โปรเจกต์ live-api (17 เคส)](#3-โปรเจกต์-live-api-17-เคส)
- [ข้อจำกัดและสิ่งที่ยังไม่ครอบ](#ข้อจำกัดและสิ่งที่ยังไม่ครอบ)

---

## ขอบเขตและสามโปรเจกต์

ทุกเคสรันผ่าน Cypress เปิดเบราว์เซอร์ Chrome จริง (เครื่องมือตามที่อาจารย์กำหนด SSK-158) ต่างกันที่ **ปลายทางของคำขอ `/api`**
ต้องระบุให้ชัดทุกครั้งที่รายงานผล ว่าเคสไหนแตะระบบจริงและเคสไหนแตะแค่หน้าเว็บ

| โปรเจกต์ | พอร์ต | ปลายทาง `/api` | ครอบอะไร | อยู่ใน CI |
|---|---|---|---|---|
| `mock-api` | 4173 | backend จำลองในเบราว์เซอร์ (`src/api/mockApi.ts`) | เส้นทางการกดของผู้ใช้ กฎที่อยู่ฝั่งหน้าเว็บ | ✅ |
| `stubbed-api` | 4174 | ปลอมคำตอบด้วย `cy.intercept` | เคสที่ต้องบังคับให้ API ตอบแบบเจาะจง เช่น 401 | ✅ |
| `live-api` | 4175 | **Spring + PostgreSQL จริง** | UI → API → Database ครบสาย | ✅ job `e2e-live` |

ชั้นอื่นของการทดสอบ (unit, integration) อยู่นอกเอกสารนี้ ดู `ssk-test-plan.md`

## สภาพแวดล้อมและข้อมูลทดสอบ

**ชุด mock/stubbed** — ไม่ต้องเปิด backend script ใน `e2e/package.json` ยก dev server ของ Vite ให้เอง
แต่ต้องตั้ง `E2E_ADMIN_PASSWORD` เป็นค่าอะไรก็ได้ก่อน (backend จำลองรับทุกรหัส)
```powershell
cd e2e
$env:E2E_ADMIN_PASSWORD='any'
npm test
```

**ชุด live** — ต้องเปิดฐานข้อมูลกับ backend ก่อน
```powershell
docker compose up -d db mailpit              # ที่รากโปรเจกต์
cd backend
$env:SPRING_PROFILES_ACTIVE='dev'
$env:SPRING_DATASOURCE_PASSWORD='<ตาม .env>'
$env:APP_ADMIN_PASSWORD='<รหัสแอดมิน>'
.\gradlew.bat bootRun

# อีกหน้าต่าง
cd e2e
$env:E2E_ADMIN_PASSWORD='<รหัสแอดมินตัวเดียวกัน>'
npm run test:live
```

ใน CI ไม่ต้องทำขั้นตอนนี้เอง job `e2e-live` ของ `build-lint-test.yml` ยก `db`, `mailpit` และ `backend`
ด้วย docker compose บน volume ใหม่ทุกรอบ สุ่มรหัสแอดมินให้ทั้ง backend และเทส แล้วสั่ง `npm run test:live`

| เรื่อง | ชุด mock/stubbed | ชุด live |
|---|---|---|
| ข้อมูลตั้งต้น | คงที่ใน `mockApi.ts` เริ่มใหม่ทุกครั้งที่โหลดหน้า | จาก `DevDataSeeder` (โปรไฟล์ `dev`) + ข้อมูลที่เคยเทสไว้ (ใน CI ฐานข้อมูลใหม่ทุกรอบ มีแค่ seed) |
| ความสะอาดของข้อมูล | ไม่ต้องจัดการ | เทสสร้างชื่อและเลขบัตรใหม่ทุกครั้ง · เคสที่แก้ค่าระบบคืนค่าเดิมเมื่อจบ |
| ล้างข้อมูลทั้งหมด | – | `docker compose down -v` แล้ว `up` ใหม่ seed จะสร้างให้ |
| รหัสแอดมิน | backend จำลองรับรหัสอะไรก็ได้ | อ่านจาก `E2E_ADMIN_PASSWORD` ไม่ฝังในโค้ด |

---

## 1. โปรเจกต์ mock-api (15 เคส)

ไฟล์ (ใน `e2e/cypress/e2e/`): `adminFlows.cy.ts`, `businessRules.cy.ts`, `maintenanceLog.cy.ts`, `maintenanceTasks.cy.ts`, `navigation.cy.ts`, `payments.cy.ts`, `session.cy.ts`

| ID | Title | Preconditions | Steps | Input Data | Expected Result |
|---|---|---|---|---|---|
| E2E-LOGIN-001 | ล็อกอินแล้วเข้า Dashboard เห็นห้องครบสองชั้น | อยู่หน้า `/login` | 1) กรอกชื่อผู้ใช้และรหัส 2) กด Sign In | admin | ไปที่ `/` เห็นหัวข้อ Floor 1 และ Floor 2 พร้อมห้อง 101 ถึง 212 |
| E2E-UNITS-001 | ตั้งผัง 3 ชั้น ชั้นละ 10 ห้อง แล้ว Dashboard วางห้องตามผังใหม่ (SSK-160) | ล็อกอินแล้ว ผังตั้งต้น 2 × 12 | 1) Units → Apartment settings 2) กรอก 3 ชั้น 10 ห้อง 3) Save Layout 4) Dashboard | 3 / 10 | สรุปในฟอร์มขึ้น 30 units · Dashboard มีหัวข้อ Floor 3 ห้อง 310 รวม 30 ห้อง และไม่มีห้อง 212 |
| E2E-UNITS-002 | อัตราใหม่ของห้องใช้กับสัญญาและบิลถัดไป บิลเก่าไม่เปลี่ยน (SSK-162) | ห้อง 105 ว่าง ไม่มีบิล · บิลของ Yuki 15,250 | 1) Units → ประวัติอัตราห้อง 105 → Schedule rate เดือนนี้ ค่าเช่า 5,200 2) Contracts → สัญญาห้อง 105 ให้ Haruto 3) Payments → New Invoice ห้อง 105 | 5,200 | ตาราง Rate history ขึ้นแถวใหม่ · ตัวอย่างบิลค่าเช่า 5,200 · บิลของ Yuki ยังเป็น 15,250 |
| E2E-UNITS-003 | ค่าที่จอดรถรายเดือนของห้องขึ้นในบิลของสัญญาที่ทำหลังจากนั้น (SSK-165) | ห้อง 105 ว่าง | 1) Units → Extra charges → Add charge ห้อง 105 Parking space 500 รายเดือน 2) Contracts → สัญญาห้อง 105 3) Payments → New Invoice ห้อง 105 | 500 | ตารางขึ้นรายการ Active · ตัวอย่างบิลมีบรรทัด Parking space 500 · ยอดรวม 4,550 · บิลขึ้นในตาราง |
| E2E-TENANT-001 | เพิ่มผู้เช่าแล้วขึ้นในตารางทันที | ล็อกอินแล้ว | 1) ไปหน้า Tenants 2) Add New Tenant 3) กรอกชื่อและเบอร์ 4) Confirm | Mana Sukjai / 0891234567 | ป็อปอัปปิด แถวใหม่ขึ้นในตารางทันทีโดยไม่ต้องรีโหลด |
| E2E-CONTRACT-001 | เพิ่มผู้เช่า สร้างสัญญา แล้วห้องเปลี่ยนเป็น Occupied | ล็อกอินแล้ว ห้อง 105 ว่าง | 1) เพิ่มผู้เช่า 2) Contracts → Create Contract เลือกห้อง 105 กับผู้เช่านั้น 3) กลับ Dashboard | ห้อง 105 | การ์ดห้อง 105 ขึ้นชื่อผู้เช่า · การ์ดสรุป Occupied +1 และ Available −1 |
| E2E-CONTRACT-002 | ฟอร์มสัญญาเลือกห้องที่มีผู้เช่าไม่ได้ | ห้อง 102 มีสัญญาอยู่แล้ว | 1) เปิดฟอร์ม Create Contract 2) ดูรายการห้อง 3) ทำสัญญาห้อง 105 4) เปิดฟอร์มใหม่ | – | ห้อง 102 ไม่อยู่ในรายการ · ห้อง 105 หายจากรายการทันทีหลังทำสัญญา (US-05) |
| E2E-CONFIG-001 | เปลี่ยนอัตราค่าไฟแล้วฟอร์มสัญญาใช้ค่าใหม่ | ล็อกอินแล้ว | 1) Units → Config ตั้งค่าไฟ 2) เปิดฟอร์ม Create Contract | 77 | ตัวเลือกอัตราในฟอร์มขึ้น 77.00 |
| E2E-CONFIG-002 | เปลี่ยนอัตราใน Config แล้วบิลของสัญญาเดิมต้องไม่เปลี่ยนตาม | ห้อง 207 มีสัญญา active ที่ล็อกค่าไฟไว้ 50 | 1) Units → Config ตั้งค่าไฟเป็น 77 2) Payments → New Invoice เลือกห้อง 207 | 77 | ฟอร์มยังคิดที่ **50.00** ตามอัตราที่ล็อกตอนเซ็นสัญญา ไม่ใช่ 77 ของ Config |
| E2E-MAINT-001 | กดแถวใน Maintenance Log แล้วเห็นรายละเอียด | มีใบแจ้งซ่อมอยู่ | 1) Maintenance → แท็บ Maintenance Log 2) กดแถว | – | เปิดรายละเอียดใบแจ้งซ่อมใบนั้น |
| E2E-MAINT-002 | เปิดรายละเอียดด้วยคีย์บอร์ดและปิดด้วย Escape | มีใบแจ้งซ่อมอยู่ | 1) โฟกัสที่ชื่อใบแจ้งซ่อม 2) กด Enter 3) กด Escape | – | เปิดและปิดได้ด้วยคีย์บอร์ด (เข้าถึงได้) |
| E2E-MAINT-003 | ใบแจ้งซ่อมจาก Dashboard ปิดห้องได้และปิดงานได้จากแท็บ Tasks | ล็อกอินแล้ว | 1) Dashboard สร้างใบแจ้งซ่อมแบบ Out of Service 2) ไปแท็บ Maintenance Tasks 3) ปิดงาน | – | ห้องถูกปิดใช้งาน แล้วปิดงานจากแท็บ Tasks ได้ |
| E2E-MAINT-004 | ลบได้เฉพาะงานที่ยัง Open | มีงานสถานะ Open และ In Progress | 1) ลองลบงาน Open 2) ลองลบงาน In Progress | – | งาน Open ลบได้ · งาน In Progress ลบไม่ได้และมีข้อความอธิบาย |
| E2E-MAINT-005 | เบิกของเข้าใบแจ้งซ่อมแล้วสต็อกลดจริง (SSK-154) | คลังมี LED Bulbs 60W 145 ชิ้น · Copper Pipe Fittings 85 ชิ้น | 1) Dashboard สร้างใบห้อง 105 เบิก LED Bulbs 60W 2 ชิ้น 2) แท็บ Tasks เปิดรายละเอียดใบ กด Add Supply เบิก Copper Pipe Fittings 1 ชิ้น 3) แท็บ Supplies & Inventory | LED × 2 · Copper × 1 | รายละเอียดใบแสดงของทั้งสองรายการ · คลังเหลือ LED 143 และ Copper 84 |
| E2E-NAV-001 | เมนูด้านข้างไปได้ทุกหน้า | ล็อกอินแล้ว | กดเมนูทีละหน้าจนครบ | 7 หน้า | ทุกหน้าขึ้นหัวข้อของตัวเอง ไม่มีหน้าว่าง |
| E2E-PAYMENT-001 | ออกบิลห้อง 207 แล้วยอดค่าไฟคิดตามหน่วย | ห้อง 207 มีสัญญา active ของ Hiroshi Nakamura ล็อกค่าไฟไว้ 50 | 1) Payments → New Invoice 2) เลือกห้อง 207 3) กรอกหน่วยไฟและน้ำ 4) Create Bill | ไฟ 100 หน่วย · น้ำ 10 หน่วย | ชื่อผู้เช่าขึ้นอัตโนมัติจากสัญญา · ยอดค่าไฟ = 100 × 50.00 · บิลขึ้นในตารางทันที |
| E2E-LOGOUT-001 | ออกจากระบบแล้วกลับหน้า Login | ล็อกอินแล้ว | 1) กด Log out 2) กด CONFIRM | – | ไปที่ `/login` |
| E2E-LOGOUT-002 | กด CANCEL แล้วยังอยู่หน้าเดิม | ล็อกอินแล้ว | 1) กด Log out 2) กด CANCEL | – | ป็อปอัปปิด ยังอยู่หน้าเดิม ไม่หลุดออกจากระบบ |

## 2. โปรเจกต์ stubbed-api (2 เคส)

ไฟล์: `auth.stubbed.cy.ts` — ใช้ `cy.intercept` ปลอมคำตอบ เพราะ backend จำลองรับรหัสอะไรก็ผ่าน จึงทดสอบเคสล็อกอินล้มเหลวไม่ได้

| ID | Title | Preconditions | Steps | Input Data | Expected Result |
|---|---|---|---|---|---|
| E2E-LOGIN-002 | ยังไม่ล็อกอินแล้วเปิดหน้าใน ระบบพากลับไป Login | API ตอบ 401 ที่ `/api/auth/me` | เปิด `/contracts` ตรง ๆ | – | ถูกพาไป `/login` (US-01) |
| E2E-LOGIN-003 | รหัสผิดแล้วขึ้นข้อความจาก backend | API ตอบ 401 พร้อม detail | 1) กรอกรหัสผิด 2) Sign In | wrong-password | ขึ้นข้อความจาก backend และยังอยู่ `/login` |

## 3. โปรเจกต์ live-api (17 เคส)

ไฟล์: `live/auth.live.cy.ts`, `live/apartmentConfig.live.cy.ts`, `live/tenants.live.cy.ts`, `live/maintenance.live.cy.ts`, `live/payments.live.cy.ts`, `live/reminders.live.cy.ts`, `live/supplies.live.cy.ts`, `live/contracts.live.cy.ts`
การเก็บกวาดทุกเคสทำใน `afterEach` ผ่าน API จึงทำงานแม้เทสพังกลางทาง
**ทุกเคสในหัวข้อนี้คุยกับ Spring และ PostgreSQL จริง ไม่มีของปลอมคั่นกลาง**

### E2E-LIVE-LOGIN-001 — รหัสผิดถูกปฏิเสธโดย backend จริง

- **Preconditions** db และ backend โปรไฟล์ `dev` รันอยู่ · มีผู้ใช้แอดมินในตาราง `admin_user`
- **Steps** 1) เปิด `/login` 2) กรอกชื่อผู้ใช้จริงกับรหัสผิด 3) กด Sign In
- **Input Data** `admin` / `definitely-not-the-password`
- **Expected Result** `POST /api/auth/login` ตอบ **401** · ขึ้นข้อความ *The username or password is incorrect* จาก backend · ยังอยู่ `/login`

### E2E-LIVE-LOGIN-002 — ล็อกอินแล้วโหลดห้อง 24 ห้องจากฐานข้อมูล

- **Preconditions** เหมือนข้างบน · ตาราง `room` มีข้อมูลจาก `V2__seed_rooms.sql`
- **Steps** 1) ล็อกอินด้วยรหัสจริง 2) ดู Dashboard
- **Input Data** `admin` / ค่าใน `E2E_ADMIN_PASSWORD`
- **Expected Result** เห็นหัวข้อ Floor 1 และ Floor 2 · เห็นห้อง 101 และ 212 ซึ่งมาจากฐานข้อมูลไม่ใช่ค่าคงที่ในโค้ด

### E2E-LIVE-SESSION-001 — รีเฟรชทั้งหน้าแล้วยังล็อกอินอยู่

- **Preconditions** ล็อกอินสำเร็จแล้ว
- **Steps** 1) กดรีโหลดหน้า
- **Expected Result** ยังอยู่ที่ `/` ไม่ถูกเด้งออก (session cookie ที่ backend ยังใช้ได้ และ `/api/auth/me` ตอบ 200)

### E2E-LIVE-SESSION-002 — ออกจากระบบแล้ว session ถูกล้างที่ backend

- **Preconditions** ล็อกอินสำเร็จแล้ว
- **Steps** 1) Log out → CONFIRM 2) เปิด `/tenants` ตรง ๆ
- **Expected Result** ไปที่ `/login` ทั้งสองครั้ง แปลว่า cookie ถูกล้างจริง ไม่ใช่แค่เปลี่ยนหน้า

### E2E-LIVE-CONFIG-001 — อัตราค่าไฟที่บันทึกไม่หายหลังรีโหลด

- **Preconditions** ล็อกอินแล้ว · จดค่าอัตราเดิมไว้
- **Steps** 1) Units → Config 2) เปลี่ยนอัตราค่าไฟ 3) Save Rates 4) รีโหลดทั้งหน้า 5) เปิด Config อีกครั้ง
- **Input Data** อัตราที่ไม่ตรงกับค่าตั้งต้น เช่น 73
- **Expected Result** หลังรีโหลดค่ายังเป็น 73 แปลว่า `PUT /api/apartment-config` เขียนลง PostgreSQL จริง
- **Cleanup** `PUT /api/apartment-config` ด้วยค่าทั้งสี่ตัวที่อ่านไว้ตอนเริ่มเทส อัตรากลับเป็นค่าเดิมเสมอ

### E2E-LIVE-TENANT-001 — เพิ่มผู้เช่าแล้วข้อมูลอยู่ในฐานข้อมูล

- **Preconditions** ล็อกอินแล้ว
- **Steps** 1) Tenants → Add New Tenant 2) กรอกชื่อ เบอร์ และเลขบัตรประชาชน 3) Confirm 4) รีโหลดทั้งหน้า
- **Input Data** ชื่อไม่ซ้ำ (ต่อท้ายด้วยเวลา) · เลขบัตร 13 หลักที่ผ่าน checksum และสุ่มใหม่ทุกครั้ง
- **Expected Result** แถวใหม่ขึ้นในตาราง และยังอยู่หลังรีโหลด
- **หมายเหตุ** เคยแดงจริงจากบั๊ก SSK-113 ที่หน้าเว็บส่งเลขบัตรพร้อมช่องว่างแล้ว backend ตอบ 400

### E2E-LIVE-TENANT-002 — แก้ไขผู้เช่าผ่าน API จริง

- **Preconditions** ล็อกอินแล้ว
- **Steps** 1) สร้างผู้เช่าของเทสเอง 2) กดแก้ไขแถวนั้น 3) เปลี่ยนเบอร์โทร 4) Confirm 5) รีโหลด
- **Input Data** เบอร์ใหม่ `0899999999`
- **Expected Result** `PUT /api/tenants/{id}` ตอบ **200** · หลังรีโหลดตารางขึ้นเบอร์ใหม่
- **หมายเหตุ** เคยแดงจริงตอน backend ยังไม่มี `PUT` (ได้ 405) แก้แล้วใน SSK-108

### E2E-LIVE-TENANT-003 — ลบผู้เช่าออกจากฐานข้อมูล

- **Preconditions** ล็อกอินแล้ว
- **Steps** 1) สร้างผู้เช่าของเทสเอง 2) กดลบ 3) Confirm Delete 4) รีโหลด
- **Expected Result** `DELETE /api/tenants/{id}` สำเร็จ · แถวหายและไม่กลับมาหลังรีโหลด (เทสเก็บกวาดข้อมูลของตัวเองไปในตัว)
- **Cleanup** ถ้าเทสพังก่อนลบสำเร็จ `afterEach` ลบผู้เช่าด้วย `DELETE /api/tenants/{id}` ให้

### E2E-LIVE-CONTRACT-001 — สร้างสัญญาจากฟอร์มแล้วบันทึกลงฐานข้อมูลจริง

- **Preconditions** ล็อกอินแล้ว · ห้อง 211 ว่าง · สร้างผู้เช่าของเทสผ่าน API
- **Steps** 1) Contracts → Create Contract 2) เลือกห้อง 211 ผู้เช่าของเทส และ Billing Cycle = Yearly 3) Create Contract 4) รีโหลดทั้งหน้า 5) หาแถวในตาราง Contracts 6) ไป Dashboard
- **Input Data** ผู้เช่า `QA Contract <timestamp>` · วันเริ่มเป็นค่าตั้งต้น (วันนี้) · Yearly
- **Expected Result** `POST /api/leases` ตอบ **201** · หลังรีโหลดแถวยังอยู่และเป็น Active · สัญญาในฐานข้อมูลเป็น `YEARLY` · การ์ดห้อง 211 ขึ้นชื่อผู้เช่าและห้องเป็น `OCCUPIED`
- **หมายเหตุ** เลือก Yearly เพื่อพิสูจน์ว่าค่าที่เลือกบนหน้าจอถึงฐานข้อมูลจริง ไม่ได้ตรวจการคิดค่าเช่า · จบเทสปิดสัญญาผ่าน API คืนห้องให้ว่าง

### E2E-LIVE-CONTRACT-002 — Check Out จาก Dashboard แล้วสัญญาปิดและห้องว่าง

- **Preconditions** ล็อกอินแล้ว · ห้อง 212 ว่าง · สร้างผู้เช่ากับสัญญา Monthly ของเทสผ่าน API
- **Steps** 1) รีโหลด Dashboard 2) คลิกการ์ดห้อง 212 3) Check Out 4) Confirm Check Out 5) รีโหลดทั้งหน้า 6) หาแถวในตาราง Contracts
- **Expected Result** `POST /api/leases/{id}/terminate` ตอบ **200** · หลังรีโหลดการ์ดห้องไม่มีชื่อผู้เช่าแล้ว ห้องเป็น `AVAILABLE` · สัญญาเป็น `ENDED` และแถวในตารางขึ้น Ended

### E2E-LIVE-MAINT-001 — ใบแจ้งซ่อมที่คิดเงินผู้เช่าถูกบันทึกและขึ้นบนการ์ดห้อง

- **Preconditions** ล็อกอินแล้ว · ห้อง 109 ยังไม่มีใบแจ้งซ่อมค้าง
- **Steps** 1) Dashboard → Create Maintenance 2) เลือก Floor 1 ห้อง 109 3) เลือกประเภท 4) เลือก Still Available 5) ติ๊ก Bill this repair to the tenant ใส่จำนวนเงิน 6) Save Maintenance 7) รีโหลด
- **Input Data** ห้อง 109 · Plumbing · 5000
- **Expected Result** `POST /api/maintenance` ตอบ **201** · การ์ดห้องขึ้นไอคอน 🔧 และยังขึ้นหลังรีโหลด · ห้องยังว่างเพราะเลือก Still Available
- **Cleanup** ลบใบแจ้งซ่อมที่สร้างด้วย `DELETE /api/maintenance/{id}` เสมอ แม้เทสจะล้มกลางทาง
- **หมายเหตุ** เคยแดงจริงจากบั๊ก SSK-139 ที่กด Save แล้วไม่มีคำขอออกไปเลย

### E2E-LIVE-MAINT-002 — เลือก Out of Service แล้วห้องเปลี่ยนเป็น Maintenance

- **Preconditions** ล็อกอินแล้ว · ห้อง 110 ว่าง
- **Steps** 1) Dashboard → Create Maintenance เลือกห้อง 110 2) เลือก Out of Service 3) Save 4) รีโหลด
- **Input Data** ห้อง 110 · Plumbing
- **Expected Result** การ์ดห้องขึ้นสถานะ Maintenance และยังเป็นหลังรีโหลด
- **Cleanup** คืนห้องให้ว่างด้วย `PATCH /api/rooms/{id}/status` (`AVAILABLE` endpoint เดียวกับปุ่ม Release Room) แล้วลบใบแจ้งซ่อมด้วย `DELETE /api/maintenance/{id}`

### E2E-LIVE-PAYMENT-001 — ใบแจ้งหนี้ที่กดส่งไปถึงกล่องของ Mailpit พร้อม PDF

- **Preconditions** ล็อกอินแล้ว · stack เปิดด้วย `docker compose` ที่มี service `mailpit` · มีใบค้างของสมชาย (DevDataSeeder)
- **Steps** 1) Payments 2) ติ๊กแถวใบค้างของสมชาย 3) Send Invoices (1) 4) Send 1 Invoice 5) Done 6) ค้นกล่องผ่าน `GET http://localhost:8025/api/v1/search?query=to:somchai.j@example.com`
- **Input Data** ใบค้างของสมชาย · somchai.j@example.com
- **Expected Result** ป็อปอัปขึ้น `Sent 1 of 1` · Mailpit มีอีเมลที่หัวเรื่องมีเลขใบนั้นและมีไฟล์แนบหนึ่งไฟล์ ส่งหลังเริ่มเทส
- **Cleanup** ไม่ต้อง การส่งซ้ำเป็นเรื่องปกติของระบบ (นับเพิ่มใน `sentCount`) และอีเมลค้างอยู่ใน Mailpit ไม่ได้ออกไปไหน

### E2E-LIVE-REMINDER-001 — รอบแจ้งเตือนที่ถึงกำหนดกลายเป็นใบแจ้งซ่อมจริง (US-14-S2)

- **Preconditions** ล็อกอินแล้ว · db และ backend โปรไฟล์ `dev` รันอยู่ · ห้อง 111 มีอยู่จริง
- **Steps** 1) Maintenance → Schedule & Reminder 2) Add Reminder ตั้ง Frequency = Monthly, Start Date = **เมื่อวาน**, Assigned Unit = 111, Priority = High 3) Save Reminder 4) เรียก `POST /api/reminders/run-due` 5) รีโหลดหน้า 6) เปิดแท็บ Maintenance Log
- **Input Data** ชื่อรอบ `QA Reminder <timestamp>` · ห้อง 111
- **Expected Result** ก่อนรัน ไม่มีใบแจ้งซ่อมชื่อนี้ · หลังรันมีหนึ่งใบ และ `source` เป็น `RECURRING` · แท็บ Maintenance Log แสดงชื่อรอบและเลขห้อง 111 หลังรีโหลดทั้งหน้า
- **หมายเหตุ** วันเริ่มเป็นเมื่อวานเพื่อให้ถึงกำหนดทันที และ `run-due` เรียกเมธอดตัวเดียวกับที่ `ReminderScheduler` เรียกทุกเช้า จึงไม่ต้องรอเวลาจริงและไม่ได้ทำทางลัดพิเศษให้เทส
- **Cleanup** ปิดใบเป็น `DONE` แล้วพักรอบ **ลบไม่ได้** เพราะระบบห้ามลบใบที่ `source = RECURRING` และห้ามลบรอบที่เคยสร้างใบไปแล้ว (ดูหัวข้อข้อจำกัดข้างล่าง)

### E2E-LIVE-REMINDER-002 — รอบที่ถูกพักไว้ต้องไม่ถูกหยิบมาทำ

- **Preconditions** เหมือนข้างบน · ห้อง 112 มีอยู่จริง
- **Steps** 1) สร้างรอบแบบเดียวกับ 001 แต่ผูกห้อง 112 2) `PATCH /api/reminders/{id}/active` เป็น `false` 3) เรียก `POST /api/reminders/run-due` 4) รีโหลดหน้า
- **Input Data** ชื่อรอบ `QA Paused <timestamp>` · ห้อง 112
- **Expected Result** ไม่มีใบแจ้งซ่อมชื่อนี้เกิดขึ้นเลย · การ์ดของรอบยังอยู่ในแถบ Recurring
- **หมายเหตุ** คุ้มที่จะมี เพราะถ้าเงื่อนไข `active` หลุดจาก query ที่ดึงใบถึงกำหนด ระบบจะเริ่มสร้างใบให้รอบที่แอดมินสั่งปิดไว้ ซึ่งผู้ใช้ไม่มีทางสังเกตเห็นเอง
- **Cleanup** ลบรอบด้วย `DELETE /api/reminders/{id}` ได้จริง เพราะยังไม่เคยสร้างใบ

### E2E-LIVE-SUPPLY-001 — เพิ่มของและเติมของถูกบันทึกลงฐานข้อมูล (US-17-S1, S2)

- **Preconditions** ล็อกอินแล้ว · db และ backend รันอยู่
- **Steps** 1) Maintenance → Supplies & Inventory 2) New Supply Item กรอก Category = Plumbing, Quantity 20, Min 5, Max 100 3) Add Supply 4) กดปุ่ม Restock ของแถวนั้น ใส่ 15 5) Restock 6) **รีโหลดทั้งหน้า** แล้วกลับมาแท็บเดิม
- **Input Data** ชื่อ `QA Supply <timestamp>` · 20 ชิ้น เติมอีก 15
- **Expected Result** แถวใหม่โผล่ทันทีพร้อมจำนวน 20 และป้าย In Stock · หลังเติมและรีโหลด จำนวนเป็น **35** (บวกเข้ากับของเดิม ไม่ใช่ทับค่าเดิม)
- **Cleanup** `DELETE /api/supplies/{id}` ของที่ยังไม่เคยถูกใช้ในใบแจ้งซ่อมลบได้ ประวัติการเติมถูกลบตามให้เอง

### E2E-LIVE-SUPPLY-002 — ของต่ำกว่าขั้นต่ำขึ้นป้าย Low Stock และถูกนับบนการ์ดเตือน (US-17-S3)

- **Preconditions** ล็อกอินแล้ว · db และ backend รันอยู่
- **Steps** 1) เพิ่มของที่ Quantity 2, Min 10, Max 50 2) อ่านตัวเลขบนการ์ด LOW STOCK ALERTS 3) Restock เพิ่ม 20 4) อ่านป้ายกับตัวเลขบนการ์ดอีกครั้ง
- **Input Data** ชื่อ `QA LowStock <timestamp>` · 2 ชิ้น ขั้นต่ำ 10
- **Expected Result** แถวขึ้นป้าย **Low Stock** · หลังเติมจนพ้นเกณฑ์ ป้ายเปลี่ยนเป็น **In Stock** และตัวเลขบนการ์ด **ลดลงหนึ่ง**
- **หมายเหตุ** ตัวเลขบนการ์ดมาจาก `GET /api/supplies/summary` ซึ่งเป็นคนละคำขอกับรายการในตาราง ถ้าตรวจแค่ป้ายในแถว จะไม่รู้เลยว่า backend นับยอดสรุปด้วยกฎเดียวกับที่หน้าเว็บใช้ตีป้ายหรือเปล่า
- **Cleanup** `DELETE /api/supplies/{id}`

---

## ข้อจำกัดและสิ่งที่ยังไม่ครอบ

| เรื่อง | สถานะ |
|---|---|
| ชุด `live-api` ใน CI | เข้าแล้ว (SSK-138) job `e2e-live` ยก stack ด้วย docker compose ฐานข้อมูลใหม่ทุกรอบ รายงานอยู่ใน artifact `e2e-live-report` |
| Supplies ในหน้า Maintenance | มีเคส live แล้ว `E2E-LIVE-SUPPLY-001/002` |
| Reminders ในหน้า Maintenance | มีเคส live แล้ว `E2E-LIVE-REMINDER-001/002` |
| ส่งบิลเป็นกลุ่ม (SSK-130 / SSK-143) | ต่อ backend แล้ว มีเคส `E2E-LIVE-PAYMENT-001` ที่เช็คถึงกล่องของ Mailpit |
| ตั้งเวลาเตือนใบค้างรายเดือน (SSK-143) | ต่อ backend แล้ว แต่ยังไม่มีเคส live เพราะต้องรอให้นาฬิกาจริงถึงรอบ กฎของรอบกับการกันสอง pod พิสูจน์ที่ `BillingScheduleApiTest` ฝั่ง backend แทน ส่วนการออกบิลใหม่อัตโนมัติยังทำไม่ได้ (ไม่มีค่ามิเตอร์) |
| Recurring maintenance | มีเคส live แล้ว `E2E-LIVE-REMINDER-001` คุมเวลาด้วย `POST /api/reminders/run-due` แทนการรอรอบแปดโมงเช้า |
| ลบรอบแจ้งเตือนที่ยิงไปแล้ว | **ทำไม่ได้เลยทั้งจากหน้าจอและจาก API** `MaintenanceService.delete` ปฏิเสธใบที่ `source = RECURRING` (ให้ Mark as Done) และ `ReminderService.delete` ปฏิเสธรอบที่เคยสร้างใบ (ให้ Pause) สองกฎบวกกันแปลว่ารอบที่ตั้งผิดแล้วเผลอยิง จะอยู่ในระบบถาวร `E2E-LIVE-REMINDER-001` จึงเก็บกวาดได้แค่ปิดใบกับพักรอบ **ต้องคุยกับทีมว่าตั้งใจให้เป็นแบบนี้หรือเปล่า** |
| เก็บกวาดเคสสัญญา (CONTRACT-001/002) | **ลบไม่ได้หมด** ระบบไม่มี endpoint ลบสัญญา และผู้เช่าที่มีประวัติสัญญาลบไม่ได้ (409) ทุกรอบจึงเหลือผู้เช่า `QA Contract ...` กับสัญญาที่ปิดแล้วเคสละชุด เทสคืนห้อง 211/212 ให้ว่างเสมอ |
| การพิมพ์ PDF | ตรวจด้วยมือ เพราะเป็นหน้าต่างพิมพ์ของเบราว์เซอร์ ซึ่ง Cypress ควบคุมไม่ได้ |
| ความเข้ากันได้ของเบราว์เซอร์ | รันบน Chrome อย่างเดียว (`cypress run --browser chrome` ใน `e2e/package.json`) |

**วิธีรายงานผล** ระบุเสมอว่าเป็นโปรเจกต์ไหน เพราะเลขรวมอย่างเดียวทำให้เข้าใจผิดว่าเทสแตะระบบจริงทั้งหมด

```
mock-api + stubbed-api   17 เคส   ไม่แตะ backend   รันอัตโนมัติใน CI ทุก PR
live-api                 17 เคส   แตะ backend + PostgreSQL + Mailpit จริง   รันอัตโนมัติใน CI ทุก PR (job e2e-live)
```

เมื่อเทสพัง เปิดรายงาน `e2e/cypress/reports/<ชุด>/index.html` (ใน CI คือ artifact `e2e-report` หรือ `e2e-live-report`)
เคสที่พังมีรูปหน้าจอฝังอยู่ในรายงาน รูปไฟล์แยกอยู่ที่ `e2e/cypress/screenshots/`
ถ้าอยากดูทีละขั้นให้เปิดหน้าจอของ Cypress
```bash
cd e2e
npm run open:live   # หรือ open:mock / open:stubbed
```
