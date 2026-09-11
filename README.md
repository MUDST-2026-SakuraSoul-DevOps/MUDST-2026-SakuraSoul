# Sakura Soul

ระบบจัดการหอพักสำหรับแอดมิน ทำเป็น semester project วิชา MUDST ปีการศึกษา 2026

## Links
- Figma
  https://www.figma.com/design/swAK0L3qmTuuxT0n956GjO/Sakura-Soul-Apartment?node-id=0-1&t=7nNdcrRfNpttSC1m-1
- User Story
  https://docs.google.com/spreadsheets/d/1xEgNkx-E_S8Y4hZU7nrSxsn_BtXuAZ-ybydJlQzR2JU/edit?usp=sharing
- ข้อตกลง API ของสัญญาเช่า
  [docs/api-contract-lease.md](docs/api-contract-lease.md)
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
| ออกเอกสาร PDF | openhtmltopdf + Thymeleaf + ฟอนต์ TH Sarabun New |
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

รันทั้ง stack ทีเดียว

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

ใช้ PostgreSQL 17 ค่า connection อ่านจาก environment variable โดยมีค่า default สำหรับ dev อยู่ใน
`backend/src/main/resources/application.yml` ส่วน `docker-compose.yml` กับ manifest ใน `k8s/` ส่งค่าจริงเข้ามาทับ

schema คุมด้วย Flyway ไฟล์อยู่ใน `backend/src/main/resources/db/migration/` และตั้ง `ddl-auto: validate`
ไม่ใช่ `update` เหตุผลคือ requirement ของวิชาจะเปลี่ยนหลายรอบระหว่างเทอม ถ้าปล่อยให้ Hibernate แก้ schema ให้เอง
พอถึงตอนที่ข้อมูลใน dev กับใน k8s ไม่ตรงกันจะไล่ไม่ถูกว่าใครแก้อะไรไป การเขียน migration ไฟล์ต่อไฟล์เสียเวลาตอนแรกอยู่บ้าง
แต่ตอนย้อนดูมันชัดกว่ามาก ส่วน `validate` ทำให้แอปไม่ยอมสตาร์ตเลยถ้า entity กับ migration เริ่มไม่ตรงกัน
ซึ่งดีกว่าไปเจอตอน runtime

ตอนนี้มีสี่ตารางคือ `room`, `tenant`, `apartment_config` (V3) และ `lease` (V4) โดย `lease` เป็นตัวเชื่อม
ห้องกับผู้เช่า เก็บวันเริ่มวันจบ ค่าเช่า รอบบิล และอัตราค่าสาธารณูปโภคที่ล็อกไว้ตอนเซ็น
ส่วนกฎ "ห้ามปล่อยเช่าซ้อน" อยู่ที่ exclusion constraint `lease_no_overlap` ใน V4 ไม่ได้อยู่ในโค้ดฝั่งแอป

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

## API ที่มีตอนนี้

| Method | Path | ทำอะไร |
| --- | --- | --- |
| GET | `/api/rooms` | ห้องทั้ง 24 ห้อง เรียงตามเลขห้อง มี `status` กับ `currentLease` มาด้วยแล้ว |
| GET | `/api/rooms/{id}` | รายละเอียดห้อง |
| PATCH | `/api/rooms/{id}/status` | ล็อกห้องเป็นซ่อมบำรุงหรือปลดล็อก body `{ "status": "MAINTENANCE" }` รับแค่ `MAINTENANCE` กับ `AVAILABLE` |
| GET | `/api/tenants` | รายชื่อผู้เช่า |
| GET | `/api/tenants/{id}` | ดูผู้เช่ารายคน |
| POST | `/api/tenants` | เพิ่มผู้เช่า บังคับ `fullName`, `nationalId` (13 หลักหรือเลขพาสปอร์ต ห้ามซ้ำ), `lineId`, `phone` ส่วน `email` ไม่บังคับ |
| GET | `/api/leases` | รายการสัญญา กรองด้วย query `status`, `roomId`, `tenantId` ได้ |
| POST | `/api/leases` | สร้างสัญญา ตอบ 201 |
| PUT | `/api/leases/{id}` | แก้สัญญาทั้งก้อน อัตราที่ล็อกไว้ตอนเซ็นจะคงเดิมถ้าไม่ได้ส่งมาด้วย |
| POST | `/api/leases/{id}/terminate` | ปิดสัญญา body `{ "endDate": "2026-09-30" }` แล้วห้องกลับไปว่างเอง |
| GET | `/api/apartment-config` | อัตราค่าไฟ น้ำ ส่วนกลาง อินเทอร์เน็ต ของทั้งตึก |
| PUT | `/api/apartment-config` | ตั้งอัตราใหม่ |
| GET | `/actuator/health/liveness` `/readiness` | ให้ k8s ใช้เป็น probe |

error ตอบกลับเป็น `ProblemDetail` ตาม RFC 9457 ข้อความที่เอาไปโชว์ผู้ใช้ได้อยู่ในฟิลด์ `detail`
ส่วน validation error จะมีฟิลด์ `fields` บอกเพิ่มว่าช่องไหนผิดเพราะอะไร

โค้ดจัดกลุ่มแบบ package-by-feature (`room/`, `tenant/`) ไม่ได้แยกเป็น `controller/ service/ repository/`
เหตุผลคือพอ requirement เปลี่ยนจะได้แก้อยู่โฟลเดอร์เดียว ไม่ต้องเปิดสามที่พร้อมกัน
ของใหม่ที่จะเพิ่มก็ทำตามรูปแบบนี้

## การออกเอกสาร PDF

ยังไม่ได้ทำ ส่วนนี้เป็นบันทึกว่าตกลงกันว่าจะทำแบบไหน ไว้ให้คนที่มาลงมือต่อ

วิธีที่เลือกคือให้ Thymeleaf render HTML ออกมาก่อน แล้วส่ง HTML ตัวนั้นต่อให้ openhtmltopdf แปลงเป็น PDF
ที่เลือกทางนี้เพราะ layout ของใบเสร็จกับสัญญาเขียนด้วย HTML กับ CSS ได้ตรง ๆ ใครก็แก้ได้
ไม่ต้องนั่งวางพิกัดกล่องข้อความทีละอันแบบ PDF library สายวาดเอง

สองเรื่องที่หาข้อมูลไว้แล้ว เก็บไว้กันเสียเวลาซ้ำ

- **ฟอนต์ต้อง embed เข้าไปในไฟล์** ไม่ใช่แค่ตั้ง font-family ถ้าไม่ embed ตัวอักษรไทยจะหายกลายเป็นช่องว่าง
  หรือสระกับวรรณยุกต์ลอยผิดตำแหน่ง ที่หลอกคือตอนเปิดบนเครื่องตัวเองมักจะยังปกติเพราะเครื่องเรามีฟอนต์อยู่แล้ว
  ไปเปิดเครื่องอื่นถึงจะเจอ เวลาเทสให้ลองเปิดไฟล์ที่ generate จากใน container ด้วย
  ฟอนต์ TH Sarabun New โหลดได้จาก f0nt.com เป็นหนึ่งใน 13 ฟอนต์แห่งชาติ ใช้และแจกจ่ายต่อได้
- **openhtmltopdf อ่าน HTML ด้วย parser ของ XML ไม่ใช่ parser ของเบราว์เซอร์** แปลว่า template
  ต้องเป็น XHTML ที่ well-formed ห้ามมี void element อย่าง `meta`, `br`, `hr`, `img` ที่ไม่ปิด tag
  เพราะ Thymeleaf โหมด HTML จะ serialize ออกมาแบบไม่ปิดแล้ว parser จะพัง
  และ CSS ใช้ได้เท่าที่ openhtmltopdf รองรับ flexbox กับ grid ใช้ไม่ได้ ต้องใช้ table กับ float

## การเทส

Task เขียนไว้ว่า code review จากอาจารย์เป็น optional แต่ test ไม่ใช่ + requirement จะเปลี่ยนและ test ต้องจับ regression ให้ได้

```bash
# unit test ฝั่ง backend
cd backend && ./gradlew test

# unit test ฝั่ง frontend
cd frontend && npm run test
```

ตอนนี้มีแค่ชั้น unit ทั้งสองฝั่ง เขียนไว้พอเป็นตัวอย่างให้ก๊อปไปทำต่อ

- ฝั่ง backend ดู `RoomServiceTest` ใช้ JUnit 5 กับ Mockito ปลอม repository เอา ไม่แตะ database
  ไม่ยก Spring context เทสแบบนี้รันเร็วมากและพังเฉพาะตอน logic ผิดจริง
- ฝั่ง frontend แบ่งเป็นสามชั้น `src/domain/lease.test.ts` เทสตรรกะล้วน ๆ ไม่แตะ DOM
  `src/api/client.test.ts` เทสว่ารูปร่างข้อมูลกับรหัสสถานะตรงกับที่ตกลงกับ backend ไว้
  และ `src/pages/*.test.tsx` เทสว่าผู้ใช้กดแล้วเห็นอะไร ยิงผ่าน backend จำลองจริงไม่ได้ mock ทีละฟังก์ชัน

integration test กับ e2e ยังไม่ได้เขียน แต่ของที่ต้องใช้พร้อมแล้ว
`TestcontainersConfiguration` ที่ยก PostgreSQL ตัวจริงขึ้นมาให้ตอนเทสอยู่ใน `src/test/` แล้ว
แค่ยังไม่มีเทสตัวไหนเรียกใช้ เวลาจะเขียนให้ `@Import` เข้าไปใน `@SpringBootTest` แล้วต้องเปิด Docker ก่อนรัน

เทสระดับ HTTP ที่ยิง MockMvc ทะลุถึง Postgres ตัวจริงดู `LeaseApiTest` กับ `ApartmentConfigApiTest`
ก๊อปสองตัวนี้ไปทำต่อได้เลย ทั้งคู่ติด `@EnabledIf("dockerAvailable")` ไว้ เครื่องที่ยังไม่ได้เปิด Docker
จะข้ามไปเฉย ๆ ไม่ทำให้ `./gradlew build` พัง ส่วน runner ของ GitHub มี Docker อยู่แล้วจึงรันจริงทุก PR

ที่ไม่ใช้ H2 เพราะ H2 กับ Postgres ต่างกันพอที่จะทำให้เทสผ่านแต่ของจริงพัง
โดยเฉพาะเรื่อง date range กับ constraint ซึ่งเป็นสองอย่างที่โปรเจกต์นี้จะได้ใช้แน่ ๆ ตอนทำสัญญาเช่า

ข้อมูลตัวอย่างตอน dev มาจาก `DevDataSeeder` ซึ่งทำงานเฉพาะตอนเปิดโปรไฟล์ `dev`
และ `docker-compose.yml` ตั้ง `SPRING_PROFILES_ACTIVE=dev` ไว้ให้แล้ว
ส่วน manifest ของ k8s ไม่ได้เปิด ผู้เช่าปลอมจึงไม่หลุดขึ้นไป

## CI/CD

workflow อยู่ใน `.github/workflows/`

`ci.yml` ทำงานทุก PR และทุก push เข้า main แบ่งเป็นสอง job

- `backend` รัน `./gradlew build` แล้วเก็บ test report เป็น artifact
- `frontend` รัน lint, unit test แล้ว build

พอเริ่มมี integration test กับ e2e ค่อยมาเพิ่ม job ที่นี่
runner ของ GitHub มี Docker ให้อยู่แล้ว Testcontainers เลยรันได้โดยไม่ต้องตั้งอะไรเพิ่ม

`docker.yml` ทำงานเมื่อ push เข้า main หรือ tag `v*` build image ทั้งสองตัวแล้ว push ขึ้น GHCR

ส่วน deploy ขึ้น k8s อัตโนมัติยังไม่ได้ทำ ตอนนี้ apply มือตามหัวข้อข้างล่าง

## Deploy ขึ้น Minikube

```bash
minikube start

# ชี้ docker client ไปที่ daemon ข้างใน minikube
eval $(minikube docker-env)

docker build -t sakura-soul-backend:local ./backend
docker build -t sakura-soul-frontend:local ./frontend

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
- [ ] ระบบ login
- [ ] ออก PDF ใบเสร็จ
- [x] Dockerfile กับ docker-compose
- [x] GitHub Actions
- [x] manifest สำหรับ k8s

ที่ทำไปแล้วคือทางเดินเส้นเดียวจาก database ถึงหน้าเว็บ พอให้เห็นว่ารูปแบบที่ตกลงกันหน้าตาเป็นยังไง
แล้วก๊อปไปทำส่วนของตัวเองต่อ ไม่ได้ตั้งใจให้ครบ

## ที่ยังไม่มี

เรียงตามที่คิดว่าควรทำก่อนหลัง

1. **สัญญาเช่ากับสถานะห้อง** ครบแล้ว ทั้งตาราง `lease` endpoint ของสัญญาทั้งสี่ตัว และการล็อกห้องซ่อมบำรุง
   เหลือแค่ค่าจริงของ `openMaintenanceCount` / `openMaintenanceTitle` ที่รอตารางใบแจ้งซ่อม (ดูข้อ 5)

2. **ระบบ login** ยังไม่ทำเลย ทุก endpoint เปิดหมด `SecurityConfig` ตั้ง `permitAll` ไว้
   แก้ที่ไฟล์เดียวตอนพร้อมทำ ระหว่างนี้ห้ามเอาขึ้น environment ที่คนนอกเข้าถึงได้
3. **หน้าจอที่เหลือ** แดชบอร์ด ผู้เช่า สัญญาเช่า และรายการห้อง ต่อ API แล้ว
   ส่วนหน้า Payments, Maintenance, Appliances ยังเป็นข้อมูลตัวอย่างที่ก๊อปมาจาก Figma
   เพราะ endpoint ของสามส่วนนั้นยังไม่มี รายละเอียดว่าใครทำอะไรต่ออยู่ใน
   `docs/frontend-workplan.md`
4. **ใบเสร็จกับสัญญาเช่า** ยังไม่เริ่ม ดูบันทึกในหัวข้อการออกเอกสาร PDF ก่อนลงมือ
5. **งานซ่อมบำรุงกับแจ้งเตือนตามรอบ** ยังไม่เริ่ม จะเป็น `V7__maintenance.sql`
   (V3 ถึง V6 ถูกใช้ไปแล้ว เลข V6 เป็นของ `V6__tenant_contact_fields.sql`)
   ระหว่างนี้ `GET /api/rooms` ส่ง `openMaintenanceCount` เป็น `0` กับ `openMaintenanceTitle` เป็น `null`
   ไว้ก่อน รูปร่าง JSON จะได้ครบตามสัญญา API ตั้งแต่ตอนนี้ พอมีตารางใบแจ้งซ่อมค่อยเติมค่าจริง
6. **integration test กับ e2e** ยังไม่มี มีแต่ unit test
7. **deploy ขึ้น k8s อัตโนมัติ** ตอนนี้ apply มือ ต้องมีก่อนเดดไลน์ 17 ต.ค.
