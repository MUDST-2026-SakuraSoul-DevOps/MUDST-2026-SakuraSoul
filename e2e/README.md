# E2E tests

ชุดทดสอบ end-to-end ของทั้งระบบ เปิดเบราว์เซอร์จริงแล้วกดตามที่แอดมินใช้งาน
เขียนด้วย **Cypress** ตามที่อาจารย์กำหนด (SSK-158)

โฟลเดอร์นี้เป็นโมดูลของตัวเองระดับเดียวกับ `backend/` กับ `frontend/` มี `package.json`
กับ `node_modules` ของตัวเอง ที่แยกออกมาเพราะ E2E ไม่ได้ทดสอบหน้าเว็บอย่างเดียว
แต่ทดสอบทั้งเส้นทางตั้งแต่เบราว์เซอร์ไปถึงฐานข้อมูล ถ้าฝังไว้ใน `frontend/`
มันจะดูเหมือนเทสของ frontend และ dependency ของ Cypress จะไปปนกับ dependency ของตัวเว็บ

```
e2e/
├── package.json             Cypress อยู่ที่นี่ ไม่ได้อยู่ใน frontend
├── cypress.config.ts        นิยามสามชุด (เลือกด้วย E2E_PROJECT) จอ 1280x720 และรายงาน HTML
├── tsconfig.json
└── cypress/
    ├── support/
    │   ├── e2e.ts           โหลดก่อนทุกไฟล์เทส (Testing Library, รายงาน, คำสั่งล็อกอิน)
    │   ├── commands.ts      cy.signIn() กับ cy.signInLive()
    │   └── helpers.ts       ตัวช่วยร่วม เช่น api() เรียก backend, onCleanup() เก็บกวาดชุด live
    └── e2e/
        ├── *.cy.ts          ชุด mock-api
        ├── *.stubbed.cy.ts  ชุด stubbed-api
        └── live/            ชุด live-api (ยิงถึง backend จริง)
```

หาปุ่มและช่องกรอกด้วย Testing Library (`cy.findByRole`, `cy.findByLabelText`) ชุดเดียวกับที่
unit test ของ frontend ใช้ คือหาจากชื่อที่ผู้ใช้เห็นหรือที่โปรแกรมอ่านหน้าจออ่าน ไม่ผูกกับ class ของ CSS
ชื่อแบบข้อความต้องตรงทั้งคำ ถ้าชื่อจริงยาวกว่านั้นให้ใช้ regex

## สามชุด

แยกกันที่ว่า "ปลายทางของคำขอ `/api` คืออะไร"

| ชุด | พอร์ต | ปลายทาง `/api` | ไฟล์ | อยู่ใน CI |
|---|---|---|---|---|
| `mock-api` | 4173 | backend จำลองในเบราว์เซอร์ (`frontend/src/api/mockApi.ts`) | `cypress/e2e/*.cy.ts` | ✅ job `e2e` |
| `stubbed-api` | 4174 | ปลอมคำตอบด้วย `cy.intercept` | `cypress/e2e/*.stubbed.cy.ts` | ✅ job `e2e` |
| `live-api` | 4175 | **Spring + PostgreSQL จริง** | `cypress/e2e/live/*.live.cy.ts` | ✅ job `e2e-live` (ยก stack ด้วย docker compose) |

ทั้งสามชุดใช้ dev server ของ Vite ที่อยู่ใน `frontend/` script ใน `package.json` ยก dev server
ให้เองด้วย `start-server-and-test` แล้วค่อยสั่ง Cypress พอเทสจบก็ปิดให้ ดังนั้นต้อง `npm ci`
ทั้งสองโฟลเดอร์ก่อนรันครั้งแรก (ครั้งแรกของ `e2e/` จะโหลดตัวโปรแกรม Cypress ด้วย ใช้เวลาสักครู่)

```powershell
cd e2e      ; npm ci
cd ..\frontend ; npm ci
```

ถ้าเทสพังกลางทางแล้ว dev server ยังค้างอยู่ รอบถัดไปจะสตาร์ตไม่ขึ้นเพราะพอร์ตไม่ว่าง (`--strictPort`)
ให้ปิด process ที่ถือพอร์ตนั้นก่อน

```powershell
Get-NetTCPConnection -LocalPort 4173 -State Listen | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
```

## รันชุดที่ไม่ต้องใช้ backend (SSK-26)

```powershell
cd e2e
$env:E2E_ADMIN_PASSWORD='อะไรก็ได้ที่ไม่ว่าง'
npm test
```

`npm test` = typecheck แล้วรันชุด `mock-api` ตามด้วย `stubbed-api` จะรันทีละชุดก็ได้ด้วย
`npm run test:mock` หรือ `npm run test:stubbed`

ชุดนี้ก็ต้องตั้ง `E2E_ADMIN_PASSWORD` เหมือนกัน แม้ backend จำลองจะรับรหัสอะไรก็ผ่าน
เพราะคำสั่งล็อกอินอ่านค่าจาก environment ไม่ได้ฝังรหัสไว้ในโค้ด ถ้าไม่ตั้ง `cypress.config.ts`
จะหยุดตั้งแต่ก่อนเปิดเบราว์เซอร์พร้อมข้อความ `E2E_ADMIN_PASSWORD is not set`
(ใน CI มีขั้นตอนสุ่มรหัสให้อัตโนมัติอยู่แล้ว จึงไม่ต้องตั้งอะไรเพิ่ม)

## รันชุด live (SSK-123)

ใน CI ไม่ต้องทำอะไรเอง job `e2e-live` ของ `build-lint-test.yml` (SSK-138) ยก `db`, `mailpit`
และ `backend` ด้วย docker compose บนฐานข้อมูลใหม่ทุกรอบ สุ่มรหัสแอดมินให้ทั้ง backend และเทส
แล้วสั่ง `npm run test:live` รายงานอยู่ใน artifact `e2e-live-report`
ขั้นตอนข้างล่างคือวิธีรันบนเครื่องตัวเอง

ต้องเปิดฐานข้อมูล กล่องอีเมล และ backend ก่อน จากรากโปรเจกต์ วิธีที่ง่ายที่สุดคือยกแบบเดียวกับ CI

```bash
docker compose up -d --build --wait db mailpit backend
```

`mailpit` จำเป็นสำหรับ `E2E-LIVE-PAYMENT-001` (SSK-143) ซึ่งกดส่งใบแจ้งหนี้แล้วไปค้นอีเมลในกล่องของ Mailpit
ที่ http://localhost:8025 ถ้าไม่เปิด เคสนี้จะพังที่ขั้นส่งด้วยข้อความว่าเมลเซิร์ฟเวอร์ติดต่อไม่ได้

ถ้าอยากรัน backend จากโค้ดตรง ๆ แทน container ให้เปิดแค่ `docker compose up -d db mailpit` แล้ว

```powershell
cd backend
$env:SPRING_PROFILES_ACTIVE='dev'
$env:SPRING_DATASOURCE_PASSWORD='<ค่าเดียวกับ POSTGRES_PASSWORD ใน .env>'
$env:APP_ADMIN_PASSWORD='<รหัสแอดมิน>'
.\gradlew.bat bootRun
```

(`bootRun` ส่งอีเมลเข้า `localhost:1025` ตามค่าตั้งต้นอยู่แล้ว) รอจนขึ้น `Started ApartmentApplication` แล้วอีกหน้าต่างหนึ่ง

```powershell
cd e2e
$env:E2E_ADMIN_PASSWORD='<รหัสแอดมินตัวเดียวกับ APP_ADMIN_PASSWORD>'
npm run test:live
```

รหัสผ่านไม่ได้เขียนไว้ในโค้ด ถ้าไม่ตั้ง `E2E_ADMIN_PASSWORD` เทสจะหยุดพร้อมบอกวิธีตั้ง
และถ้าตั้ง**ไม่ตรง**กับ `APP_ADMIN_PASSWORD` ที่ backend ใช้ตอนสตาร์ต ทุกเคสจะพังที่ขั้นล็อกอิน
พร้อมข้อความบอกรหัสสถานะที่ backend ตอบกลับมา

## ดูเบราว์เซอร์กดจริงและดูรายงาน

อยากเห็นเบราว์เซอร์กดทีละขั้น (ใช้ตอนสาธิตหรือตอนไล่หาสาเหตุ) เปิดหน้าจอของ Cypress ด้วย

```powershell
npm run open:mock      # หรือ open:stubbed / open:live
```

dev server ของชุดนั้นจะขึ้นมาให้เอง แล้วเลือกไฟล์เทสที่อยากดูจากหน้าจอได้เลย

ทุกครั้งที่รันด้วย `npm test` หรือ `npm run test:live` จะได้รายงาน HTML ของแต่ละชุดที่
`cypress/reports/<ชุด>/index.html` เปิดด้วยเบราว์เซอร์ได้ทันที เคสที่พังมีรูปหน้าจอฝังอยู่ในรายงาน
(รูปไฟล์แยกอยู่ที่ `cypress/screenshots/`) ใน CI รายงานเดียวกันนี้อยู่ใน artifact `e2e-report` กับ `e2e-live-report`

## ทำไมต้องมีชุด live

`mockApi.ts` ไม่ตรวจรูปแบบข้อมูลและรองรับทุก HTTP method เทสที่วิ่งกับ mock จึงเขียวได้
ทั้งที่ของจริงพัง ชุด live จับเคสพวกนี้ เช่น backend ปฏิเสธรูปแบบเลขบัตร หรือ endpoint ที่ยังไม่มีจริง
บั๊กที่เจอมาแล้วด้วยวิธีนี้คือ SSK-113 (เลขบัตรมีช่องว่างแล้ว backend ตอบ 400)
SSK-108 (ยังไม่มี `PUT`/`DELETE /api/tenants/{id}` จึงได้ 405) และ SSK-139
(ป็อปอัปแจ้งซ่อมกดบันทึกแล้วไม่ยิง API) ทั้งสามตัวแก้ครบแล้ว และเทสถูกเขียนใหม่เป็นตัวกัน regression

## ข้อควรระวัง

- ชุด live เขียนข้อมูลลงฐานข้อมูลจริง จึงใช้ชื่อและเลขบัตรที่สุ่มใหม่ทุกครั้ง ของที่เทสสร้างจะถูกเก็บกวาด
  ใน `afterEach` ผ่าน API (จดไว้ด้วย `onCleanup()` ใน `helpers.ts`) ซึ่งทำงานทั้งตอนเทสผ่านและตอนพัง
  รวมถึงตั้งค่า Apartment Config กลับเป็นค่าเดิมและปล่อยห้องที่ปิดซ่อมไว้
- ชุด live อยู่ใน CI แล้ว (job `e2e-live`) ถ้าเพิ่มเคสที่ต้องใช้ service อื่นนอกจาก `db`, `mailpit`
  และ `backend` ต้องเพิ่ม service นั้นใน job ด้วย ไม่งั้นจะเขียวบนเครื่องแต่แดงใน CI
- ใน CI ฐานข้อมูลเกิดใหม่ทุกรอบจาก `DevDataSeeder` อย่างเดียว เคสที่พึ่งข้อมูลที่เคยเทสไว้บนเครื่องจะพังใน CI
- ชุด mock-api ห้าม `cy.visit` หรือ `cy.reload` กลางเทส เพราะ backend จำลองเก็บข้อมูลไว้ในหน้า
  โหลดหน้าใหม่เมื่อไหร่ข้อมูลที่เทสเพิ่งสร้างจะหายไปด้วย ให้เดินด้วยเมนูด้านข้างแทน
- ใช้ `127.0.0.1` แทน `localhost` ในเทสและ config เพราะบน Windows `localhost` อาจชี้ไป IPv6 (`::1`)
  ก่อน ส่วน Mailpit ใน `docker-compose.yml` ผูกพอร์ตไว้กับ `127.0.0.1` อย่างเดียว
- ห้ามใส่ `.only` ทิ้งไว้ใน commit เพราะ Cypress จะรันแค่เคสนั้นแล้วรายงานว่าเขียวทั้งชุด
