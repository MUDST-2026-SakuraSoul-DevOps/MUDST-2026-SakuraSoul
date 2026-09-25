import { expect, test } from '@playwright/test'
import { signInLive } from './signInLive'

/*
  SSK-143 — ใบแจ้งหนี้ที่กดส่งจากหน้า Payments ต้องไปถึงกล่องของ Mailpit จริง

  ชุด mock-api เช็คได้แค่ว่าหน้าเว็บเรียก API ถูก ชุดนี้ยิงถึง backend จริง แล้วเปิดกล่องของ Mailpit
  ผ่าน API ของมันเอง (http://localhost:8025 ซึ่ง docker-compose.yml ผูกไว้กับเครื่องนี้เท่านั้น)
  ถ้าเจออีเมลที่หัวเรื่องมีเลขใบนั้นพร้อมไฟล์แนบ แปลว่า backend ต่อ SMTP ได้จริงและแนบถูกใบ
  ไม่ต้องกลัวอีเมลหลุดออกไปข้างนอก Mailpit ใน stack ไม่ได้ตั้ง relay ไว้

  ต้องเปิด stack ด้วย docker compose ที่มี service mailpit ด้วย เทสนี้ใช้ใบค้างของสมชายที่ DevDataSeeder
  ออกไว้ให้ (somchai.j@example.com) การส่งซ้ำเป็นเรื่องปกติของระบบ จึงไม่ต้องคืนค่าอะไรหลังเทส
*/

const MAILPIT = 'http://localhost:8025'
const SOMCHAI_EMAIL = 'somchai.j@example.com'

interface MailpitMessage {
  Subject: string
  Created: string
  Attachments: number
}

test('E2E-LIVE-PAYMENT-001: An invoice sent by email lands in the Mailpit inbox with its PDF', async ({
  page,
  request,
}) => {
  await signInLive(page)
  // เผื่อนาฬิกาของ container กับเครื่องนี้เหลื่อมกันเล็กน้อย อีเมลที่เก่ากว่านี้ไม่ใช่ของรอบนี้
  const startedAt = Date.now() - 60_000

  await page.getByRole('link', { name: 'Payments' }).click()
  // สมชายมีสองใบ ใบเดือนก่อนจ่ายแล้ว ใบเดือนนี้ยังค้าง เลือกใบที่ยังค้าง
  const row = page.getByRole('row', { name: /สมชาย ใจดี/ }).filter({ hasText: 'Pending' }).first()
  await expect(row).toBeVisible()
  const receiptNo = (await row.textContent())?.match(/RC-\d{4}-\d{4}/)?.[0]
  expect(receiptNo, 'แถวของใบค้างต้องมีเลขที่ใบเสร็จ').toBeTruthy()
  await row.getByRole('checkbox').check()

  await page.getByRole('button', { name: 'Send Invoices (1)' }).click()
  const dialog = page.getByRole('dialog', { name: 'Send Invoices' })
  await expect(dialog.getByText(`To ${SOMCHAI_EMAIL}`)).toBeVisible()
  await dialog.getByRole('button', { name: 'Send 1 Invoice' }).click()
  await expect(dialog.getByRole('status')).toHaveText('Sent 1 of 1')
  await dialog.getByRole('button', { name: 'Done' }).click()
  await expect(dialog).toBeHidden()

  // Mailpit รับอีเมลแล้วเก็บลงฐานของมันเอง รอสักครู่ได้ แต่ต้องเจอภายในเวลาที่ poll
  await expect
    .poll(async () => {
      const response = await request.get(`${MAILPIT}/api/v1/search`, {
        params: { query: `to:${SOMCHAI_EMAIL}` },
      })
      const { messages } = (await response.json()) as { messages: MailpitMessage[] }
      return messages.some(
        (message) =>
          message.Subject.includes(receiptNo as string) &&
          message.Attachments === 1 &&
          Date.parse(message.Created) >= startedAt,
      )
    })
    .toBe(true)
})
