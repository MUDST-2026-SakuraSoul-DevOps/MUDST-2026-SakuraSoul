# E2E tests

ชุดทดสอบ end-to-end ของทั้งระบบ เปิดเบราว์เซอร์จริงแล้วกดตามที่แอดมินใช้งาน

โฟลเดอร์นี้เป็นโมดูลของตัวเองระดับเดียวกับ `backend/` กับ `frontend/` มี `package.json`
กับ `node_modules` ของตัวเอง ที่แยกออกมาเพราะ E2E ไม่ได้ทดสอบหน้าเว็บอย่างเดียว
แต่ทดสอบทั้งเส้นทางตั้งแต่เบราว์เซอร์ไปถึงฐานข้อมูล ถ้าฝังไว้ใน `frontend/`
มันจะดูเหมือนเทสของ frontend และ dependency ของ Playwright จะไปปนกับ dependency ของตัวเว็บ

```
e2e/
├── package.json           Playwright อยู่ที่นี่ ไม่ได้อยู่ใน frontend แล้ว
├── playwright.config.ts   นิยามสามโปรเจกต์กับ dev server ของแต่ละตัว
├── tsconfig.json
└── tests/
    ├── signIn.ts          ตัวช่วยล็อกอินของชุด mock/stubbed
    ├── *.spec.ts          ชุด mock-api
    ├── *.stubbed.spec.ts  ชุด stubbed-api
    └── live/              ชุด live-api (ยิงถึง backend จริง)
```

## สามโปรเจกต์

แยกกันที่ว่า "ปลายทางของคำขอ `/api` คืออะไร"

| โปรเจกต์ | พอร์ต | ปลายทาง `/api` | ไฟล์ | อยู่ใน CI |
|---|---|---|---|---|
| `mock-api` | 4173 | backend จำลองในเบราว์เซอร์ (`frontend/src/api/mockApi.ts`) | `tests/*.spec.ts` | ✅ |
| `stubbed-api` | 4174 | Playwright ปลอมคำตอบด้วย `page.route` | `tests/*.stubbed.spec.ts` | ✅ |
| `live-api` | 4175 | **Spring + PostgreSQL จริง** | `tests/live/*.live.spec.ts` | ✅ job `e2e-live` (ยก stack ด้วย docker compose) |

ทั้งสามโปรเจกต์ใช้ dev server ของ Vite ที่อยู่ใน `frontend/` ดังนั้นต้อง `npm ci`
ทั้งสองโฟลเดอร์ก่อนรันครั้งแรก

```powershell
cd e2e      ; npm ci
cd ..\frontend ; npm ci
```

## รันชุดที่ไม่ต้องใช้ backend (SSK-26)

```powershell
cd e2e
$env:E2E_ADMIN_PASSWORD='อะไรก็ได้ที่ไม่ว่าง'
npm test
```

ชุดนี้ก็ต้องตั้ง `E2E_ADMIN_PASSWORD` เหมือนกัน แม้ backend จำลองจะรับรหัสอะไรก็ผ่าน
เพราะ `tests/signIn.ts` อ่านค่าจาก environment ไม่ได้ฝังรหัสไว้ในโค้ด
ถ้าไม่ตั้งจะพังทุกเคสที่ต้องล็อกอิน พร้อมข้อความ `E2E_ADMIN_PASSWORD is not set`
(ใน CI มีขั้นตอนสุ่มรหัสให้อัตโนมัติอยู่แล้ว จึงไม่ต้องตั้งอะไรเพิ่ม)

## รันชุด live (SSK-123)

ใน CI ไม่ต้องทำอะไรเอง job `e2e-live` ของ `build-lint-test.yml` (SSK-138) ยก `db`, `mailpit`
และ `backend` ด้วย docker compose บนฐานข้อมูลใหม่ทุกรอบ สุ่มรหัสแอดมินให้ทั้ง backend และเทส
แล้วสั่ง `npm run test:live` รายงานอยู่ใน artifact `e2e-live-report`
ขั้นตอนข้างล่างคือวิธีรันบนเครื่องตัวเอง

ต้องเปิดฐานข้อมูล กล่องอีเมล และ backend ก่อน จากรากโปรเจกต์

```bash
docker compose up -d db mailpit
```

`mailpit` จำเป็นสำหรับ `E2E-LIVE-PAYMENT-001` (SSK-143) ซึ่งกดส่งใบแจ้งหนี้แล้วไปค้นอีเมลในกล่องของ Mailpit
ที่ http://localhost:8025 ถ้าไม่เปิด เคสนี้จะพังที่ขั้นส่งด้วยข้อความว่าเมลเซิร์ฟเวอร์ติดต่อไม่ได้
ส่วน `bootRun` ส่งอีเมลเข้า `localhost:1025` ตามค่าตั้งต้นอยู่แล้ว ไม่ต้องตั้งอะไรเพิ่ม
(ถ้ารันทั้ง stack ด้วย `docker compose up -d` ก็ใช้ได้เหมือนกัน)

```powershell
cd backend
$env:SPRING_PROFILES_ACTIVE='dev'
$env:SPRING_DATASOURCE_PASSWORD='<ค่าเดียวกับ POSTGRES_PASSWORD ใน .env>'
$env:APP_ADMIN_PASSWORD='<รหัสแอดมิน>'
.\gradlew.bat bootRun
```

รอจนขึ้น `Started ApartmentApplication` แล้วอีกหน้าต่างหนึ่ง

```powershell
cd e2e
$env:E2E_ADMIN_PASSWORD='<รหัสแอดมินตัวเดียวกัน>'
npm run test:live
```

รหัสผ่านไม่ได้เขียนไว้ในโค้ด ถ้าไม่ตั้ง `E2E_ADMIN_PASSWORD` เทสจะหยุดพร้อมบอกวิธีตั้ง
และถ้าตั้ง**ไม่ตรง**กับ `APP_ADMIN_PASSWORD` ที่ backend ใช้ตอนสตาร์ต ทุกเคสจะพังที่ขั้นล็อกอิน
พร้อมข้อความบอกรหัสสถานะที่ backend ตอบกลับมา

อยากเห็นเบราว์เซอร์กดจริง ๆ (ใช้ตอนสาธิต) เติม `--headed`

```powershell
npm run test:live -- --headed
```

**ถ้าเรียก Playwright ตรง ๆ ไม่ผ่าน npm script** ต้องตั้ง `E2E_LIVE=1` ด้วย
ไม่งั้น dev server พอร์ต 4175 จะไม่ขึ้นและเทสจะหาเว็บไม่เจอ

```powershell
$env:E2E_LIVE='1'
npx playwright test --project=live-api
```

เหตุผลคือ Playwright เปิด `webServer` ทุกตัวในรายการเสมอ ต่อให้สั่งรันโปรเจกต์เดียว
config จึงใส่เซิร์ฟเวอร์ของชุด live เฉพาะตอนสั่งชุด live เพื่อไม่ให้ job `e2e` ใน CI เสียเวลายกเซิร์ฟเวอร์ที่ไม่ได้ใช้

## ทำไมต้องมีชุด live

`mockApi.ts` ไม่ตรวจรูปแบบข้อมูลและรองรับทุก HTTP method เทสที่วิ่งกับ mock จึงเขียวได้
ทั้งที่ของจริงพัง ชุด live จับเคสพวกนี้ เช่น backend ปฏิเสธรูปแบบเลขบัตร หรือ endpoint ที่ยังไม่มีจริง
บั๊กที่เจอมาแล้วด้วยวิธีนี้คือ SSK-113 (เลขบัตรมีช่องว่างแล้ว backend ตอบ 400)
SSK-108 (ยังไม่มี `PUT`/`DELETE /api/tenants/{id}` จึงได้ 405) และ SSK-139
(ป็อปอัปแจ้งซ่อมกดบันทึกแล้วไม่ยิง API)

## เทสที่ตั้งใจให้แดง

เทสที่เขียน `test.fail()` ไว้บรรทัดแรก = บั๊กที่รู้แล้วและยังไม่ได้แก้ ตอนนี้จึงนับว่าผ่าน
**พอบั๊กถูกแก้ เทสจะรายงานว่า "ผ่านทั้งที่สั่งให้แดง" ซึ่งถือว่าพัง** ให้มาลบ `test.fail()` บรรทัดนั้นออก

ตอนนี้ไม่มีเทสที่ติด `test.fail()` เหลืออยู่แล้ว บั๊กทั้งสามตัวข้างบนถูกแก้ครบ
และเทสถูกเขียนใหม่เป็นตัวกัน regression แทน

## ข้อควรระวัง

- ชุด live เขียนข้อมูลลงฐานข้อมูลจริง จึงใช้ชื่อและเลขบัตรที่สุ่มใหม่ทุกครั้ง และตั้งค่า
  Apartment Config กลับเป็นค่าเดิมเมื่อจบเทส
- ชุด live อยู่ใน CI แล้ว (job `e2e-live`) ถ้าเพิ่มเคสที่ต้องใช้ service อื่นนอกจาก `db`, `mailpit`
  และ `backend` ต้องเพิ่ม service นั้นใน job ด้วย ไม่งั้นจะเขียวบนเครื่องแต่แดงใน CI
- ใน CI ฐานข้อมูลเกิดใหม่ทุกรอบจาก `DevDataSeeder` อย่างเดียว เคสที่พึ่งข้อมูลที่เคยเทสไว้บนเครื่องจะพังใน CI
