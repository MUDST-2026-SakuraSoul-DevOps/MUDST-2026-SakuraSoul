#!/usr/bin/env bash
# ตัวสร้างทราฟฟิกสำหรับเดโม observability (SSK-187)
#
# ทำให้กราฟใน Grafana ขยับระหว่างพรีเซนต์: คำขอปกติ, คำขอที่ error (404/401), การออก PDF, การส่งอีเมล
# และ (ถ้าเปิด --pay) การกดจ่ายใบเสร็จทีละใบ เพื่อให้ตัวเลขรายได้กับหนี้ค้างใน dashboard Business เปลี่ยนให้เห็นสด ๆ
#
# ใช้:
#   observability/demo/traffic.sh                      # ยิงต่อเนื่องจนกด Ctrl+C
#   observability/demo/traffic.sh --rounds 20          # ยิง 20 รอบแล้วหยุด
#   observability/demo/traffic.sh --pay                # กดจ่ายใบเสร็จที่ค้างทีละใบ รอบละหนึ่งใบ
#   observability/demo/traffic.sh --no-email           # ไม่ส่งอีเมล
#
# ตัวแปร (ตั้งผ่าน environment ไม่เขียนรหัสลงไฟล์):
#   BASE_URL        ค่าตั้งต้น http://localhost:5173
#   ADMIN_USERNAME  ค่าตั้งต้น admin
#   ADMIN_PASSWORD  ต้องตั้ง (รหัสเดียวกับ APP_ADMIN_PASSWORD ของ stack ที่ยิงใส่)
#
# ตั้งใจให้ใช้กับเครื่องตัวเองหรือ minikube ในเครื่องเท่านั้น: สคริปต์นี้สร้าง error และกดจ่ายใบเสร็จจริง
# จึงปฏิเสธที่จะรันถ้า BASE_URL ไม่ใช่ localhost / 127.0.0.1 / 192.168.x / 10.x

set -u

BASE_URL="${BASE_URL:-http://localhost:5173}"
ADMIN_USERNAME="${ADMIN_USERNAME:-admin}"
ROUNDS=0
PAY=0
EMAIL=1

while [ $# -gt 0 ]; do
  case "$1" in
    --rounds) ROUNDS="${2:-0}"; shift 2 ;;
    --pay) PAY=1; shift ;;
    --no-email) EMAIL=0; shift ;;
    -h|--help) sed -n '2,22p' "$0"; exit 0 ;;
    *) echo "ไม่รู้จักตัวเลือก: $1" >&2; exit 2 ;;
  esac
done

case "${BASE_URL}" in
  http://localhost*|http://127.0.0.1*|http://192.168.*|http://10.*) ;;
  *) echo "ปฏิเสธ: BASE_URL=${BASE_URL} ไม่ใช่เครื่องในวงเดียวกัน สคริปต์นี้สร้าง error และกดจ่ายใบเสร็จจริง" >&2; exit 2 ;;
esac

if [ -z "${ADMIN_PASSWORD:-}" ]; then
  echo "ต้องตั้ง ADMIN_PASSWORD ก่อน เช่น ADMIN_PASSWORD=... $0" >&2
  exit 2
fi

JAR="$(mktemp)"
trap 'rm -f "${JAR}"' EXIT

login() {
  # ส่งรหัสทาง stdin (--data @-) ไม่ใส่ในอาร์กิวเมนต์ จะได้ไม่โผล่ในรายการ process
  printf '{"username":"%s","password":"%s"}' "${ADMIN_USERNAME}" "${ADMIN_PASSWORD}" |
    curl -s -c "${JAR}" -o /dev/null -w '%{http_code}' -H 'Content-Type: application/json' \
      --data @- "${BASE_URL}/api/auth/login"
}

get() { curl -s -b "${JAR}" -o /dev/null -w '%{http_code}' "${BASE_URL}$1"; }

code="$(login)"
if [ "${code}" != "200" ]; then
  echo "ล็อกอินไม่สำเร็จ (HTTP ${code}) เช็ก BASE_URL กับ ADMIN_PASSWORD" >&2
  exit 1
fi
echo "ล็อกอินแล้ว ยิงใส่ ${BASE_URL} (Ctrl+C เพื่อหยุด)"

round=0
while :; do
  round=$((round + 1))
  summary="รอบ ${round}:"

  # คำขอปกติ: รายการหลักที่แอดมินเปิดดูทุกวัน
  for path in /api/rooms /api/tenants /api/leases /api/receipts /api/maintenance /api/supplies; do
    summary="${summary} $(get "${path}")"
  done

  # ออก PDF ของใบเสร็จใบแรก ๆ ให้ span pdf.render ขึ้นใน Tempo
  summary="${summary} pdf:$(get /api/receipts/1/pdf)"

  # สร้าง error ให้กราฟ 4xx ขยับ: path ที่ไม่มี และคำขอที่ไม่ได้ล็อกอิน
  summary="${summary} 404:$(get /api/receipts/999999)"
  summary="${summary} 401:$(curl -s -o /dev/null -w '%{http_code}' "${BASE_URL}/api/receipts")"

  # ส่งอีเมลใบเสร็จทุก 5 รอบ (ไป Mailpit ไม่ออกนอกเครื่อง) ให้ span receipt.email.send ขึ้น
  if [ "${EMAIL}" = 1 ] && [ $((round % 5)) -eq 1 ]; then
    sent="$(curl -s -b "${JAR}" -o /dev/null -w '%{http_code}' -H 'Content-Type: application/json' \
      -d '{"receiptIds":[1]}' "${BASE_URL}/api/receipts/send")"
    summary="${summary} mail:${sent}"
  fi

  # กดจ่ายใบเสร็จที่ค้างอยู่หนึ่งใบต่อรอบ: รายได้เดือนนี้ขึ้น หนี้ค้างลดลง
  if [ "${PAY}" = 1 ]; then
    pending="$(curl -s -b "${JAR}" "${BASE_URL}/api/receipts?status=PENDING" | grep -oE '"id":[0-9]+' | head -n 1 | cut -d: -f2)"
    if [ -n "${pending}" ]; then
      paid="$(curl -s -b "${JAR}" -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' \
        -d '{"paymentMethod":"CASH"}' "${BASE_URL}/api/receipts/${pending}/pay")"
      summary="${summary} pay#${pending}:${paid}"
    else
      summary="${summary} (ไม่มีใบค้างให้จ่าย)"
    fi
  fi

  echo "${summary}"

  if [ "${ROUNDS}" -gt 0 ] && [ "${round}" -ge "${ROUNDS}" ]; then
    break
  fi
  sleep 2
done
