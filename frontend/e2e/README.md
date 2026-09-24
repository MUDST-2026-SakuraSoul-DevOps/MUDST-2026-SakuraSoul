# E2E tests

มีสามโปรเจกต์ใน `playwright.config.ts` แยกกันที่ว่า "ปลายทางของคำขอ /api คืออะไร"

| โปรเจกต์ | พอร์ต | ปลายทาง /api | ไฟล์ | อยู่ใน CI |
|---|---|---|---|---|
| `mock-api` | 4173 | backend จำลองในเบราว์เซอร์ (`src/api/mockApi.ts`) | `*.spec.ts` | ✅ |
| `stubbed-api` | 4174 | Playwright ปลอมคำตอบด้วย `page.route` | `*.stubbed.spec.ts` | ✅ |
| `live-api` | 4175 | **Spring + PostgreSQL จริง** | `live/*.live.spec.ts` | ❌ ต้องสั่งเอง |

## รันชุดที่ไม่ต้องใช้ backend (SSK-26)

```bash
cd frontend
npm run test:e2e
```

## รันชุด live (SSK-123)

ต้องเปิดฐานข้อมูลกับ backend ก่อน จากรากโปรเจกต์

```bash
docker compose up -d db
```

```powershell
cd backend
$env:SPRING_PROFILES_ACTIVE='dev'
$env:SPRING_DATASOURCE_PASSWORD='<ค่าเดียวกับ POSTGRES_PASSWORD ใน .env>'
$env:APP_ADMIN_PASSWORD='<รหัสแอดมิน>'
.\gradlew.bat bootRun
```

รอจนขึ้น `Started ApartmentApplication` แล้วอีกหน้าต่างหนึ่ง

```powershell
cd frontend
$env:E2E_ADMIN_PASSWORD='<รหัสแอดมินตัวเดียวกัน>'
npm run test:e2e:live
```

รหัสผ่านไม่ได้เขียนไว้ในโค้ด ถ้าไม่ตั้ง `E2E_ADMIN_PASSWORD` เทสจะหยุดพร้อมบอกวิธีตั้ง

## ทำไมต้องมีชุด live

`mockApi.ts` ไม่ตรวจรูปแบบข้อมูลและรองรับทุก HTTP method เทสที่วิ่งกับ mock จึงเขียวได้
ทั้งที่ของจริงพัง ชุด live จับเคสพวกนี้ เช่น backend ปฏิเสธรูปแบบเลขบัตร หรือ endpoint ที่ยังไม่มีจริง

## เทสที่ตั้งใจให้แดง

เทสที่เขียน `test.fail()` ไว้บรรทัดแรก = บั๊กที่รู้แล้วและยังไม่ได้แก้ ตอนนี้จึงนับว่าผ่าน
**พอบั๊กถูกแก้ เทสจะรายงานว่า "ผ่านทั้งที่สั่งให้แดง" ซึ่งถือว่าพัง** ให้มาลบ `test.fail()` บรรทัดนั้นออก

| เทส | บั๊ก |
|---|---|
| `E2E-LIVE-TENANT-001` | SSK-113 — หน้าเว็บส่งเลขบัตรพร้อมช่องว่าง backend ตอบ 400 |
| `E2E-LIVE-TENANT-002` | backend ยังไม่มี `PUT /api/tenants/{id}` จึงได้ 405 |

## ข้อควรระวัง

- ชุด live เขียนข้อมูลลงฐานข้อมูลจริง จึงใช้ชื่อและเลขบัตรที่สุ่มใหม่ทุกครั้ง และตั้งค่า
  Apartment Config กลับเป็นค่าเดิมเมื่อจบเทส
- อย่าให้ชุด live เข้าไปอยู่ใน CI จนกว่าจะมีขั้นตอนเปิด PostgreSQL กับ backend ใน workflow
