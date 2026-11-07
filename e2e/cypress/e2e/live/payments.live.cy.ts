import {
  api,
  newThaiNationalId,
  normalizeText,
  onCleanup,
  pollUntil,
  runCleanups,
  todayInBangkok,
  uniqueName,
} from '../../support/helpers'

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

  /*
    SSK-155 — แก้ใบแจ้งหนี้ที่ยังไม่จ่ายได้ และยอดต้องคิดใหม่ด้วยอัตราที่ล็อกไว้ในใบเดิม

    ชั้นล่างคุมกฎไว้แล้ว (ReceiptServiceTest: แก้ใบ PAID ไม่ได้, คิดยอดจากอัตรา snapshot, เดือนในอนาคต)
    เคสนี้พิสูจน์แค่ว่าปุ่ม Edit บนหน้าจอ → PUT /api/receipts/{id} → PostgreSQL ต่อกันจริง
    และปุ่มหายไปเมื่อใบจ่ายแล้ว จึงไม่ฝังอัตราค่าไฟไว้ในเทส อ่านจากใบเองแล้วคิดยอดที่ควรเป็น

    ใช้ใบของเทสเอง ไม่แตะใบตั้งต้นของสมชาย (PAYMENT-001 ใช้อยู่) ห้อง 210 ข้อมูลตั้งต้นไม่ได้ใช้
    เก็บกวาด: ใบเสร็จลบไม่ได้โดยตั้งใจ จึงกดรับชำระให้ใบไม่ค้างใน Pending Collections แล้วปิดสัญญาคืนห้อง
    ผู้เช่า "QA Invoice ..." ค้างอยู่ในฐานข้อมูลเหมือนเคสสัญญา (ผู้เช่าที่มีประวัติสัญญาลบไม่ได้)
  */
  it('E2E-LIVE-PAYMENT-002: Editing a pending invoice recalculates it with its locked rates and paid invoices lose the Edit button', () => {
    cy.signInLive()

    const unit = '210'
    const tenantName = uniqueName('QA Invoice')
    const today = todayInBangkok()

    api<Array<{ id: number; roomNumber: string; status: string }>>('GET', '/api/rooms').then((rooms) => {
      const room = rooms.body.find((r) => r.roomNumber === unit)
      expect(room, `ไม่เจอห้อง ${unit}`).to.exist
      expect(
        room?.status,
        `ห้อง ${unit} ต้องว่างก่อนเริ่ม ถ้ามีสัญญาของ "QA Invoice ..." ค้าง ให้ Check Out ที่ Dashboard ก่อน`,
      ).to.eq('AVAILABLE')

      api<{ id: number }>('POST', '/api/tenants', {
        fullName: tenantName,
        nationalId: newThaiNationalId(),
        phone: '089-123-4567',
      }).then((tenant) => {
        expect(tenant.status, 'สร้างผู้เช่าของเทสไม่สำเร็จ').to.eq(201)

        api<{ id: number }>('POST', '/api/leases', {
          roomId: room?.id,
          tenantId: tenant.body.id,
          startDate: today,
          billingCycle: 'MONTHLY',
        }).then((lease) => {
          expect(lease.status, 'สร้างสัญญาของเทสไม่สำเร็จ').to.eq(201)
          onCleanup(() => api('POST', `/api/leases/${lease.body.id}/terminate`, { endDate: today }))

          api<ReceiptJson>('POST', '/api/receipts', {
            leaseId: lease.body.id,
            billingMonth: today.slice(0, 7),
            electricUnits: 100,
            waterUnits: 10,
          }).then((created) => {
            expect(created.status, 'ออกใบแจ้งหนี้ของเทสไม่สำเร็จ').to.eq(201)
            const before = created.body
            // ทำงานย้อนลำดับ: รับชำระก่อน แล้วค่อยปิดสัญญา ใบที่จ่ายแล้วรับชำระซ้ำได้ 409 ซึ่งไม่เป็นไร
            onCleanup(() => api('POST', `/api/receipts/${before.id}/pay`, { paymentMethod: 'QA cleanup' }))

            const electricBefore = itemOf(before, 'Electricity')
            const ratePerUnit = electricBefore.amount / 100
            const expectedTotal = before.totalAmount + 20 * ratePerUnit

            cy.findByRole('link', { name: 'Payments' }).click()
            invoiceRow(tenantName).should('contain.text', before.receiptNo).and('contain.text', 'Pending')

            cy.findByRole('button', { name: `Edit invoice for ${tenantName}` }).click()
            cy.intercept({ method: 'PUT', pathname: /^\/api\/receipts\/\d+$/ }).as('updateReceipt')
            cy.findByRole('dialog', { name: 'Edit Payment' }).within(() => {
              cy.findByLabelText(/Electric usage/).clear().type('120')
              cy.findByRole('button', { name: 'Save Changes' }).click()
            })
            cy.wait('@updateReceipt').its('response.statusCode').should('eq', 200)
            cy.findByRole('dialog', { name: 'Edit Payment' }).should('not.exist')

            // รีโหลดทั้งหน้า ค่าที่เห็นหลังจากนี้ต้องมาจากฐานข้อมูล
            cy.reload()
            invoiceRow(tenantName).should('contain.text', before.receiptNo).and('contain.text', money(expectedTotal))

            api<ReceiptJson>('GET', `/api/receipts/${before.id}`).then((after) => {
              expect(after.body.receiptNo, 'เลขที่ใบต้องเท่าเดิม').to.eq(before.receiptNo)
              expect(itemOf(after.body, 'Electricity').usageValue).to.eq(120)
              expect(after.body.totalAmount, 'ยอดใหม่ต้องคิดด้วยอัตราเดิมของใบ').to.be.closeTo(expectedTotal, 0.01)
            })

            // ใบที่จ่ายแล้วต้องไม่มีปุ่มแก้ (backend ตอบ 409 อยู่แล้ว เช็คว่าหน้าจอไม่เปิดทางให้)
            api('POST', `/api/receipts/${before.id}/pay`, { paymentMethod: 'QA E2E' })
              .its('status')
              .should('eq', 200)
            cy.reload()
            invoiceRow(tenantName).should('contain.text', 'Paid')
            cy.findByRole('button', { name: `Edit invoice for ${tenantName}` }).should('not.exist')
          })
        })
      })
    })
  })
})

interface ReceiptJson {
  id: number
  receiptNo: string
  status: 'PENDING' | 'PAID'
  totalAmount: number
  items: Array<{ item: string; usageValue: number | null; amount: number }>
}

function itemOf(receipt: ReceiptJson, name: string) {
  const line = receipt.items.find((i) => i.item === name)
  if (line === undefined) throw new Error(`ใบ ${receipt.receiptNo} ไม่มีรายการ ${name}`)
  return line
}

/** ยอดเงินแบบที่ตาราง Payments แสดง เช่น 4,050.00 */
function money(amount: number): string {
  return amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** ค้นด้วยชื่อผู้เช่าก่อนเสมอ ตารางมีใบของคนอื่นปนอยู่ */
function invoiceRow(tenantName: string) {
  cy.findByPlaceholderText('Search by Tenant or Unit...').clear().type(tenantName)
  return cy.findAllByRole('row').filter((_, row) => (row.textContent ?? '').includes(tenantName)).first()
}
