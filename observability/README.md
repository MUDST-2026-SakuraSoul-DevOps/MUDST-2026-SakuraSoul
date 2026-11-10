# Observability (SSK-182)

ชุด Grafana สำหรับดู metric, log และ trace ของ Sakura Soul ทุกอย่างรันในเครื่องหรือใน cluster ของเราเอง ไม่ใช้บริการภายนอก

| ตัว | ทำอะไร | พอร์ต (ในเครื่อง) |
| --- | --- | --- |
| Grafana | หน้าจอรวม metric/log/trace ดู dashboard ที่นี่ | http://localhost:3000 |
| Prometheus | เก็บ metric จาก backend ทุก 15 วินาที | http://localhost:9090 |
| Loki | เก็บ log | ภายในเท่านั้น (3100) |
| Tempo | เก็บ trace (รับ OTLP) | ภายในเท่านั้น (4317 gRPC, 4318 HTTP) |
| Alloy | เก็บ log ของ container ส่งเข้า Loki | ภายในเท่านั้น |

ทุกพอร์ตผูกกับ `127.0.0.1` เปิดดูได้จากเครื่องนี้เท่านั้น

## เปิดบน docker compose

1. ตั้ง `.env` (ก๊อปจาก `.env.example`) ให้มี `GRAFANA_ADMIN_PASSWORD` และ `APP_METRICS_PASSWORD`
2. เปิดทั้งแอปและชุด observability พร้อมกัน

```bash
docker compose -f docker-compose.yml -f docker-compose.observability.yml up -d --build
```

3. เปิด http://localhost:3000 ล็อกอินด้วย `admin` กับ `GRAFANA_ADMIN_PASSWORD` แล้วเปิดโฟลเดอร์ **Sakura Soul** จะเห็น dashboard ที่ provision จากไฟล์ใน `observability/grafana/dashboards/` ทันที ไม่ต้องตั้งค่าเพิ่มใน UI

ล้างข้อมูลทั้งหมดแล้วขึ้นใหม่: `docker compose -f docker-compose.yml -f docker-compose.observability.yml down -v`

## เปิดบน Kubernetes (minikube)

ไฟล์ config อยู่ที่เดียวคือโฟลเดอร์นี้ ส่วน `k8s/observability/` ดึงไปทำ ConfigMap ผ่าน kustomize จึงต้องปิดข้อจำกัดการอ่านไฟล์นอกโฟลเดอร์ (`kubectl apply -k` ทำไม่ได้)

```bash
kubectl apply -k k8s/                 # ชุดแอป (ต้องขึ้นก่อน เพราะมี Secret ของ metric)
kubectl kustomize --load-restrictor LoadRestrictionsNone k8s/observability | kubectl apply -f -
minikube service grafana -n sakura-soul --url
```

รหัสผ่านใน manifest เป็นแค่ที่วางไว้ (`change-me-...`) ต้องเปลี่ยนก่อน apply จริงทุกครั้ง `deploy.yml` สุ่มให้เองใน CI

## การปกป้อง /actuator/prometheus

- endpoint นี้ต้องใช้ HTTP Basic (ผู้ใช้ `metrics` รหัสจาก `APP_METRICS_PASSWORD`) ถ้าไม่ตั้งรหัส จะเข้าไม่ได้เลย
- nginx ของ frontend เปิดแค่ `/actuator/health/**` กับ `/actuator/info` ที่เหลือคืน 404 จึงเข้า `/actuator/prometheus` ผ่านหน้าเว็บไม่ได้
- Prometheus อ่านรหัสจากตัวแปร `METRICS_PASSWORD` เขียนลงไฟล์ตอนสตาร์ต แล้วใช้ `password_file` ในการ scrape (ไม่มีรหัสในไฟล์ config)

## ไฟล์สำคัญ

```
observability/
  prometheus/prometheus.compose.yml   scrape สำหรับ compose
  prometheus/prometheus.k8s.yml       scrape สำหรับ k8s (หา pod ของ backend ผ่าน DNS ของ headless service)
  loki/loki.yaml                      single binary เก็บข้อมูลบน disk ไว้ 72 ชั่วโมง
  tempo/tempo.yaml                    รับ OTLP เก็บบน disk ไว้ 72 ชั่วโมง
  alloy/config.compose.alloy          เก็บ log จาก Docker socket
  alloy/config.k8s.alloy              เก็บ log ผ่าน Kubernetes API
  grafana/provisioning/               datasource และตัวชี้ dashboard
  grafana/dashboards/*.json           dashboard เป็นไฟล์ (แก้ใน UI แล้ว export กลับมาไว้ที่นี่)
```

## Trace ด้วย OpenTelemetry (SSK-186)

- backend ส่ง span เป็น OTLP/HTTP เข้า Tempo ตามตัวแปร `OTEL_TRACES_ENDPOINT` (compose กับ k8s ตั้งเป็น `http://tempo:4318/v1/traces`
  ถ้ารันแอปเองบนเครื่องโดยไม่มี Tempo ค่าตั้งต้นคือ `http://localhost:4318/v1/traces` ส่งไม่ได้ก็ทิ้ง span แอปทำงานปกติ)
- `TRACING_SAMPLING_PROBABILITY` ปรับอัตราการเก็บ ค่าตั้งต้น 1.0 (เก็บทุกคำขอ เพราะทราฟฟิกหอพักน้อย)
- span ที่มี: คำขอ HTTP, SQL (`opentelemetry-jdbc` ห่อ DataSource), `pdf.render`, `receipt.email.send` และงาน `@Scheduled`
  ไม่มี span ของ `/actuator/**` และไม่ส่ง span ของ SQL ที่ไม่มี span แม่ (เช่น SQL ตอน Prometheus scrape หรือตอนสตาร์ตแอป)
- **ข้อมูลส่วนบุคคล:** SQL ใน span แทนค่าพารามิเตอร์เป็น `?` และตั้ง `logServerErrorDetail=false` ให้ข้อความ error ของ PostgreSQL ไม่มีบรรทัด
  `Detail:` ที่ใส่ค่าจริงในแถว (เทส `JdbcTracingPrivacyTest`) span ของ PDF กับอีเมลไม่ใส่อีเมลหรือชื่อผู้เช่า
- **ข้อแลกเปลี่ยนที่ตั้งใจ:**
  - คำขอ `/actuator/**` ถูกตัดออกจาก observation ทั้งก้อน เลยหายจาก metric `http_server_requests_*` ด้วย
    กราฟคำขอต่อวินาทีใน System Health จึงนับเฉพาะคำขอของผู้ใช้จริง และเป็น 0 ได้ตอนไม่มีคนใช้เว็บ
  - ปิด log ของตัวส่ง span (`io.opentelemetry.exporter`) เพราะตอน Tempo ล่มมันเขียน ERROR พร้อม stack trace ทุกครั้งจนกราฟ ERROR ของ
    System Health ดูเหมือนระบบพัง ผลคือถ้าตั้งปลายทางผิด จะเงียบ ต้องดูว่า trace ไม่ขึ้นใน Tempo (ด่านตรวจใน `deploy.yml` จับได้)
- ดู trace: Grafana → Explore → Tempo (หน้า Drilldown → Traces ใช้ไม่ได้เพราะไม่ได้เปิด `metrics_generator`)
  หน้า Search ใส่ `{ resource.service.name = "apartment" && kind = server }` เพื่อดูเฉพาะคำขอ HTTP

## ที่ยังเป็นงานของการ์ดอื่น

- SSK-183: metric เชิง monitoring เพิ่ม และ dashboard สุขภาพระบบ
- SSK-184: metric เชิง business และ dashboard
- SSK-185: log แบบ JSON ที่มี trace id
