# E2E Test Cases — Sakura Soul

> เอกสารนี้เก็บ **รายการเทสเคส** ของชั้น E2E เท่านั้น
> ภาพรวมแผนทดสอบทั้งโปรเจกต์อยู่ใน `ssk-test-plan.md` · วิธีติดตั้งและรันอยู่ใน `frontend/e2e/README.md`
> โค้ดอยู่ที่ `frontend/e2e/**/*.spec.ts` · ปรับปรุงล่าสุด 25 ก.ย. 2569

## สารบัญ

- [ขอบเขตและสามโปรเจกต์](#ขอบเขตและสามโปรเจกต์)
- [สภาพแวดล้อมและข้อมูลทดสอบ](#สภาพแวดล้อมและข้อมูลทดสอบ)
- [1. โปรเจกต์ mock-api (14 เคส)](#1-โปรเจกต์-mock-api-14-เคส)
- [2. โปรเจกต์ stubbed-api (2 เคส)](#2-โปรเจกต์-stubbed-api-2-เคส)
- [3. โปรเจกต์ live-api (10 เคส)](#3-โปรเจกต์-live-api-10-เคส)
- [ข้อจำกัดและสิ่งที่ยังไม่ครอบ](#ข้อจำกัดและสิ่งที่ยังไม่ครอบ)

---

## ขอบเขตและสามโปรเจกต์

ทุกเคสรันผ่าน Playwright เปิดเบราว์เซอร์จริง ต่างกันที่ **ปลายทางของคำขอ `/api`**
ต้องระบุให้ชัดทุกครั้งที่รายงานผล ว่าเคสไหนแตะระบบจริงและเคสไหนแตะแค่หน้าเว็บ

| โปรเจกต์ | พอร์ต | ปลายทาง `/api` | ครอบอะไร | อยู่ใน CI |
|---|---|---|---|---|
| `mock-api` | 4173 | backend จำลองในเบราว์เซอร์ (`src/api/mockApi.ts`) | เส้นทางการกดของผู้ใช้ กฎที่อยู่ฝั่งหน้าเว็บ | ✅ |
| `stubbed-api` | 4174 | Playwright ปลอมคำตอบด้วย `page.route` | เคสที่ต้องบังคับให้ API ตอบแบบเจาะจง เช่น 401 | ✅ |
| `live-api` | 4175 | **Spring + PostgreSQL จริง** | UI → API → Database ครบสาย | ❌ สั่งรันเอง |

ชั้นอื่นของการทดสอบ (unit, integration) อยู่นอกเอกสารนี้ ดู `ssk-test-plan.md`

## สภาพแวดล้อมและข้อมูลทดสอบ

**ชุด mock/stubbed** — ไม่ต้องเปิดอะไร Playwright ยก dev server ให้เอง
```bash
cd frontend
npm run test:e2e
```

**ชุด live** — ต้องเปิดฐานข้อมูลกับ backend ก่อน
```powershell
docker compose up -d db                      # ที่รากโปรเจกต์
cd backend
$env:SPRING_PROFILES_ACTIVE='dev'
$env:SPRING_DATASOURCE_PASSWORD='<ตาม .env>'
$env:APP_ADMIN_PASSWORD='<รหัสแอดมิน>'
.\gradlew.bat bootRun

# อีกหน้าต่าง
cd frontend
$env:E2E_ADMIN_PASSWORD='<รหัสแอดมินตัวเดียวกัน>'
npm run test:e2e:live
```

| เรื่อง | ชุด mock/stubbed | ชุด live |
|---|---|---|
| ข้อมูลตั้งต้น | คงที่ใน `mockApi.ts` เริ่มใหม่ทุกครั้งที่โหลดหน้า | จาก `DevDataSeeder` (โปรไฟล์ `dev`) + ข้อมูลที่เคยเทสไว้ |
| ความสะอาดของข้อมูล | ไม่ต้องจัดการ | เทสสร้างชื่อและเลขบัตรใหม่ทุกครั้ง · เคสที่แก้ค่าระบบคืนค่าเดิมเมื่อจบ |
| ล้างข้อมูลทั้งหมด | – | `docker compose down -v` แล้ว `up` ใหม่ seed จะสร้างให้ |
| รหัสแอดมิน | backend จำลองรับรหัสอะไรก็ได้ | อ่านจาก `E2E_ADMIN_PASSWORD` ไม่ฝังในโค้ด |

---

## 1. โปรเจกต์ mock-api (14 เคส)

ไฟล์: `adminFlows.spec.ts`, `businessRules.spec.ts`, `maintenanceLog.spec.ts`, `maintenanceTasks.spec.ts`, `navigation.spec.ts`, `payments.spec.ts`, `session.spec.ts`

| ID | Title | Preconditions | Steps | Input Data | Expected Result |
|---|---|---|---|---|---|
| E2E-LOGIN-001 | ล็อกอินแล้วเข้า Dashboard เห็นห้องครบสองชั้น | อยู่หน้า `/login` | 1) กรอกชื่อผู้ใช้และรหัส 2) กด Sign In | admin | ไปที่ `/` เห็นหัวข้อ Floor 1 และ Floor 2 พร้อมห้อง 101 ถึง 212 |
| E2E-TENANT-001 | เพิ่มผู้เช่าแล้วขึ้นในตารางทันที | ล็อกอินแล้ว | 1) ไปหน้า Tenants 2) Add New Tenant 3) กรอกชื่อและเบอร์ 4) Confirm | Mana Sukjai / 0891234567 | ป็อปอัปปิด แถวใหม่ขึ้นในตารางทันทีโดยไม่ต้องรีโหลด |
| E2E-CONTRACT-001 | เพิ่มผู้เช่า สร้างสัญญา แล้วห้องเปลี่ยนเป็น Occupied | ล็อกอินแล้ว ห้อง 105 ว่าง | 1) เพิ่มผู้เช่า 2) Contracts → Create Contract เลือกห้อง 105 กับผู้เช่านั้น 3) กลับ Dashboard | ห้อง 105 | การ์ดห้อง 105 ขึ้นชื่อผู้เช่า · การ์ดสรุป Occupied +1 และ Available −1 |
| E2E-CONTRACT-002 | ฟอร์มสัญญาเลือกห้องที่มีผู้เช่าไม่ได้ | ห้อง 102 มีสัญญาอยู่แล้ว | 1) เปิดฟอร์ม Create Contract 2) ดูรายการห้อง 3) ทำสัญญาห้อง 105 4) เปิดฟอร์มใหม่ | – | ห้อง 102 ไม่อยู่ในรายการ · ห้อง 105 หายจากรายการทันทีหลังทำสัญญา (US-05) |
| E2E-CONFIG-001 | เปลี่ยนอัตราค่าไฟแล้วฟอร์มสัญญาใช้ค่าใหม่ | ล็อกอินแล้ว | 1) Units → Config ตั้งค่าไฟ 2) เปิดฟอร์ม Create Contract | 77 | ตัวเลือกอัตราในฟอร์มขึ้น 77.00 |
| E2E-CONFIG-002 | เปลี่ยนอัตราค่าไฟแล้วฟอร์มออกบิลใช้ค่าใหม่ | ล็อกอินแล้ว | 1) Units → Config ตั้งค่าไฟ 2) Payments → New Invoice | 77 | ฟอร์มออกบิลคิดที่ 77.00 ต่อหน่วย |
| E2E-MAINT-001 | กดแถวใน Maintenance Log แล้วเห็นรายละเอียด | มีใบแจ้งซ่อมอยู่ | 1) Maintenance → แท็บ Maintenance Log 2) กดแถว | – | เปิดรายละเอียดใบแจ้งซ่อมใบนั้น |
| E2E-MAINT-002 | เปิดรายละเอียดด้วยคีย์บอร์ดและปิดด้วย Escape | มีใบแจ้งซ่อมอยู่ | 1) โฟกัสที่ชื่อใบแจ้งซ่อม 2) กด Enter 3) กด Escape | – | เปิดและปิดได้ด้วยคีย์บอร์ด (เข้าถึงได้) |
| E2E-MAINT-003 | ใบแจ้งซ่อมจาก Dashboard ปิดห้องได้และปิดงานได้จากแท็บ Tasks | ล็อกอินแล้ว | 1) Dashboard สร้างใบแจ้งซ่อมแบบ Out of Service 2) ไปแท็บ Maintenance Tasks 3) ปิดงาน | – | ห้องถูกปิดใช้งาน แล้วปิดงานจากแท็บ Tasks ได้ |
| E2E-MAINT-004 | ลบได้เฉพาะงานที่ยัง Open | มีงานสถานะ Open และ In Progress | 1) ลองลบงาน Open 2) ลองลบงาน In Progress | – | งาน Open ลบได้ · งาน In Progress ลบไม่ได้และมีข้อความอธิบาย |
| E2E-NAV-001 | เมนูด้านข้างไปได้ทุกหน้า | ล็อกอินแล้ว | กดเมนูทีละหน้าจนครบ | 7 หน้า | ทุกหน้าขึ้นหัวข้อของตัวเอง ไม่มีหน้าว่าง |
| E2E-PAYMENT-001 | ออกบิลห้อง 101 แล้วยอดค่าไฟคิดตามหน่วย | ล็อกอินแล้ว | 1) Payments → New Invoice 2) กรอกหน่วยไฟ 3) Create Bill | 100 หน่วย | ยอด = หน่วย × อัตรา และบิลขึ้นในตารางทันที |
| E2E-LOGOUT-001 | ออกจากระบบแล้วกลับหน้า Login | ล็อกอินแล้ว | 1) กด Log out 2) กด CONFIRM | – | ไปที่ `/login` |
| E2E-LOGOUT-002 | กด CANCEL แล้วยังอยู่หน้าเดิม | ล็อกอินแล้ว | 1) กด Log out 2) กด CANCEL | – | ป็อปอัปปิด ยังอยู่หน้าเดิม ไม่หลุดออกจากระบบ |

## 2. โปรเจกต์ stubbed-api (2 เคส)

ไฟล์: `auth.stubbed.spec.ts` — ใช้ `page.route` ปลอมคำตอบ เพราะ backend จำลองรับรหัสอะไรก็ผ่าน จึงทดสอบเคสล็อกอินล้มเหลวไม่ได้

| ID | Title | Preconditions | Steps | Input Data | Expected Result |
|---|---|---|---|---|---|
| E2E-LOGIN-002 | ยังไม่ล็อกอินแล้วเปิดหน้าใน ระบบพากลับไป Login | API ตอบ 401 ที่ `/api/auth/me` | เปิด `/contracts` ตรง ๆ | – | ถูกพาไป `/login` (US-01) |
| E2E-LOGIN-003 | รหัสผิดแล้วขึ้นข้อความจาก backend | API ตอบ 401 พร้อม detail | 1) กรอกรหัสผิด 2) Sign In | wrong-password | ขึ้นข้อความจาก backend และยังอยู่ `/login` |

## 3. โปรเจกต์ live-api (10 เคส)

ไฟล์: `live/auth.live.spec.ts`, `live/apartmentConfig.live.spec.ts`, `live/tenants.live.spec.ts`, `live/maintenance.live.spec.ts`
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
- **Steps** 1) Units → Config 2) เปลี่ยนอัตราค่าไฟ 3) Save Rates 4) รีโหลดทั้งหน้า 5) เปิด Config อีกครั้ง 6) ตั้งค่ากลับเป็นค่าเดิม
- **Input Data** อัตราที่ไม่ตรงกับค่าตั้งต้น เช่น 73
- **Expected Result** หลังรีโหลดค่ายังเป็น 73 แปลว่า `PUT /api/apartment-config` เขียนลง PostgreSQL จริง · จบเทสแล้วอัตรากลับเป็นค่าเดิม

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

### E2E-LIVE-MAINT-001 — ใบแจ้งซ่อมที่คิดเงินผู้เช่าถูกบันทึกและขึ้นบนการ์ดห้อง

- **Preconditions** ล็อกอินแล้ว · ห้อง 109 ยังไม่มีใบแจ้งซ่อมค้าง
- **Steps** 1) Dashboard → Create Maintenance 2) เลือก Floor 1 ห้อง 109 3) เลือกประเภท 4) เลือก Still Available 5) ติ๊ก Bill this repair to the tenant ใส่จำนวนเงิน 6) Save Maintenance 7) รีโหลด
- **Input Data** ห้อง 109 · Plumbing · 5000
- **Expected Result** `POST /api/maintenance` ตอบ **201** · การ์ดห้องขึ้นไอคอน 🔧 และยังขึ้นหลังรีโหลด · ห้องยังว่างเพราะเลือก Still Available
- **หมายเหตุ** เคยแดงจริงจากบั๊ก SSK-139 ที่กด Save แล้วไม่มีคำขอออกไปเลย

### E2E-LIVE-MAINT-002 — เลือก Out of Service แล้วห้องเปลี่ยนเป็น Maintenance

- **Preconditions** ล็อกอินแล้ว · ห้อง 110 ว่าง
- **Steps** 1) Dashboard → Create Maintenance เลือกห้อง 110 2) เลือก Out of Service 3) Save 4) รีโหลด 5) กดการ์ดห้อง → Release Room
- **Input Data** ห้อง 110 · Plumbing
- **Expected Result** การ์ดห้องขึ้นสถานะ Maintenance และยังเป็นหลังรีโหลด · จบเทสแล้วห้องกลับมาว่างเหมือนเดิม

---

## ข้อจำกัดและสิ่งที่ยังไม่ครอบ

| เรื่อง | สถานะ |
|---|---|
| ชุด `live-api` ยังไม่อยู่ใน CI | ต้องเพิ่มขั้นตอนยก PostgreSQL กับ backend ใน workflow ก่อน ตอนนี้รันด้วยมือ |
| Supplies ในหน้า Maintenance | ต่อ API แล้วใน SSK-23 (ข้อมูลอยู่หลังรีเฟรช) ยังไม่ได้เขียนเคส live |
| Reminders ในหน้า Maintenance | ต่อ API แล้วใน SSK-20 (ข้อมูลอยู่หลังรีเฟรช) ยังไม่ได้เขียนเคส live |
| ส่งบิลเป็นกลุ่มและตั้งเวลาออกบิลอัตโนมัติ (SSK-130) | ยังไม่ได้ต่อ backend จึงยังเขียนเคส live ไม่ได้ |
| Recurring maintenance | ต่อ API แล้วใน SSK-20 (สร้างรอบแจ้งเตือนหลังสร้างใบ) ยังไม่ได้เขียนเคส live |
| การพิมพ์ PDF | ตรวจด้วยมือ เพราะเป็นหน้าต่างพิมพ์ของเบราว์เซอร์ที่ Playwright ควบคุมได้จำกัด |
| ความเข้ากันได้ของเบราว์เซอร์ | รันบน Chrome อย่างเดียวตามที่ตั้งไว้ใน `playwright.config.ts` |

**วิธีรายงานผล** ระบุเสมอว่าเป็นโปรเจกต์ไหน เพราะเลขรวมอย่างเดียวทำให้เข้าใจผิดว่าเทสแตะระบบจริงทั้งหมด

```
mock-api + stubbed-api   16 เคส   ไม่แตะ backend   รันอัตโนมัติใน CI ทุก PR
live-api                 10 เคส   แตะ backend + PostgreSQL จริง   รันด้วยมือ
```

เมื่อเทสพัง เก็บ trace จาก `frontend/test-results/` แล้วเปิดด้วย
```bash
npx playwright show-trace <path ของ trace.zip>
```
