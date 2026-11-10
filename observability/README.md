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

## ที่ยังเป็นงานของการ์ดอื่น

- SSK-183: metric เชิง monitoring เพิ่ม และ dashboard สุขภาพระบบ
- SSK-184: metric เชิง business และ dashboard
- SSK-185: log แบบ JSON ที่มี trace id
- SSK-186: trace ด้วย OpenTelemetry ส่งเข้า Tempo
