# Sakura Soul

ระบบจัดการหอพักสำหรับแอดมิน ทำเป็น semester project วิชา MUDST ปีการศึกษา 2026

## Links
- Figma
  https://www.figma.com/design/swAK0L3qmTuuxT0n956GjO/Sakura-Soul-Apartment?node-id=0-1&t=7nNdcrRfNpttSC1m-1
- User Story
  https://docs.google.com/spreadsheets/d/1xEgNkx-E_S8Y4hZU7nrSxsn_BtXuAZ-ybydJlQzR2JU/edit?usp=sharing
- ข้อตกลง API ของสัญญาเช่า
  [docs/api-contract-lease.md](docs/api-contract-lease.md)
- ข้อตกลง API ของงานซ่อมบำรุง
  [docs/api-contract-maintenance.md](docs/api-contract-maintenance.md)
- ข้อตกลง API ของใบเสร็จและเอกสาร PDF
  [docs/api-contract-billing.md](docs/api-contract-billing.md)
- แผนงานฝั่ง frontend
  [docs/frontend-workplan.md](docs/frontend-workplan.md)
  
## About

เป็นเครื่องมือฝั่งแอดมินหอพัก ไม่ใช่แอปสำหรับผู้เช่า คนที่ใช้งานคือคนดูแลหอที่ต้องรู้ว่าห้องไหนว่าง ห้องไหนมีคนอยู่ สัญญาใครหมดเมื่อไหร่ เดือนนี้ออกใบเสร็จให้ใครไปแล้วบ้าง และมีงานซ่อมค้างอยู่ห้องไหน

โจทย์ของวิชากำหนดไว้ว่าทั้งระบบต้องรันได้เองในเครื่อง ห้ามพึ่ง external API หรือ cloud service ของใคร ทุกอย่างตั้งแต่ auth ยัน database ต้องอยู่ใน stack ของเราเอง อีกข้อที่มีผลกับการออกแบบมากคือ requirement จะเปลี่ยนระหว่างเทอม เพราะฉะนั้นเราตั้งใจไม่ over-engineer ตั้งแต่แรก แต่จะลงแรงกับ test ให้พอที่ตอน refactor แล้วรู้ทันทีว่าพังตรงไหน

## Requirements

- จัดการข้อมูลผู้เช่าและสัญญาเช่า ผูกผู้เช่ากับห้อง บันทึกวันเข้า วันออก ค่าเช่า และรอบบิล (รายเดือน / รายปี)
- กันไม่ให้ห้องเดียวถูกผูกกับผู้เช่าซ้อนกันในช่วงเวลาเดียวกัน
- dashboard สถานะห้องทั้ง 24 ห้อง (ชั้นละ 12 ห้อง 2 ชั้น) ดูจบในหน้าเดียว ไม่ต้องกดเข้าไปทีละห้อง
- ออกใบเสร็จค่าเช่า ค่าน้ำ ค่าไฟ สั่งพิมพ์หรือดาวน์โหลดเป็น PDF ได้
- ออกสัญญาเช่าเป็น PDF
- บันทึกงานซ่อมบำรุงและของที่ใช้ไป เช่น เปลี่ยนหลอดไฟ ล้างแอร์ งานประปา
- log งานซ่อมแยกรายห้อง ย้อนดูได้ว่าห้องนี้เคยซ่อมอะไรมาบ้าง
- แจ้งเตือนงานซ่อมบำรุงที่ต้องทำซ้ำตามรอบ

## Tech stack

| ส่วน | ที่ใช้ |
| --- | --- |
| Frontend | React 19 + TypeScript, build ด้วย Vite, React Router |
| Styling | Tailwind CSS 4 |
| Backend | Java Spring Boot 4.1 บน Java 21 |
| Database | PostgreSQL 17 |
| Migration | Flyway |
| Build | Gradle Wrapper (Gradle 9.5) |
| Container | Docker |
| Infra | Minikube / Kubernetes |
| CI/CD | GitHub Actions |
| Design | Figma |
| ออกเอกสาร PDF | openhtmltopdf + Thymeleaf + ฟอนต์ Sarabun (OFL) |
| Unit / Integration test | JUnit 5 + Mockito + Testcontainers (backend), Vitest + React Testing Library (frontend) |
| E2E | Playwright |

## โครงสร้าง repo

```
MUDST-2026-SakuraSoul/
├── backend/                 Spring Boot, build ด้วย Gradle Wrapper
│   └── src/main/resources/
│       └── db/migration/    Flyway migration
├── frontend/                React + TypeScript + Tailwind
│   └── src/
│       ├── api/             fetch wrapper, type ของ API, backend จำลอง
│       ├── domain/          กฎธุรกิจล้วน ๆ เช่น สัญญาเช่าทับช่วงเวลากัน
│       ├── components/      ของที่ใช้ซ้ำหลายหน้า
│       ├── dialogs/         ป็อปอัป (เช็คอิน แก้สัญญา เช็คเอาต์ งานซ่อม)
│       └── pages/           หน้าจอแต่ละหน้า ผูกกับเมนูใน sidebar
├── docs/                    ข้อตกลง API และแผนงาน
├── k8s/                     manifest สำหรับ deploy ขึ้น Minikube
├── .github/workflows/       GitHub Actions
├── docker-compose.yml
└── README.md
```

## How to Start?

ต้องมี

- JDK 21
- Node.js 22
- Docker Desktop
- minikube กับ kubectl (เฉพาะตอนจะ deploy)

ไม่ต้องลง Gradle เอง repo มี wrapper มาให้แล้ว บน macOS กับ Linux ใช้ `./gradlew` บน Windows ใช้ `gradlew.bat`

ถ้ารัน `gradlew` แล้วขึ้นว่าหา Java ไม่เจอ ให้เช็ค `JAVA_HOME` ก่อนเป็นอย่างแรก บน Windows ที่เคยลง JDK ทับกันหลายรอบ
มักเจอว่า PATH ยังชี้ไปโฟลเดอร์เวอร์ชันเก่าที่ถูกลบไปแล้ว ตั้ง `JAVA_HOME` ให้ตรงกับโฟลเดอร์ JDK ที่มีอยู่จริง
แล้วเปิด terminal ใหม่

ครั้งแรกต้องตั้งรหัสผ่านก่อน ไม่มีรหัสอยู่ใน repo แล้วเพราะห้าม commit ของจริงขึ้นมา

```bash
cp .env.example .env
```

แล้วเปิด `.env` ใส่ค่าให้ `POSTGRES_PASSWORD` กับ `APP_ADMIN_PASSWORD`
สองตัวนี้ตั้งเป็นอะไรก็ได้ตอน dev แต่ต้องตั้ง ถ้าเว้นว่าง `docker compose` จะหยุด
พร้อมบอกว่าขาดตัวแปรไหน ไฟล์ `.env` ถูก gitignore ไว้ จะไม่หลุดขึ้น repo

`APP_ADMIN_PASSWORD` คือรหัสของแอดมินคนแรก ใช้ล็อกอินที่หน้าเว็บ
ระบบสร้างให้ครั้งเดียวตอนตาราง `admin_user` ยังว่าง ถ้าเคยสตาร์ตไปแล้วแล้วอยากเปลี่ยน
ต้องลบ volume ก่อนด้วย `docker compose down -v`

> **คนที่เคยรันโปรเจกต์นี้มาก่อนต้องลบ volume หนึ่งครั้ง** postgres จำรหัสจากตอน
> สร้างฐานครั้งแรกไว้ ถ้า volume `db-data` เกิดตั้งแต่ตอนที่รหัสยังอยู่ใน repo
> พอตั้งรหัสใหม่แล้ว backend จะต่อ database ไม่ติด แล้ว frontend จะไม่ขึ้นตามไปด้วย
> เพราะรอ healthcheck ของ backend
>
> ```bash
> docker compose down -v && docker compose up -d
> ```
>
> ฝั่ง minikube ก็เหมือนกัน ต้องลบ PVC ก่อน
> `kubectl delete pvc postgres-data -n sakura-soul` (หรือลบทั้ง namespace ไปเลย)

จากนั้นรันทั้ง stack ทีเดียว

```bash
docker compose up -d
```

หรือถ้ากำลังแก้โค้ดอยู่ แยกรันจะสะดวกกว่าเพราะ hot reload ทำงาน

```bash
# terminal แรก ยก postgres ขึ้นมาก่อน
docker compose up -d db

# terminal ที่สอง
cd backend
./gradlew bootRun

# terminal ที่สาม
cd frontend
npm install
npm run dev
```

ทางนี้ `bootRun` ไม่ได้เปิดโปรไฟล์ `dev` จึงไม่มีทั้งข้อมูลตัวอย่างและแอดมินคนแรก
ถ้าอยากล็อกอินได้ ต้องส่งรหัสกับโปรไฟล์เข้าไปเอง

ต้องส่ง `SPRING_DATASOURCE_PASSWORD` ให้ตรงกับ `POSTGRES_PASSWORD` ใน `.env` ด้วย
เพราะ `bootRun` ไม่ได้อ่าน `.env` เหมือน docker compose และ `application.yml` ไม่มีค่า default ให้แล้ว

```bash
# macOS / Linux โหลดค่าจาก .env มาใช้เลย
set -a; . ./.env; set +a
SPRING_DATASOURCE_PASSWORD="$POSTGRES_PASSWORD" SPRING_PROFILES_ACTIVE=dev ./gradlew bootRun

# Windows PowerShell
$env:SPRING_DATASOURCE_PASSWORD = "รหัส database ที่ตั้งไว้"
$env:APP_ADMIN_PASSWORD = "รหัสแอดมินที่ตั้งไว้"
$env:SPRING_PROFILES_ACTIVE = "dev"
.\gradlew.bat bootRun
```

ถ้าไม่ส่ง `SPRING_DATASOURCE_PASSWORD` แอปจะต่อ database ไม่ติดตั้งแต่ตอนสตาร์ต
ถ้าไม่ส่ง `APP_ADMIN_PASSWORD` แอปยังขึ้นได้ตามปกติ แต่ log จะเตือนแล้วไม่มีใครล็อกอินได้

port ที่ใช้

| service | port |
| --- | --- |
| frontend | 5173 |
| backend | 8080 |
| postgres | 5432 |

### รันหน้าเว็บโดยไม่ต้องเปิด backend

หน้าจอที่ทำไปแล้ว (แดชบอร์ด ผู้เช่า สัญญาเช่า) เคยต้องรอตาราง `lease` ฝั่ง Spring
เพื่อไม่ให้งานฝั่งหน้าเว็บติดรอ เลยมี backend จำลองที่รันในเบราว์เซอร์อยู่ที่
`frontend/src/api/mockApi.ts` และเปิดไว้เป็นค่าตั้งต้นแล้วใน `frontend/.env.development`

```bash
cd frontend
npm install
npm run dev
```

แค่นี้ก็กดใช้งานได้ครบทุกหน้า ข้อมูลอยู่ใน memory กด refresh แล้วกลับไปตั้งต้น

ตอนนี้ endpoint สัญญาเช่ากับอัตราค่าสาธารณูปโภคขึ้นจริงแล้ว ให้แก้ `VITE_API_MOCK=0` ใน `frontend/.env.development`
(ส่วน `PUT /api/leases/{id}` กับ `terminate` ยังไม่มี จะขึ้น 404 จนกว่า SSK-12 จะเสร็จ)
โค้ดหน้าเว็บไม่ต้องแก้สักบรรทัด รูปร่างข้อมูลที่ทั้งสองฝั่งต้องตรงกันอยู่ใน
[docs/api-contract-lease.md](docs/api-contract-lease.md) และมีเทสบังคับไว้ที่
`frontend/src/api/client.test.ts`

## ฐานข้อมูล

ใช้ PostgreSQL 17 ค่า connection อ่านจาก environment variable ทั้งหมด
`application.yml` มี default ให้เฉพาะ url กับชื่อผู้ใช้ **ไม่มี default ให้รหัสผ่าน**
ตั้งใจให้ต่อไม่ติดไปเลยถ้าลืมส่งเข้ามา ดีกว่าขึ้นได้ด้วยรหัสที่ทุกคนที่ clone ไปรู้
ค่าจริงมาจาก `.env` ผ่าน `docker-compose.yml` หรือจาก Secret ใน `k8s/`

schema คุมด้วย Flyway ไฟล์อยู่ใน `backend/src/main/resources/db/migration/` และตั้ง `ddl-auto: validate`
ไม่ใช่ `update` เหตุผลคือ requirement ของวิชาจะเปลี่ยนหลายรอบระหว่างเทอม ถ้าปล่อยให้ Hibernate แก้ schema ให้เอง
พอถึงตอนที่ข้อมูลใน dev กับใน k8s ไม่ตรงกันจะไล่ไม่ถูกว่าใครแก้อะไรไป การเขียน migration ไฟล์ต่อไฟล์เสียเวลาตอนแรกอยู่บ้าง
แต่ตอนย้อนดูมันชัดกว่ามาก ส่วน `validate` ทำให้แอปไม่ยอมสตาร์ตเลยถ้า entity กับ migration เริ่มไม่ตรงกัน
ซึ่งดีกว่าไปเจอตอน runtime

ตอนนี้มีสิบเอ็ดตารางคือ `room`, `tenant`, `apartment_config` (V3), `lease` (V4), `admin_user` (V7)
ห้าตารางของงานซ่อมบำรุงที่มาพร้อมกันใน V8 คือ `maintenance_ticket`, `supply_item`,
`supply_restock`, `maintenance_supply_usage`, `maintenance_reminder` และ `receipt` (V9)
โดย `lease` เป็นตัวเชื่อมห้องกับผู้เช่า เก็บวันเริ่มวันจบ ค่าเช่า รอบบิล และอัตราค่าสาธารณูปโภคที่ล็อกไว้ตอนเซ็น
ส่วนกฎ "ห้ามปล่อยเช่าซ้อน" อยู่ที่ exclusion constraint `lease_no_overlap` ใน V4 ไม่ได้อยู่ในโค้ดฝั่งแอป

ห้าตารางของ V8 อยู่ไฟล์เดียวกันเพราะอ้างถึงกันเอง (ใบแจ้งซ่อมตัดสต็อกอุปกรณ์ และการแจ้งเตือนตามรอบ
สร้างใบแจ้งซ่อม) กฎสองข้อที่อยู่ที่ database ไม่ได้อยู่ในโค้ดคือ `supply_item_stock_ck` ที่กันสต็อกติดลบ
และ `supply_item_sku_uk` ที่กันรหัส SKU ซ้ำ ส่วนสถานะ `LOW_STOCK` ไม่ได้เก็บเป็นคอลัมน์ แต่คำนวณ
จาก `stock < min_stock` ตอนตอบ ด้วยเหตุผลเดียวกับที่สถานะห้องไม่ได้เก็บไว้ในตาราง
V13 (SSK-23) เพิ่มเพดาน `max_stock` ให้ `supply_item` พร้อม CHECK ว่าเพดานไม่ต่ำกว่าขั้นต่ำและยอดคงเหลือไม่เกินเพดาน
รายละเอียดทั้งหมดอยู่ใน [docs/api-contract-maintenance.md](docs/api-contract-maintenance.md)

ตาราง `receipt` (V9) เก็บใบเสร็จรายเดือน และ **คัดลอกอัตราทั้งชุดมาเก็บไว้ในตัวเองตอนออกใบ**
ตามข้อกำหนด US-16-S3 ทางเดินของอัตราคือ `apartment_config` → คัดลอกตอนเซ็นไปที่ `lease`
→ คัดลอกตอนออกใบไปที่ `receipt` แต่ละลูกศรคือการคัดลอกค่า ไม่ใช่การอ้างอิงกลับ
การขึ้นค่าไฟของตึกจึงไม่เปลี่ยนยอดของใบเสร็จที่ออกไปแล้วแม้แต่เยนเดียว
ส่วนกฎ "ห้ามออกใบเสร็จซ้ำเดือน" อยู่ที่ constraint `receipt_lease_month_uk`
รายละเอียดทั้งหมดอยู่ใน [docs/api-contract-billing.md](docs/api-contract-billing.md)

ตาราง `room` มีธง `under_maintenance` เพิ่มมาใน V5 สำหรับล็อกห้องเป็นซ่อมบำรุง (US-15) ที่เป็นธงแยก
ไม่ใช่คอลัมน์ `status` เพราะห้องที่มีผู้เช่าอยู่ก็ล็อกได้ พอปลดล็อกต้องกลับไปเป็น `OCCUPIED` เอง
สถานะห้องจึงยังคำนวณตอนตอบทุกครั้งที่ `RoomStatus.of` ที่เดียว ไม่ได้เก็บไว้ในตาราง

ส่วน V6 เพิ่มคอลัมน์ `line_id` กับ `email` ให้ตาราง `tenant` ตั้ง `phone`, `line_id`, `national_id` เป็น `NOT NULL`
และเพิ่ม constraint `tenant_national_id_uk` กันเลขบัตรประชาชนซ้ำ ตามชุดฟิลด์ของ US-03 ที่อาจารย์ตัดสินไว้
(ดูหัวข้อ US-03 ใน [docs/api-contract-lease.md](docs/api-contract-lease.md))

ของเดิมไม่มีกฎห้ามเลขบัตรซ้ำ V6 จึงเปลี่ยนแถวที่ซ้ำให้เป็น `DUP-<id>` ก่อนตั้ง constraint
ไม่งั้น database ของใครที่เคยกดเพิ่มคนเดิมสองรอบจะทำให้ Flyway ล้มแล้ว backend สตาร์ตไม่ขึ้น
(`docker-compose.yml` เก็บข้อมูลไว้ใน volume `db-data` ปิด container แล้วไม่ได้หายไป)
ถ้าเจอ V6 ล้มหรือไม่อยากตามเก็บแถวที่ขึ้นต้นด้วย `DUP-` กับ `UNKNOWN-` ข้อมูล dev ทิ้งได้หมด
ด้วย `docker compose down -v` แล้ว `DevDataSeeder` จะใส่ข้อมูลตัวอย่างให้ใหม่ตอนเปิดรอบถัดไป

## การเข้าสู่ระบบ

ทุก endpoint ต้องล็อกอินก่อนแล้ว ยกเว้น `POST /api/auth/login` กับ `/actuator/health/**`
กับ `/actuator/info` ที่เปิดไว้ให้ probe ของ k8s และ healthcheck ของ docker-compose ยิงได้

ใช้ **session cookie ไม่ใช่ JWT** เพราะหน้าเว็บกับ API อยู่ origin เดียวกันทั้งตอน dev
(vite proxy) และตอน deploy (nginx proxy) cookie `JSESSIONID` จึงเดินทางเองอยู่แล้ว
ฝั่งหน้าเว็บไม่ต้องเก็บหรือแนบ token เอง รายละเอียดทั้งหมดอยู่ใน
[docs/api-contract-lease.md](docs/api-contract-lease.md) หัวข้อ "การเข้าสู่ระบบ"

**ไม่มีรหัสผ่านอยู่ใน migration** ตาราง `admin_user` (V7) สร้างมาเปล่า ๆ แอดมินคนแรก
ถูกสร้างตอนแอปสตาร์ตจาก environment variable และสร้างให้เฉพาะตอนตารางยังว่างเท่านั้น
ไม่เขียนทับของเดิม ถ้าไม่ได้ตั้ง `APP_ADMIN_PASSWORD` ไว้ ระบบจะไม่สร้างใครเลย
และขึ้น WARN ใน log บอกวิธีตั้งค่า

| ตัวแปร | ค่าตั้งต้น |
| --- | --- |
| `APP_ADMIN_USERNAME` | `admin` |
| `APP_ADMIN_PASSWORD` | ว่าง ถ้าไม่ตั้งจะล็อกอินไม่ได้ |
| `APP_ADMIN_DISPLAY_NAME` | `Administrator` |

ตอน dev ตั้งเองใน `.env` (ก๊อปจาก `.env.example`) `docker-compose.yml` อ่านไฟล์นั้นให้เอง
**ไม่มีรหัสผ่านอยู่ใน repo แล้ว** ถ้าไม่ตั้ง `APP_ADMIN_PASSWORD` compose จะหยุดพร้อมบอกชื่อตัวแปร
ส่วนบน k8s ค่ามาจาก Secret `admin-credentials` ใน `k8s/20-backend.yaml` ซึ่งเป็นค่าที่วางไว้
ต้องเปลี่ยนก่อน apply จริงทุกครั้ง เหมือนกับ `postgres-credentials`

session อายุ 8 ชั่วโมง (`server.servlet.session.timeout`) ซึ่ง US-01-S3 ระบุว่ายังต้อง
ตกลงกับทีมอีกครั้ง ตัวเลขนี้เป็นค่าที่ใช้ไปก่อน

## API ที่มีตอนนี้

ห้องกับผู้เช่า

| Method | Path | ทำอะไร |
| --- | --- | --- |
| GET | `/api/rooms` | ห้องทั้ง 24 ห้อง เรียงตามเลขห้อง มี `status`, `currentLease` และจำนวนงานซ่อมค้างมาด้วย |
| GET | `/api/rooms/{id}` | รายละเอียดห้อง |
| PATCH | `/api/rooms/{id}/status` | ล็อกห้องเป็นซ่อมบำรุงหรือปลดล็อก body `{ "status": "MAINTENANCE" }` รับแค่ `MAINTENANCE` กับ `AVAILABLE` |
| GET | `/api/rooms/{id}/maintenance` | ประวัติงานซ่อมของห้องนี้ ใบใหม่สุดขึ้นก่อน |
| GET | `/api/tenants` | รายชื่อผู้เช่า |
| GET | `/api/tenants/{id}` | ดูผู้เช่ารายคน |
| POST | `/api/tenants` | เพิ่มผู้เช่า บังคับ `fullName`, `nationalId` (13 หลักหรือเลขพาสปอร์ต ห้ามซ้ำ), `phone` ส่วน `lineId` กับ `email` ไม่บังคับ |

สัญญาเช่าและอัตราค่าสาธารณูปโภค

| Method | Path | ทำอะไร |
| --- | --- | --- |
| GET | `/api/leases` | รายการสัญญา กรองด้วย query `status`, `roomId`, `tenantId` ได้ |
| POST | `/api/leases` | สร้างสัญญา ตอบ 201 |
| PUT | `/api/leases/{id}` | แก้สัญญาทั้งก้อน อัตราที่ล็อกไว้ตอนเซ็นจะคงเดิมถ้าไม่ได้ส่งมาด้วย |
| POST | `/api/leases/{id}/terminate` | ปิดสัญญา body `{ "endDate": "2026-09-30" }` แล้วห้องกลับไปว่างเอง |
| GET | `/api/leases/{id}/contract.pdf` | เอกสารสัญญาเช่าเป็น PDF ไว้พิมพ์ให้สองฝ่ายเซ็น (US-11) |
| GET | `/api/receipts` | รายการใบเสร็จ ใบใหม่สุดขึ้นก่อน กรองด้วย query `leaseId`, `status`, `month` (`YYYY-MM`) ได้ |
| GET | `/api/receipts/{id}` | ใบเสร็จใบเดียว พร้อมรายการห้าบรรทัดและยอดรวม |
| POST | `/api/receipts` | ออกใบเสร็จ ตอบ 201 body `{ "leaseId", "billingMonth": "2026-09", "electricUnits", "waterUnits" }` |
| POST | `/api/receipts/{id}/pay` | บันทึกว่าชำระแล้ว body `{ "paymentMethod": "..." }` ไม่ส่ง body ก็ได้ |
| GET | `/api/receipts/{id}/pdf` | ไฟล์ใบเสร็จเป็น PDF (US-10) |
| GET | `/api/apartment-config` | อัตราค่าไฟ น้ำ ส่วนกลาง อินเทอร์เน็ต ของทั้งตึก |
| PUT | `/api/apartment-config` | ตั้งอัตราใหม่ |

งานซ่อมบำรุง คลังอุปกรณ์ และแจ้งเตือนตามรอบ (CR-05 รายละเอียดอยู่ใน [docs/api-contract-maintenance.md](docs/api-contract-maintenance.md))

| Method | Path | ทำอะไร |
| --- | --- | --- |
| GET | `/api/maintenance` | ใบแจ้งซ่อมทั้งอพาร์ตเมนต์ ใบใหม่สุดขึ้นก่อน กรองด้วย query `status`, `roomId` ได้ |
| GET | `/api/maintenance/{id}` | ใบแจ้งซ่อมใบเดียว |
| POST | `/api/maintenance` | บันทึกงานซ่อม ตอบ 201 ของที่เบิกถูกตัดสต็อกในคำขอเดียวกัน |
| PATCH | `/api/maintenance/{id}` | แก้ทีละช่อง (สถานะ ผู้รับผิดชอบ ความสำคัญ วันนัด ค่าใช้จ่าย รายละเอียด) |
| POST | `/api/maintenance/{id}/supplies` | เบิกของเพิ่มให้ใบที่เปิดไว้แล้ว body `{ "supplyId": 3, "quantity": 2 }` |
| GET | `/api/supplies` | คลังอุปกรณ์ทั้งหมด เรียงตามชื่อ มีป้าย `IN_STOCK` / `LOW_STOCK` มาด้วย |
| GET | `/api/supplies/summary` | จำนวนรายการ จำนวนที่ใกล้หมด และจำนวนชิ้นที่เติมในเจ็ดวันล่าสุด |
| POST | `/api/supplies` | เพิ่มอุปกรณ์ ตอบ 201 รหัส SKU ซ้ำได้ 409 ไม่กรอก SKU ระบบออกให้ (`PL-004`) ต้องมี `maxStock` |
| PUT | `/api/supplies/{id}` | แก้อุปกรณ์ทั้งก้อน |
| POST | `/api/supplies/{id}/restock` | เติมของเข้าคลัง body `{ "quantity": 10 }` เป็นการบวกเพิ่ม ไม่ใช่ตั้งจำนวนใหม่ ยอดรวมต้องไม่เกิน `maxStock` |
| DELETE | `/api/supplies/{id}` | ลบของที่ยังไม่เคยถูกเบิก ตอบ 204 ของที่เคยถูกเบิกได้ 409 ให้ตั้งจำนวนเป็นศูนย์แทน |
| GET | `/api/reminders` | การแจ้งเตือนตามรอบ เรียงวันครบกำหนดใกล้สุดก่อน มีธง `overdue` มาด้วย |
| POST | `/api/reminders` | ตั้งการแจ้งเตือนใหม่ ตอบ 201 |
| PUT | `/api/reminders/{id}` | แก้ทั้งก้อน แล้วคิดวันครบกำหนดครั้งถัดไปใหม่ |
| PATCH | `/api/reminders/{id}/active` | เปิดปิดสวิตช์ body `{ "active": false }` |
| POST | `/api/reminders/run-due` | สั่งให้ไล่ใบที่ถึงกำหนดเดี๋ยวนี้ โดยไม่ต้องรอรอบแปดโมงเช้า |

ระบบเข้าสู่ระบบและ probe

| Method | Path | ทำอะไร |
| --- | --- | --- |
| POST | `/api/auth/login` | เข้าสู่ระบบ body `{ "username": "...", "password": "..." }` ตอบ 200 พร้อมตั้ง cookie session ให้ |
| GET | `/api/auth/me` | ตอนนี้ใครล็อกอินอยู่ ตอบ 401 ถ้ายังไม่ได้ล็อกอิน หน้าเว็บเรียกตอนเปิดแอป |
| POST | `/api/auth/logout` | ออกจากระบบ ตอบ 204 ไม่มี body |
| GET | `/actuator/health/liveness` `/readiness` | ให้ k8s ใช้เป็น probe |

error ตอบกลับเป็น `ProblemDetail` ตาม RFC 9457 ข้อความที่เอาไปโชว์ผู้ใช้ได้อยู่ในฟิลด์ `detail`
ส่วน validation error จะมีฟิลด์ `fields` บอกเพิ่มว่าช่องไหนผิดเพราะอะไร

นอกจาก endpoint ข้างบน ยังมีงานที่ระบบทำเองทุกเช้า 08:00 ตามเวลาไทย คือไล่ดูว่าการแจ้งเตือน
ตามรอบใบไหนถึงกำหนดแล้วเปิดใบแจ้งซ่อมให้อัตโนมัติ (US-14) โค้ดอยู่ที่ `maintenance/ReminderScheduler`
และเป็นเมธอดเดียวกับที่ `POST /api/reminders/run-due` เรียก

โค้ดจัดกลุ่มแบบ package-by-feature (`room/`, `tenant/`, `maintenance/`) ไม่ได้แยกเป็น `controller/ service/ repository/`
เหตุผลคือพอ requirement เปลี่ยนจะได้แก้อยู่โฟลเดอร์เดียว ไม่ต้องเปิดสามที่พร้อมกัน
ของใหม่ที่จะเพิ่มก็ทำตามรูปแบบนี้

## การออกเอกสาร PDF

ทำแล้ว มีสองเอกสารคือ **ใบเสร็จ** (US-10) กับ **สัญญาเช่าไว้เซ็น** (US-11)
รายละเอียดของ endpoint กับข้อความ error อยู่ใน [docs/api-contract-billing.md](docs/api-contract-billing.md)

วิธีที่ใช้คือ Thymeleaf render XHTML ออกมาก่อน แล้วส่งต่อให้ openhtmltopdf แปลงเป็น PDF
ที่เลือกทางนี้เพราะ layout ของใบเสร็จกับสัญญาเขียนด้วย HTML กับ CSS ได้ตรง ๆ ใครก็แก้ได้
ไม่ต้องนั่งวางพิกัดกล่องข้อความทีละอันแบบ PDF library สายวาดเอง

ของที่มีอยู่ตอนนี้

| ไฟล์ | ทำอะไร |
| --- | --- |
| `pdf/PdfRenderer.java` | ตัวกลาง รับชื่อ template กับ model แล้วคืนไฟล์ PDF เป็น byte array ฝังฟอนต์ให้เอง |
| `pdf/DocumentFormat.java` | ฟอร์แมตยอดเงินเป็นเยน (`¥3,500`) กับวันที่แบบ `11 Aug 2026` ให้เอกสารทุกใบเขียนเหมือนกัน |
| `pdf/PdfDocument.java` | ไฟล์ PDF พร้อมชื่อไฟล์ และตัวแปลงเป็น response แบบไฟล์แนบ |
| `templates/pdf/receipt.html` | หน้าตาใบเสร็จ |
| `templates/pdf/lease-contract.html` | หน้าตาสัญญาเช่า |
| `billing/ReceiptPdfService.java` | ประกอบ model ของใบเสร็จ |
| `lease/LeaseContractPdfService.java` | ประกอบ model ของสัญญา |

**เพิ่มเอกสารใหม่ทำยังไง** สร้าง template ใต้ `resources/templates/pdf/` แล้วเขียน service
ของ feature นั้นที่ประกอบ `Map<String, Object>` ส่งเข้า `PdfRenderer.render("pdf/ชื่อไฟล์", model)`
แล้วคืน `PdfDocument` ตัว service ควรอยู่ใน package ของ feature เอง (เหมือนที่ใบเสร็จอยู่ใน
`billing/` และสัญญาอยู่ใน `lease/`) ไม่ใช่กองไว้ใน `pdf/` ซึ่งเก็บเฉพาะเครื่องมือกลาง

สามเรื่องที่ต้องรู้ก่อนแก้ template

- **ฟอนต์ต้อง embed เข้าไปในไฟล์** ไม่ใช่แค่ตั้ง font-family ถ้าไม่ embed ตัวอักษรไทยจะหายกลายเป็นช่องว่าง
  หรือสระกับวรรณยุกต์ลอยผิดตำแหน่ง ที่หลอกคือตอนเปิดบนเครื่องตัวเองมักจะยังปกติเพราะเครื่องเรามีฟอนต์อยู่แล้ว
  ไปเปิดเครื่องอื่นถึงจะเจอ `PdfRenderer` ลงทะเบียนไว้สองน้ำหนัก (400 กับ 700) ถ้าลงแค่ 400
  ตัวหนาจะไม่ใช่ตัวหนาจริง เพราะ openhtmltopdf ไม่สังเคราะห์ให้
  `ReceiptApiTest` เปิดไฟล์ที่ generate ออกมาด้วย PDFBox แล้วเช็คชื่อฟอนต์ในทุกหน้าไว้ให้แล้ว
- **openhtmltopdf อ่าน HTML ด้วย parser ของ XML ไม่ใช่ parser ของเบราว์เซอร์** แปลว่า template
  ต้องเป็น XHTML ที่ well-formed ห้ามมี void element อย่าง `meta`, `br`, `hr`, `img` ที่ไม่ปิด tag
  และห้ามใช้ entity ของ HTML อย่าง `&nbsp;` เพราะไม่มี DTD ให้ parser แปล ต้องเขียนเป็น `&#160;`
  ทั้งสอง template ที่มีอยู่เลี่ยง void element ไปเลยทั้งใบ จะได้ไม่ต้องพึ่งว่า Thymeleaf
  serialize ออกมาแบบไหน ถ้าจะใส่ ให้ปิด tag เองทุกตัว
- **CSS ใช้ได้เท่าที่ openhtmltopdf รองรับ** flexbox กับ grid ใช้ไม่ได้ ต้องใช้ table กับ float
  ขนาดกระดาษกับขอบตั้งด้วย `@page { size: A4; margin: ...; }`

### เรื่องฟอนต์ Sarabun ไม่ใช่ TH Sarabun New

README ฉบับก่อนเขียนไว้ว่าจะใช้ **TH Sarabun New** จาก f0nt.com ตอนลงมือจริงเปลี่ยนเป็นตระกูล
**Sarabun** จาก Google Fonts แทน เป็นฟอนต์สายเดียวกัน (ออกแบบโดยคนเดียวกัน หน้าตาแทบไม่ต่าง)
ที่ต่างคือสัญญาอนุญาตของ Sarabun เป็น **SIL Open Font License 1.1** ซึ่งอนุญาตให้แจกจ่ายต่อ
พร้อมซอฟต์แวร์ได้ชัดเจนเป็นลายลักษณ์อักษร จึงคอมมิตไฟล์ฟอนต์ลง repo และฝังไปกับ Docker image
ได้โดยไม่ต้องตีความสัญญาอนุญาตเอง ซึ่งสำคัญเพราะ image ที่ใช้รันไม่มีฟอนต์ไทยติดมาสักตัว

ไฟล์อยู่ที่ `backend/src/main/resources/fonts/`

| ไฟล์ | ขนาด |
| --- | --- |
| `Sarabun-Regular.ttf` | 90,220 bytes |
| `Sarabun-Bold.ttf` | 89,804 bytes |
| `OFL.txt` | ตัวสัญญาอนุญาต **ห้ามลบ** |

## การเทส

Task เขียนไว้ว่า code review จากอาจารย์เป็น optional แต่ test ไม่ใช่ + requirement จะเปลี่ยนและ test ต้องจับ regression ให้ได้

```bash
# unit + integration test ฝั่ง backend (integration ต้องเปิด Docker ก่อน)
cd backend && ./gradlew test

# unit test ฝั่ง frontend
cd frontend && npm run test

# e2e ฝั่งหน้าเว็บ ไม่ต้องเปิด backend
cd frontend && npm run test:e2e

# e2e ที่ยิงถึง backend กับ PostgreSQL จริง ต้องเปิดระบบไว้ก่อน (ดูหัวข้อย่อยข้างล่าง)
cd frontend && npm run test:e2e:live
```

ตอนนี้มีครบสามชั้นแล้ว unit → integration → e2e

**ชั้น unit**

- ฝั่ง backend ดู `RoomServiceTest` ใช้ JUnit 5 กับ Mockito ปลอม repository เอา ไม่แตะ database
  ไม่ยก Spring context เทสแบบนี้รันเร็วมากและพังเฉพาะตอน logic ผิดจริง
- ฝั่ง frontend แบ่งเป็นสามชั้น `src/domain/lease.test.ts` เทสตรรกะล้วน ๆ ไม่แตะ DOM
  `src/api/client.test.ts` เทสว่ารูปร่างข้อมูลกับรหัสสถานะตรงกับที่ตกลงกับ backend ไว้
  และ `src/pages/*.test.tsx` เทสว่าผู้ใช้กดแล้วเห็นอะไร ยิงผ่าน backend จำลองจริงไม่ได้ mock ทีละฟังก์ชัน
  รวม 470 เคสใน 35 ไฟล์ (25 ก.ย.)

**ชั้น integration ฝั่ง backend**

`TestcontainersConfiguration` ยก PostgreSQL ตัวจริงขึ้นมาให้ตอนเทส ไม่ใช่ฐานข้อมูลจำลอง
เทสระดับ HTTP ที่ยิง MockMvc ทะลุถึง Postgres ตัวจริงดู `LeaseApiTest`, `ApartmentConfigApiTest`
และ `ReceiptApiTest` (ตัวหลังเปิดไฟล์ PDF ที่ generate ออกมาด้วย PDFBox แล้วเช็คว่าฟอนต์ไทย
ถูก embed ไปด้วยจริง ไม่ได้เช็คแค่ว่า response เป็น `application/pdf`)
ก๊อปสามตัวนี้ไปทำต่อได้เลย ทั้งคู่ติด `@EnabledIf("dockerAvailable")` ไว้ เครื่องที่ยังไม่ได้เปิด Docker
จะข้ามไปเฉย ๆ ไม่ทำให้ `./gradlew build` พัง ส่วน runner ของ GitHub มี Docker อยู่แล้วจึงรันจริงทุก PR

ที่ไม่ใช้ H2 เพราะ H2 กับ Postgres ต่างกันพอที่จะทำให้เทสผ่านแต่ของจริงพัง
โดยเฉพาะเรื่อง date range กับ constraint ซึ่งเป็นสองอย่างที่โปรเจกต์นี้จะได้ใช้แน่ ๆ ตอนทำสัญญาเช่า
เช่น `LeaseOverlapIntegrationTest` ที่พิสูจน์ว่าฐานข้อมูลกันสัญญาทับซ้อนห้องเดียวกันได้จริง

**ชั้น e2e ฝั่งหน้าเว็บ (Playwright)**

เปิดเบราว์เซอร์จริงแล้วกดตามที่แอดมินใช้งาน ไฟล์อยู่ใน `frontend/e2e/` แบ่งเป็นสามโปรเจกต์
ตามว่าปลายทางของคำขอ `/api` คืออะไร

| โปรเจกต์ | พอร์ต | ปลายทาง `/api` | ไฟล์ | อยู่ใน CI |
|---|---|---|---|---|
| `mock-api` | 4173 | backend จำลองในเบราว์เซอร์ (`src/api/mockApi.ts`) | `*.spec.ts` | ใช่ |
| `stubbed-api` | 4174 | Playwright ปลอมคำตอบด้วย `page.route` | `*.stubbed.spec.ts` | ใช่ |
| `live-api` | 4175 | **Spring กับ PostgreSQL จริง** | `live/*.live.spec.ts` | ไม่ ต้องสั่งเอง |

สองโปรเจกต์แรกรันด้วย `npm run test:e2e` ไม่ต้องเปิดอะไรเพิ่ม จึงอยู่ใน CI ได้
ส่วน `live-api` ต้องเปิด `docker compose up -d db` กับ backend โปรไฟล์ `dev` ไว้ก่อน แล้วสั่ง

```powershell
cd frontend
$env:E2E_ADMIN_PASSWORD='<รหัสเดียวกับ APP_ADMIN_PASSWORD>'
npm run test:e2e:live
```

รหัสแอดมินอ่านจาก environment ไม่ได้เขียนไว้ในโค้ด ถ้าไม่ตั้งเทสจะหยุดพร้อมบอกวิธีตั้ง

ที่ต้องมีชุด `live-api` เพราะ `mockApi.ts` ไม่ตรวจรูปแบบข้อมูลและรองรับทุก HTTP method
เทสที่วิ่งกับ mock จึงเขียวได้ทั้งที่ของจริงพัง บั๊กสามตัวที่เจอแบบนี้มาแล้วคือเลขบัตรประชาชน
ที่ backend ปฏิเสธ (SSK-113) endpoint แก้ไข/ลบผู้เช่าที่ยังไม่มีจริง (SSK-108)
และป็อปอัปแจ้งซ่อมที่กดบันทึกแล้วไม่ยิง API (SSK-139)

รายละเอียดของแต่ละโปรเจกต์ วิธีรัน และเทสที่จงใจให้แดงอยู่ใน `frontend/e2e/README.md`

ข้อมูลตัวอย่างตอน dev มาจาก `DevDataSeeder` ซึ่งทำงานเฉพาะตอนเปิดโปรไฟล์ `dev`
และ `docker-compose.yml` ตั้ง `SPRING_PROFILES_ACTIVE=dev` ไว้ให้แล้ว
ส่วน manifest ของ k8s ไม่ได้เปิด ผู้เช่าปลอมจึงไม่หลุดขึ้นไป

## CI/CD

workflow อยู่ใน `.github/workflows/`

`build-lint-test.yml` ทำงานทุก PR และทุก push เข้า main แบ่งเป็นสี่ job ที่รันขนานกัน

- `backend` รัน `./gradlew build` (รวม integration test ที่ใช้ Testcontainers) แล้วเก็บ test report เป็น artifact
- `frontend` รัน lint, unit test แล้ว build
- `frontend-e2e` รัน `npm run test:e2e` คือ e2e โปรเจกต์ `mock-api` กับ `stubbed-api` และเก็บ report กับ trace ไว้เฉพาะตอนพัง
- `docker` build image ของ backend กับ frontend ด้วย buildx โดยไม่ push ขึ้น registry เอาไว้จับ Dockerfile หรือ `nginx.conf` พังตั้งแต่ใน PR

runner ของ GitHub มี Docker กับ Chrome ให้อยู่แล้ว Testcontainers กับ Playwright เลยรันได้โดยไม่ต้องตั้งอะไรเพิ่ม
ส่วนโปรเจกต์ `live-api` ยังไม่อยู่ใน CI เพราะต้องยก PostgreSQL กับ backend ขึ้นมาก่อน ตอนนี้จึงรันด้วยมือ

`docker.yml` ทำงานเมื่อ push เข้า main หรือ tag `v*` build image ทั้งสองตัวแล้ว push ขึ้น GHCR
นอกจากนั้นยังกดสั่งเองได้จากแท็บ Actions (`workflow_dispatch`) โดยเลือก branch ไหนก็ได้ที่มีไฟล์นี้อยู่ ใช้ตอนอยากโชว์ว่า build image ได้จริงทั้งที่ยังไม่มีอะไร merge เข้า main

`deploy.yml` ยก minikube ขึ้นมาใน runner แล้ว deploy ทั้ง stack ลงไปจริง จบด้วยการยิงเข้าเว็บ
ผ่าน NodePort เพื่อพิสูจน์ว่าเส้นทาง nginx ไป Spring Boot ไป PostgreSQL ต่อกันติดครบสาย
ไม่ได้เช็คแค่ health เพราะถ้าเช็คแค่นั้น ต่อให้ database พังก็ยังเขียวได้ จึงอ่าน `/api/rooms`
แล้วนับว่าต้องได้ครบ 24 ห้องตามที่ `V2__seed_rooms.sql` ใส่ไว้

workflow นี้ทำงานเมื่อ push เข้า main กดสั่งเองจากหน้า Actions หรือเปิด PR ที่แตะไฟล์ใน `k8s/`
กับ Dockerfile PR ทั่วไปไม่ต้องยก cluster ขึ้นมาให้เสียเวลา

**สิ่งที่ workflow นี้ไม่ได้ทำ** มันไม่ได้ deploy ลง minikube บนเครื่องเรา cluster ที่ใช้เกิดใน
runner แล้วถูกทิ้งเมื่อ job จบ ที่เป็นแบบนี้เพราะ runner ของ GitHub เข้าถึงเครื่องเราไม่ได้
และโจทย์ของวิชาห้ามพึ่ง cloud service ของใคร สิ่งที่มันรับประกันคือ manifest กับ image
ใช้ deploy ได้จริง ถ้าอยากให้ deploy ลงเครื่องตัวเองอัตโนมัติด้วย ต้องตั้ง self-hosted runner
บนเครื่องนั้นแล้วเพิ่ม job ที่ระบุ `runs-on: self-hosted` ซึ่งยังไม่ได้ทำ

## Deploy ขึ้น Minikube

```bash
minikube start

# ชี้ docker client ไปที่ daemon ข้างใน minikube
eval $(minikube docker-env)

docker build -t sakura-soul-backend:local ./backend
docker build -t sakura-soul-frontend:local ./frontend

# Secret ใน k8s/ เก็บรหัสไว้เป็นค่าที่วางไว้เฉย ๆ ต้องแทนที่ก่อน apply ทุกครั้ง
# ถ้าข้ามขั้นนี้ ระบบจะขึ้นด้วยรหัสที่ใครเปิด repo ก็อ่านได้
sed -i "s/change-me-before-first-apply/$(openssl rand -hex 16)/" k8s/10-postgres.yaml
sed -i "s/change-me-before-first-apply/รหัสแอดมินที่ตั้งเอง/" k8s/20-backend.yaml

kubectl apply -k k8s/
kubectl get pods -n sakura-soul -w

minikube service frontend -n sakura-soul
```

ทุกอย่างอยู่ใน namespace `sakura-soul` ที่ `k8s/00-namespace.yaml` สร้างให้ ใช้ `-k` ก็ได้ `-f k8s/` ก็ได้
ชื่อไฟล์ขึ้นต้นด้วยตัวเลขเพื่อให้แบบ `-f` apply เรียงลำดับถูก namespace ต้องมาก่อนของอย่างอื่นเสมอ

บรรทัด `eval $(minikube docker-env)` ต้องรันก่อน `docker build` เสมอ ถ้าข้ามไป image จะไปอยู่ใน Docker ของเครื่องเรา ส่วน minikube หาไม่เจอแล้วจะขึ้น `ImagePullBackOff` ทั้งที่เพิ่ง build เสร็จหมาด ๆ อาการนี้หลอกคนมาเยอะ

บน PowerShell คำสั่งนั้นใช้ไม่ได้ ให้ใช้แทน

```powershell
minikube -p minikube docker-env | Invoke-Expression
```

ถ้า `docker-env` ใช้ไม่ได้ เช่นตอนที่ minikube ตั้ง container runtime เป็น containerd
ให้ build ด้วย docker ของเครื่องตามปกติแล้วโหลดเข้า cluster ทีหลัง วิธีนี้ใช้ได้กับทุก runtime
และเป็นวิธีที่ workflow `deploy.yml` ใช้

```bash
docker buildx build --load -t sakura-soul-backend:local ./backend
minikube image load sakura-soul-backend:local
```

และเพราะ image เป็น local ทั้งคู่ ใน manifest ต้องตั้ง `imagePullPolicy: IfNotPresent` ไว้ด้วย ไม่งั้น k8s จะพยายามไป pull จาก registry ข้างนอก

## กำหนดส่ง

| วันที่ | ต้องมี |
| --- | --- |
| 15 ส.ค. | Figma, UX/UI, user story เบื้องต้น |
| 29 ส.ค. | ปรับ Figma / UX/UI / user story และเริ่มมีโค้ดใน repo |
| 12 ก.ย. | โค้ดรันได้, unit test, pipeline as code build บน GitHub |
| 26 ก.ย. | Dockerfile, docker-compose, pipeline build docker บน GitHub |
| 17 ต.ค. | ปิด Phase 1 นำเสนอ และ deploy จาก GitHub ขึ้น k8s ได้ |
| 31 ต.ค. | ความคืบหน้า Phase 2 (Figma, user story, โค้ด) ส่วน observability ตัดออกจาก requirement แล้ว |
| 14 พ.ย. | ทุกอย่างต้องเสร็จ |

## การทำงานร่วมกัน

- ห้าม push เข้า `main` ตรง ๆ ทุกอย่างผ่าน PR
- ตั้งชื่อ branch แบบ `feat/room-dashboard`, `fix/receipt-font`, `chore/ci-cache`
- 1 PR ทำเรื่องเดียว รีวิวง่ายกว่าและ revert ง่ายกว่าตอนมีปัญหา
- PR ต้อง CI เขียวและมีคนในทีมอย่างน้อย 1 คน approve ก่อน merge
- commit message เขียนให้อ่านรู้เรื่องว่าทำอะไร ไม่เอา `update`, `fix bug`, `.`

## ทีม

| ชื่อ | GitHub | ดูแลส่วน |
| --- | --- | --- |
| Natthanan Kantawong | @natthanankan-dotcom | Frontend |
| Pisute Chen | @phirse | Backend |
| | | |
| | | |
| | | |
| | | |

## สถานะตอนนี้

- [x] Figma และ user story
- [x] โครง Spring Boot + Gradle Wrapper
- [x] โครง React
- [x] schema กับ migration ชุดแรก (ห้องกับผู้เช่า)
- [x] หน้าจอแดชบอร์ด ผู้เช่า และสัญญาเช่า (รันบน backend จำลองระหว่างรอ API สัญญาเช่า)
- [x] ตาราง `lease` และ endpoint สัญญาเช่าฝั่ง Spring
- [x] ระบบ login
- [x] ออก PDF ใบเสร็จ (และ PDF สัญญาเช่า)
- [x] Dockerfile กับ docker-compose
- [x] GitHub Actions
- [x] manifest สำหรับ k8s
- [x] pipeline deploy ขึ้น k8s อัตโนมัติ (บน cluster ที่ยกใน runner)

ที่ทำไปแล้วคือทางเดินเส้นเดียวจาก database ถึงหน้าเว็บ พอให้เห็นว่ารูปแบบที่ตกลงกันหน้าตาเป็นยังไง
แล้วก๊อปไปทำส่วนของตัวเองต่อ ไม่ได้ตั้งใจให้ครบ

## ที่ยังไม่มี

เรียงตามที่คิดว่าควรทำก่อนหลัง

1. **สัญญาเช่ากับสถานะห้อง** ครบแล้ว ทั้งตาราง `lease` endpoint ของสัญญาทั้งสี่ตัว และการล็อกห้องซ่อมบำรุง
   ส่วน `openMaintenanceCount` / `openMaintenanceTitle` มีค่าจริงแล้วตั้งแต่ CR-05 (ดูข้อ 5)

2. **ระบบ login** ครบทั้งสองฝั่งแล้ว ฝั่ง backend คือ SSK-28 ทุก endpoint ต้องล็อกอินก่อน
   ใช้ session cookie แอดมินคนแรกมาจาก `APP_ADMIN_PASSWORD` ซึ่งตอน dev ตั้งไว้ใน `.env`
   ดูหัวข้อ "การเข้าสู่ระบบ" ข้างบน ฝั่งหน้าเว็บคือ SSK-7 กับ SSK-8 ต่อ API แล้วที่
   `LoginPage.tsx`, `components/RequireAuth.tsx` (ยามเฝ้าเส้นทาง เรียก `/api/auth/me` ตอนเปิดแอป)
   และ `LogoutConfirmModal.tsx` การดัก 401 อยู่ที่ `api/client.ts` ที่เดียว
   **ที่ยังขาดคือการแก้โปรไฟล์แอดมิน** หน้า Account Settings แก้ชื่อ อีเมล เบอร์ และรูปได้
   แต่เก็บอยู่ใน `localStorage` ของเบราว์เซอร์เครื่องนั้นเท่านั้น ยังไม่มี endpoint ให้เซฟกลับ
   ฐานข้อมูล (`admin_user` มีคอลัมน์รออยู่แล้วแต่ยังไม่มี `PUT /api/auth/me`) เปลี่ยนเครื่อง
   หรือล้าง browser data แล้วค่าที่แก้จะหาย และตอนออกจากระบบระบบจะล้างทิ้งด้วยเพื่อไม่ให้
   คนถัดไปบนเครื่องเดียวกันเห็นข้อมูลของคนก่อนหน้า
3. **หน้าจอที่เหลือ** แดชบอร์ด ผู้เช่า สัญญาเช่า รายการห้อง และหน้า Payments ต่อ API แล้ว
   ส่วนหน้า Maintenance ต่อแล้วสามแท็บ (Maintenance Tasks, Supplies & Inventory และ Maintenance Log) เหลือ
   Schedule & Reminder ที่ยังเป็นข้อมูลตัวอย่าง ทั้งที่ endpoint มีครบแล้ว (ดูข้อ 5) ส่วนหน้า Appliances ยังไม่มี endpoint เลย
   เพราะยังไม่มีใครนิยามว่าคืออะไร (ดูข้อ 5) รายละเอียดว่าใครทำอะไรต่ออยู่ใน `docs/frontend-workplan.md`
4. **ใบเสร็จกับเอกสารสัญญาเช่า** ฝั่ง backend เสร็จแล้ว (SSK-16 / SSK-17) มีตาราง `receipt` (V9)
   endpoint ใบเสร็จห้าตัว และ PDF ทั้งใบเสร็จกับสัญญาเช่า พร้อมฟอนต์ไทยที่ embed ในไฟล์แล้ว
   ดูหัวข้อ "การออกเอกสาร PDF" ข้างบน และ [docs/api-contract-billing.md](docs/api-contract-billing.md)

   ที่เหลือคือ
   - ~~ต่อหน้าเว็บ~~ **ต่อแล้ว** ใน PR #116 และ SSK-16 (ออกบิล รับชำระ ดาวน์โหลด PDF ของ backend
     สถานะ Overdue ใบเสร็จตัวอย่างใน dev seed) ข้อตัดสินอยู่ในหัวข้อ "หน้าเว็บที่ต่อแล้ว" ของเอกสารข้างบน
   - **บรรทัดค่าเครื่องใช้ไฟฟ้ากับค่าซ่อม** ที่ป็อปอัปวาดไว้เป็นตัวอย่าง ยังไม่มีตารางรองรับ
     ต้องรอ US-17 (คลังอุปกรณ์) กับ CR-05 (ใบแจ้งซ่อม) ก่อน ตอนนี้ใบเสร็จมีห้าบรรทัดตายตัว
     คือค่าเช่า ค่าส่วนกลาง ค่าอินเทอร์เน็ต ค่าไฟ ค่าน้ำ
   - **ส่งใบเสร็จทางอีเมล** ปุ่ม Send ในตาราง Payments ยังไม่มี endpoint รองรับ (ปิดปุ่มไว้)
   - **endpoint สรุปยอด** สำหรับการ์ดสามใบบนหน้า Payments ยังไม่มี (ตอนนี้คิดจากรายการที่โหลดมา)
5. **งานซ่อมบำรุงกับแจ้งเตือนตามรอบ** ฝั่ง backend เสร็จแล้ว (CR-05) ทั้ง `V8__maintenance.sql`
   ห้าตาราง endpoint ของใบแจ้งซ่อม คลังอุปกรณ์ และการแจ้งเตือนตามรอบ พร้อมงานประจำวันที่
   เปิดใบแจ้งซ่อมให้เองตอนแปดโมงเช้า ส่วน `GET /api/rooms` ส่ง `openMaintenanceCount` กับ
   `openMaintenanceTitle` เป็นค่าจริงแล้ว รูปร่าง JSON ไม่ได้เปลี่ยนจากเดิม
   แท็บ Maintenance Tasks กับป็อปอัป Create Maintenance บน Dashboard ต่อ API แล้วใน SSK-131
   (สร้าง แก้ ปิดงาน และลบใบที่เปิดผิด) ใช้ข้อมูลชุดเดียวกับแท็บ Maintenance Log
   แท็บ Supplies & Inventory ต่อแล้วใน SSK-23 (เพิ่ม แก้ เติม ลบของที่ยังไม่เคยถูกเบิก เพดาน Max Stock
   และการ์ดสามใบจาก `/api/supplies/summary`)
   ที่เหลือคือ **ต่อหน้าเว็บเข้ากับ endpoint พวกนี้** อีกหนึ่งแท็บ คือ
   Reminders ของ `MaintenancePage.tsx` ที่ยังเก็บข้อมูลไว้ใน `useState` ของหน้า รายการสิ่งที่ต้องแก้กับ
   ตารางเทียบป้ายสถานะบนหน้าจอกับค่า `OPEN` / `IN_PROGRESS` / `DONE` อยู่ในหัวข้อ
   "สิ่งที่หน้าเว็บต้องเปลี่ยน" ของ [docs/api-contract-maintenance.md](docs/api-contract-maintenance.md)
   อีกข้อที่ยังค้างคือ **การเช่าเครื่องใช้ไฟฟ้ายังไม่มีใครนิยามว่าคืออะไร** หน้า `AppliancesPage.tsx`
   เป็นเฟรม Appliance Rental ของ Figma (รายการขอเช่าของพร้อมค่าเช่าและสถานะ) ซึ่ง **ยังไม่มี
   endpoint ฝั่ง backend เลยสักตัว** ไม่ใช่คลังอุปกรณ์ซ่อมที่ CR-05 ทำไว้ (ตัวนั้นอยู่ในแท็บ
   Supplies & Inventory ของหน้า Maintenance) ต้องถามเจ้าของ requirement ก่อนลงมือ
6. **e2e ที่ยิง backend จริงยังไม่อยู่ใน CI** ตอนนี้มีครบสามชั้นแล้ว (unit, integration ด้วย
   Testcontainers, e2e ด้วย Playwright) แต่โปรเจกต์ `live-api` ที่คุยกับ Spring กับ PostgreSQL
   จริงต้องสั่งรันเอง ถ้าจะใส่ใน CI ต้องเพิ่มขั้นตอนยกฐานข้อมูลกับ backend ใน workflow ก่อน
7. **deploy ลง minikube บนเครื่องตัวเองอัตโนมัติ** ตอนนี้ `deploy.yml` พิสูจน์ได้แล้วว่า manifest
   deploy ขึ้น cluster จริงได้ แต่ cluster นั้นเกิดใน runner ไม่ใช่เครื่องเรา ถ้าจะให้ push แล้ว
   ของขึ้นเครื่องเราเองต้องตั้ง self-hosted runner เพิ่ม ดูหัวข้อ CI/CD
