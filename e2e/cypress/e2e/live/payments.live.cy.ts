import { normalizeText, pollUntil, runCleanups } from '../../support/helpers'

/*
  SSK-143 — ใบแจ้งหนี้ที่กดส่งจากหน้า Payments ต้องไปถึงกล่องของ Mailpit จริง

  ชุด mock-api เช็คได้แค่ว่าหน้าเว็บเรียก API ถูก ชุดนี้ยิงถึง backend จริง แล้วเปิดกล่องของ Mailpit
  ผ่าน API ของมันเอง (http://127.0.0.1:8025 ซึ่ง docker-compose.yml ผูกไว้กับเครื่องนี้เท่านั้น)
  ถ้าเจออีเมลที่หัวเรื่องมีเลขใบนั้นพร้อมไฟล์แนบ แปลว่า backend ต่อ SMTP ได้จริงและแนบถูกใบ
  ไม่ต้องกลัวอีเมลหลุดออกไปข้างนอก Mailpit ใน stack ไม่ได้ตั้ง relay ไว้

  ต้องเปิด stack ด้วย docker compose ที่มี service mailpit ด้วย เทสนี้ใช้ใบค้างของสมชายที่ DevDataSeeder
  ออกไว้ให้ (somchai.j@example.com) การส่งซ้ำเป็นเรื่องปกติของระบบ จึงไม่ต้องคืนค่าอะไรหลังเทส
*/

// ใช้ 127.0.0.1 ไม่ใช้ localhost เพราะ Mailpit ผูกพอร์ตไว้กับ IPv4 อย่างเดียว
// บน Windows ชื่อ localhost อาจชี้ไป ::1 ก่อน แล้วต่อไม่ติด
const MAILPIT = 'http://127.0.0.1:8025'
const SOMCHAI_EMAIL = 'somchai.j@example.com'

interface MailpitMessage {
  Subject: string
  Created: string
  Attachments: number
}

/*
  สมชายมีสองใบ ใบเดือนก่อนจ่ายแล้ว อีกใบยังค้าง เลือกใบที่ยังค้าง

  ต้องรับทั้ง Pending และ Overdue เดิมเขียนว่า Pending อย่างเดียว ซึ่งพังเองตามวันที่
  เพราะป้ายของใบที่ยังไม่จ่ายเปลี่ยนเป็น Overdue เมื่อเลยวันครบกำหนด (paymentStatusOf
  ใน src/domain/billing.ts) ใบที่ DevDataSeeder ออกไว้มีวันครบกำหนดตายตัว พอเวลา
  เดินผ่านไป เทสนี้ก็หาแถวไม่เจอทั้งที่ระบบทำงานถูกทุกอย่าง
  สิ่งที่เทสนี้ต้องการจริง ๆ คือ "ใบที่ยังไม่จ่าย" ไม่ใช่ป้ายใดป้ายหนึ่ง
*/
function unpaidSomchaiRow() {
  return cy
    .findAllByRole('row', { name: /สมชาย ใจดี/ })
    .filter((_, row) => /Pending|Overdue/.test(row.textContent ?? ''))
    .first()
}

describe('payments (live-api)', () => {
  afterEach(runCleanups)

  it('E2E-LIVE-PAYMENT-001: An invoice sent by email lands in the Mailpit inbox with its PDF', () => {
    cy.signInLive()

    cy.then(() => {
      // เผื่อนาฬิกาของ container กับเครื่องนี้เหลื่อมกันเล็กน้อย อีเมลที่เก่ากว่านี้ไม่ใช่ของรอบนี้
      // อ่านเวลาใน cy.then จะได้เป็นเวลาหลังล็อกอินเสร็จจริง ไม่ใช่ตอนที่เทสเพิ่งต่อคิวคำสั่ง
      const startedAt = Date.now() - 60_000

      cy.findByRole('link', { name: 'Payments' }).click()
      unpaidSomchaiRow()
        .should('be.visible')
        .invoke('text')
        .then((rowText) => {
          const receiptNo = rowText.match(/RC-\d{4}-\d{4}/)?.[0] ?? ''
          expect(receiptNo, 'แถวของใบค้างต้องมีเลขที่ใบเสร็จ').to.be.ok
          unpaidSomchaiRow().findByRole('checkbox').check()

          cy.findByRole('button', { name: 'Send Invoices (1)' }).click()
          cy.findByRole('dialog', { name: 'Send Invoices' }).within(() => {
            cy.findByText(`To ${SOMCHAI_EMAIL}`).should('be.visible')
            cy.findByRole('button', { name: 'Send 1 Invoice' }).click()
            cy.findByRole('status').should(($status) => {
              expect(normalizeText($status.text())).to.eq('Sent 1 of 1')
            })
            cy.findByRole('button', { name: 'Done' }).click()
          })
          cy.findByRole('dialog', { name: 'Send Invoices' }).should('not.exist')

          // Mailpit รับอีเมลแล้วเก็บลงฐานของมันเอง รอสักครู่ได้ แต่ต้องเจอภายในเวลาที่ poll
          // เรียกใน cy.then เพื่อให้นับเวลารอตั้งแต่ป็อปอัปปิดแล้วจริง ไม่ใช่ตั้งแต่ตอนต่อคิว
          cy.then(() => {
            pollUntil(
              () =>
                cy
                  .request<{ messages?: MailpitMessage[] }>({
                    url: `${MAILPIT}/api/v1/search`,
                    qs: { query: `to:${SOMCHAI_EMAIL}` },
                    failOnStatusCode: false,
                  })
                  .then((response) =>
                    (response.body.messages ?? []).some(
                      (message) =>
                        message.Subject.includes(receiptNo) &&
                        message.Attachments === 1 &&
                        Date.parse(message.Created) >= startedAt,
                    ),
                  ),
              `ไม่เจออีเมลของใบ ${receiptNo} ที่แนบ PDF ในกล่องของ Mailpit (${MAILPIT})`,
            )
          })
        })
    })
  })
})
