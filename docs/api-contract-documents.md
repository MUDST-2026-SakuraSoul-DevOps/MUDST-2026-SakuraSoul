# สัญญา API ของไฟล์แนบและเอกสารสแกน (Phase 2)

เอกสารนี้ครอบการ์ด SSK-161 (ที่เก็บไฟล์กลาง) และ SSK-172 (คลังเอกสารสแกน)
หน้า Documents และป็อปอัปอัปโหลดทำเสร็จแล้ว แต่ไฟล์จริงอยู่แค่ในหน่วยความจำของเบราว์เซอร์ (`fileCache` ใน `frontend/src/domain/documents.ts`)
ที่ส่งไป backend มีแค่ชื่อกับหมวด รีเฟรชหน้าแล้วไฟล์หาย และเปิดจากเครื่องอื่นไม่ได้
เอกสารนี้เขียน **ก่อน** ฝั่ง Spring ลงมือ เพื่อให้หน้าเว็บเปลี่ยนไปส่งไฟล์จริงได้พร้อมกับที่ backend ทำ

**สถานะ:** ฝั่ง Spring ยังไม่ได้ทำ วางไว้เป็น migration V23 หลังการ์ดฝั่งการเงิน
endpoint กับกฎในเอกสารนี้ถือเป็นข้อตกลงแล้ว ถ้าตอนทำ backend ต้องปรับ จะแก้เอกสารนี้ใน PR เดียวกับโค้ด

## ไฟล์เก็บที่ไหน

ไฟล์เก็บใน PostgreSQL เป็น `bytea` (ตาราง `attachment`) ไม่ใช่บนดิสก์ของ pod
- backend รันสอง pod บน k8s ไฟล์ที่เขียนลงดิสก์ของ pod หนึ่ง อีก pod มองไม่เห็น และหายเมื่อ pod ถูกสร้างใหม่
- volume ร่วมแบบ ReadWriteMany ไม่มีใน minikube ของวิชานี้
- ไฟล์จำกัดที่ 5 MB จำนวนไม่กี่ร้อยไฟล์ อยู่ในฐานข้อมูลได้สบาย และ backup ไปพร้อมข้อมูลอื่นด้วยคำสั่งเดียว

โค้ดเข้าถึงไฟล์ผ่าน interface `AttachmentStore` ถ้าวันหนึ่งย้ายไป object storage แก้ที่เดียว

## กฎของไฟล์

| เรื่อง | กฎ |
| --- | --- |
| ชนิดที่รับ | PDF, PNG, JPEG เท่านั้น **ตรวจจากเนื้อไฟล์ (magic bytes)** ไม่เชื่อนามสกุลหรือ `Content-Type` ที่เบราว์เซอร์ส่งมา ไฟล์ `.exe` ที่เปลี่ยนชื่อเป็น `.png` ถูกปฏิเสธ |
| ขนาด | ไม่เกิน 5 MB ต่อไฟล์ (5 x 1024 x 1024 bytes) |
| ชื่อไฟล์ | ตัด path ที่ติดมา (`C:\fakepath\…`, `../`) ตัดอักขระควบคุม และยาวไม่เกิน 150 ตัว ชื่อที่เหลือว่างเปลี่ยนเป็น `file` |
| ความครบถ้วน | เก็บ SHA-256 ของไฟล์ตอนอัปโหลด ตอบกลับไปด้วยให้เทียบได้ว่าไฟล์ที่ดาวน์โหลดเป็นไฟล์เดียวกัน |
| สิทธิ์ | ต้องล็อกอินทุก endpoint รวม URL ดาวน์โหลด เปิดลิงก์ตรงโดยไม่ล็อกอินได้ 401 |

## ไฟล์แนบ (SSK-161)

ไฟล์แนบผูกกับเจ้าของหนึ่งราย คือสัญญา ใบแจ้งซ่อม ใบเสร็จ หรือการชำระเงิน

| Method | Path | ทำอะไร |
| --- | --- | --- |
| POST | `/api/attachments` | อัปโหลดไฟล์ (multipart) ตอบ 201 |
| GET | `/api/attachments?ownerType=&ownerId=` | รายการไฟล์แนบของเจ้าของรายหนึ่ง ใหม่สุดก่อน ไม่มีตัวไฟล์ |
| GET | `/api/attachments/{id}/content` | ตัวไฟล์ (ทั้งไฟล์แนบและไฟล์ของเอกสารสแกน) |
| DELETE | `/api/attachments/{id}` | ลบ ตอบ 204 |

ไฟล์ของเอกสารสแกน (หัวข้อถัดไป) เก็บในที่เดียวกัน แต่เป็นของเอกสาร ไม่ใช่ไฟล์แนบลอย ๆ
- **ไม่โผล่** ใน `GET /api/attachments` ให้ดูผ่าน `GET /api/documents`
- ลบผ่าน `DELETE /api/attachments/{id}` ไม่ได้ (409) ต้องลบที่ตัวเอกสาร เอกสารจะได้ไม่เหลือแต่ข้อมูลที่ไม่มีไฟล์

### POST /api/attachments

multipart/form-data สามช่อง
- `file` คือตัวไฟล์
- `ownerType` เป็นหนึ่งใน `LEASE`, `MAINTENANCE_TICKET`, `RECEIPT`, `PAYMENT`
- `ownerId` คือ id ของเจ้าของ ต้องมีอยู่จริง

ตอบกลับ

```json
{
  "id": 7,
  "ownerType": "PAYMENT",
  "ownerId": 31,
  "fileName": "slip-1201.jpg",
  "contentType": "image/jpeg",
  "sizeBytes": 184320,
  "sha256": "9f2c…",
  "uploadedAt": "2026-12-01T03:13:02.481Z",
  "uploadedBy": "admin",
  "contentUrl": "/api/attachments/7/content"
}
```

`id` ออกโดย server หน้าเว็บต้องใช้ค่านี้ ห้ามตั้งเอง
ตอนนี้หน้าเว็บตั้ง id เองด้วย `max + 1` ถ้าสองเครื่องอัปโหลดพร้อมกันจะได้ id ซ้ำ แล้วกดลบใบหนึ่งไปลบอีกใบ

### GET /api/attachments/{id}/content

- `Content-Type` ตามชนิดที่ตรวจได้จริงตอนอัปโหลด
- `X-Content-Type-Options: nosniff` กันเบราว์เซอร์เดาชนิดเองแล้วรันไฟล์เป็นอย่างอื่น
- `Content-Disposition: inline` สำหรับ PDF กับรูป ให้เปิดดูในแท็บได้ พร้อม `filename` ที่ใส่ชื่อภาษาไทยได้
- `Cache-Control: private, no-store` เพราะเป็นเอกสารส่วนบุคคล

### DELETE /api/attachments/{id}

ลบแบบ soft delete คือทำเครื่องหมายว่าใครลบเมื่อไหร่ แล้วไฟล์หายจากรายการและดาวน์โหลดไม่ได้อีก (404)
แต่ร่องรอยยังอยู่ในฐานข้อมูลตามที่ SSK-172 ขอ

## เอกสารสแกน (SSK-172)

เอกสารสแกนคือไฟล์แนบที่มีข้อมูลบอกว่าเป็นเอกสารอะไร ของใคร สแกนวันไหน ใช้ที่เก็บไฟล์เดียวกับหัวข้อข้างบน

| Method | Path | ทำอะไร |
| --- | --- | --- |
| POST | `/api/documents` | อัปโหลดเอกสาร (multipart) ตอบ 201 |
| GET | `/api/documents` | ค้นและแสดงรายการ ใหม่สุดก่อน |
| DELETE | `/api/documents/{id}` | ลบแบบ soft delete ตอบ 204 |

### POST /api/documents

multipart/form-data
- `file` คือตัวไฟล์ (กฎเดียวกับไฟล์แนบ)
- `type` เป็นหนึ่งใน `CONTRACT_SCAN`, `MAINTENANCE_REPORT`, `RECEIPT_SCAN`
  หมวดในหน้าเว็บตอนนี้ `'Contract'`, `'Maintenance report'`, `'Receipt'` ตรงกับสามค่านี้ตามลำดับ
- `scanDate` เป็น `YYYY-MM-DD` บังคับ ห้ามเป็นวันในอนาคต
- `description` ไม่บังคับ ไม่เกิน 200 ตัว
- เจ้าของ ส่งมา **หนึ่งช่องพอดี** จาก `leaseId`, `ticketId`, `receiptId`
  ใบแจ้งซ่อมที่ปิดงานแล้ว (DONE) ยังแนบรายงานได้

ตอบกลับ

```json
{
  "id": 3,
  "type": "MAINTENANCE_REPORT",
  "description": "รายงานซ่อมแอร์ห้อง 203",
  "scanDate": "2026-11-28",
  "owner": {
    "kind": "MAINTENANCE_TICKET",
    "id": 41,
    "roomId": 15,
    "roomNumber": "203",
    "tenantId": null,
    "tenantName": null
  },
  "fileName": "aircon-203.pdf",
  "contentType": "application/pdf",
  "sizeBytes": 532114,
  "sha256": "41aa…",
  "uploadedAt": "2026-11-28T08:40:11.002Z",
  "uploadedBy": "admin",
  "attachmentId": 12,
  "contentUrl": "/api/attachments/12/content"
}
```

`id` คือเลขของเอกสาร ส่วน `attachmentId` คือเลขของไฟล์ในที่เก็บกลาง สองเลขนี้คนละตัวกัน
ลบหรืออ้างถึงเอกสารให้ใช้ `id` เปิดไฟล์ให้ใช้ `contentUrl`

`owner` รวมเลขห้องและชื่อผู้เช่าให้แล้ว หน้าเว็บไม่ต้องเก็บห้องหรือชื่อเป็นข้อความเองแบบตอนนี้
ใบแจ้งซ่อมไม่มีผู้เช่าผูกอยู่ `tenantId` กับ `tenantName` จึงเป็น `null`

### GET /api/documents

query ไม่บังคับทุกตัว: `type`, `roomId`, `tenantId`, `from`, `to` (`YYYY-MM-DD` เทียบกับ `scanDate`), `q`
- `q` ค้นแบบมีคำนั้นอยู่ (ไม่สนตัวพิมพ์ใหญ่เล็ก) ในคำอธิบาย ชื่อไฟล์ เลขห้อง และชื่อผู้เช่า
- `roomId` กับ `tenantId` ค้นข้ามเจ้าของได้ เช่น `roomId` ได้ทั้งสัญญาสแกนและรายงานซ่อมของห้องนั้น
- เรียง `scanDate` ใหม่สุดก่อน วันเดียวกันเรียงตามเวลาอัปโหลด
- เอกสารที่ถูกลบไม่แสดง

### DELETE /api/documents/{id}

soft delete เก็บว่าใครลบเมื่อไหร่ ไฟล์ดาวน์โหลดไม่ได้อีก
ข้อความในหน้าเว็บที่บอกว่า "This action cannot be undone." ยังถูกในมุมผู้ใช้ เพราะไม่มีปุ่มกู้คืนในเฟสนี้
แต่ไม่ได้หมายความว่าข้อมูลหายจากฐานข้อมูล

## รหัสสถานะและข้อความ error

| สถานะ | เมื่อไหร่ | `detail` |
| --- | --- | --- |
| 400 | ไม่ส่งไฟล์มา หรือไฟล์ว่าง | `Please choose a file` |
| 400 | ไม่ส่ง `ownerType` หรือไม่ใช่สี่ค่าที่กำหนด หรือไม่ส่ง `ownerId` | `Choose what this file belongs to` |
| 400 | `type` ของเอกสารผิด (ทั้งตอนอัปโหลดและตอนค้น) | `Document type must be CONTRACT_SCAN, MAINTENANCE_REPORT or RECEIPT_SCAN` |
| 400 | `from` / `to` ของการค้นเอกสารผิดรูปแบบหรือกลับด้าน | `from and to must be YYYY-MM-DD with from not after to` |
| 400 | ไม่ส่ง `scanDate` หรือผิดรูปแบบ | `Please choose the scan date (YYYY-MM-DD)` |
| 400 | `scanDate` เป็นวันในอนาคต | `The scan date cannot be in the future` |
| 400 | ส่งเจ้าของของเอกสารมาไม่ครบหนึ่งช่องพอดี | `Choose one lease, ticket or receipt for this document` |
| 400 | `description` ยาวเกิน 200 ตัว | `The description must be 200 characters or fewer` |
| 401 | ไม่ได้ล็อกอิน รวมถึงเปิด URL ของไฟล์ตรง ๆ | `Please sign in` (เหมือน endpoint อื่นทั้งระบบ) |
| 404 | ไม่พบเจ้าของ | `No lease with id 999` (หรือ ticket, receipt, payment) |
| 404 | ไม่พบไฟล์แนบหรือเอกสาร หรือถูกลบไปแล้ว | `No attachment with id 999` / `No document with id 999` |
| 409 | ลบไฟล์ของเอกสารสแกนผ่าน `/api/attachments` | `This file belongs to a document. Delete the document instead` |
| 413 | ไฟล์ใหญ่เกิน 5 MB | `The file is larger than 5 MB` |
| 415 | เนื้อไฟล์ไม่ใช่ PDF, PNG หรือ JPEG | `Only PDF, PNG and JPEG files are allowed` |

ลำดับการตรวจตอนอัปโหลด: ไม่มีไฟล์ (400) → ค่าอื่นในฟอร์ม (400) → ไม่พบเจ้าของ (404) → ขนาด (413) → ชนิดไฟล์ (415)

เพดาน upload ของ nginx (7 MB) กับของ Spring ตั้งไว้สูงกว่า 5 MB
- ไฟล์ 4 MB ผ่านถึง backend ได้
- ไฟล์ระหว่าง 5 ถึง 7 MB ได้ 413 พร้อม `detail` ด้านบน
- ไฟล์ที่เกิน 7 MB ถูก nginx ตัดก่อนถึง backend ได้ 413 ที่ body เป็นหน้า HTML ไม่ใช่ JSON
  หน้าเว็บจึงควรเช็คขนาดก่อนส่งอยู่แล้ว และรับมือ 413 ที่ไม่มี `detail` ด้วยข้อความของตัวเอง

## สิ่งที่หน้าเว็บต้องเปลี่ยน

**ทำครบแล้ว** เอกสารสแกนใน #227 และสลิปการชำระใน SSK-163 (`RecordPaymentDialog` แนบตอนบันทึก, `PaymentSlipDialog` ดูหรือแนบภายหลัง)
หัวข้อนี้เก็บไว้เป็นบันทึกว่าหน้าเว็บเปลี่ยนอะไรไปบ้าง

ไฟล์ที่เกี่ยวข้องอยู่ใน `frontend/src/domain/documents.ts`, `api/client.ts`, `pages/DocumentsPage.tsx`,
`dialogs/UploadDocumentDialog.tsx`, `dialogs/UploadContractDialog.tsx`, `dialogs/ViewDocumentDialog.tsx`
และ `dialogs/RecordPaymentDialog.tsx` กับ `dialogs/PaymentSlipDialog.tsx` (สลิป)

1. **ส่งไฟล์จริง** ด้วย multipart ไปที่ `POST /api/documents` (เอกสารสแกน) หรือ `POST /api/attachments` (สลิปการชำระ)
   เลิกใช้ `fileCache` และเลิกเก็บสลิปเป็น base64 ใน localStorage
2. **ใช้ id จาก server** ลบการตั้ง id ด้วย `max + 1` และรอผลของ API ก่อนอัปเดตหน้าจอ
   ตอนนี้เรียก API แบบไม่รอและไม่จัดการ error
3. **เจ้าของเป็น id** ให้ผู้ใช้เลือกสัญญา ใบแจ้งซ่อม หรือใบเสร็จ แทนการพิมพ์เลขห้องกับชื่อผู้เช่าเป็นข้อความ
4. **เพดาน 5 MB และสามชนิดไฟล์** ตอนนี้หน้าเว็บรับ 10 MB และตรวจจาก `file.type` อย่างเดียว
   เพดานเฉพาะของสลิป (350 KB / 10 MB / 500 KB) และการบีบรูปเป็น JPEG เลิกได้ เพราะไม่ต้องยัดลง localStorage แล้ว
5. **ค้นหา** ส่งคำค้นเป็น `q` ไปที่ API แทนการกรองในเบราว์เซอร์ และใช้วันที่รูปแบบ `YYYY-MM-DD` อย่างเดียว
6. **OCR (SSK-175)** อย่าส่งเลขประจำตัวประชาชนที่อ่านได้ไปเก็บในเอกสาร เอกสารมีเพียงคำอธิบายสั้น ๆ

## ที่ยังไม่มีในเฟสนี้

- ปุ่มกู้คืนเอกสารที่ลบ และหน้าดูประวัติการลบ ข้อมูลอยู่ในฐานข้อมูลแล้วแต่ยังไม่มี endpoint
- สแกนไวรัสหรือแปลงไฟล์ (เช่นบีบ PDF) เก็บไฟล์ตามที่ส่งมาหลังผ่านการตรวจชนิดและขนาด
- หลายเวอร์ชันของไฟล์เดียวกัน อัปโหลดใหม่คือไฟล์ใหม่
- OCR ฝั่ง server
