// ============================== [NOTE] ==============================
// ไฟล์นี้: นำเข้าค่าน้ำค่าไฟจาก CSV กับฐานข้อมูลจริง 1 เคส (SSK-166)
// ชุด: live-api (พอร์ต 4175) — Vite proxy ส่ง /api → Spring Boot :8080 → PostgreSQL จริง ต้องเปิด docker compose ก่อน
// เทส: E2E-LIVE-UNITS-002 อัปโหลด CSV ผ่านหน้าจอ → ค่าลง meter_reading → ฟอร์มออกบิลเติมหน่วยให้ → บิลที่ออกใช้หน่วยนั้น
// เก็บกวาด: ใบเสร็จกับค่ามิเตอร์ลบไม่ได้โดยตั้งใจ จึงรับชำระใบให้ครบแล้วปิดสัญญาคืนห้อง
// ====================================================================

import { api, createQaLease, normalizeText, onCleanup, runCleanups, todayInBangkok } from '../../support/helpers'

/*
  ชุด mock มี E2E-UNITS-004 คุมการกดทั้งสายไว้แล้ว เคสนี้พิสูจน์ส่วนที่ backend จำลองพิสูจน์ไม่ได้:
  ไฟล์ multipart ถึง MeterReadingService จริง ค่าถูกเขียนลง PostgreSQL (ON CONFLICT) แล้วฟอร์มออกบิล
  อ่านกลับมาจาก GET /api/meter-readings ได้ และบิลที่ออกจริงคิดจากหน่วยนั้น

  ค่ามิเตอร์ของ (ห้อง, เดือน) เขียนทับได้แต่ลบไม่ได้ เคสจึงใช้ค่าที่ไม่ซ้ำทุกรอบ (ผูกกับเวลา) และติ๊ก
  "Replace readings that already exist" เมื่อป็อปอัปบอกว่ามีค่าอยู่แล้ว ไม่งั้นรอบที่สองจะนำเข้าไม่ได้เพราะค่าเก่าค้างอยู่

  ห้อง 208 ข้อมูลตั้งต้นไม่ได้ใช้ (209 = PAYMENT-003, 210 = PAYMENT-002, 211/212 = CONTRACT)
*/

interface ReceiptJson {
  id: number
  receiptNo: string
  items: Array<{ item: string; usageValue: number | null }>
}

describe('unitUsageImport (live-api)', () => {
  afterEach(runCleanups)

  it('E2E-LIVE-UNITS-002: A usage CSV is stored in PostgreSQL and the new bill form fills the units from it', () => {
    const unit = '208'
    const month = todayInBangkok().slice(0, 7)
    // ทศนิยมหนึ่งตำแหน่ง ผูกกับเวลา ไม่ซ้ำรอบก่อน (100.0–199.9)
    const electric = (100 + (Date.now() % 1000) / 10).toFixed(1)
    const water = '7'
    const csv = `room_number,month,electric_units,water_units\n${unit},${month},${electric},${water}\n`
    cy.signInLive()

    createQaLease(unit, 'QA Import').then(({ tenantName }) => {
      cy.findByRole('link', { name: 'Usage' }).click()
      cy.findByRole('button', { name: 'By floor or unit' }).click()
      cy.findByRole('button', { name: 'Import usage CSV' }).click()

      const dialog = () => cy.findByRole('dialog')
      dialog().find('input[type=file]').selectFile(
        { contents: Cypress.Buffer.from(csv), fileName: 'qa-usage.csv', mimeType: 'text/csv' },
        { force: true },
      )
      dialog().findByRole('button', { name: 'Review rows' }).click()
      dialog().findByText('1 valid rows · nothing saved yet').should('be.visible')
      // รอบที่สองเป็นต้นไป ห้องกับเดือนนี้มีค่าจากรอบก่อนอยู่แล้ว ต้องเลือกเขียนทับ
      dialog().then(($dialog) => {
        const replace = $dialog.find('input[type=checkbox]')
        if (replace.length > 0) cy.wrap(replace).check()
      })
      cy.intercept({ method: 'POST', pathname: '/api/meter-readings/import' }).as('importCsv')
      dialog().findByRole('button', { name: /^Import 1 rows$/ }).click()
      cy.wait('@importCsv').then(({ request, response }) => {
        expect(response?.statusCode, 'POST /api/meter-readings/import').to.eq(200)
        expect(request.url, 'ขั้นนำเข้าจริงต้องไม่ใช่ dry run').to.contain('dryRun=false')
        expect(response?.body.imported, 'จำนวนแถวที่บันทึก').to.eq(1)
      })
      dialog().should('contain.text', 'Import complete').and('contain.text', '1 rows saved')
      dialog().findByRole('button', { name: 'View usage' }).click()
      dialog().should('not.exist')

      // ค่าอยู่ในฐานข้อมูล อ่านกลับจาก API ที่ฟอร์มออกบิลใช้
      api<Array<{ roomNumber: string; electricUnits: number; waterUnits: number; source: string }>>(
        'GET',
        `/api/meter-readings?month=${month}`,
      ).then((readings) => {
        const stored = readings.body.find((reading) => reading.roomNumber === unit)
        expect(stored, `ไม่เจอค่ามิเตอร์ของห้อง ${unit} เดือน ${month}`).to.exist
        expect(stored?.electricUnits).to.eq(Number(electric))
        expect(stored?.waterUnits).to.eq(Number(water))
        expect(stored?.source).to.eq('CSV')
      })

      cy.findByRole('link', { name: 'Payments' }).click()
      cy.findByRole('button', { name: 'New Invoice' }).click()
      const bill = () => cy.findByRole('dialog')
      bill().find('#payment-room').clear().type(unit)
      bill().findByRole('heading', { name: 'Create Payment' }).click()
      // ช่องแสดงตัวเลขตัดศูนย์ท้ายทศนิยม (122.0 แสดงเป็น 122) จึงเทียบกับค่าที่แปลงเป็นตัวเลขแล้ว ไม่ใช่ข้อความใน CSV
      bill().find('#electric-usage').should('have.value', String(Number(electric)))
      bill().find('#water-usage').should('have.value', String(Number(water)))
      bill().should(($dialog) => expect(normalizeText($dialog.text())).to.contain('Filled from the imported meter reading'))

      cy.intercept({ method: 'POST', pathname: '/api/receipts' }).as('createReceipt')
      bill().findByRole('button', { name: 'Create Bill' }).click()
      cy.wait('@createReceipt').then(({ response }) => {
        expect(response?.statusCode, 'POST /api/receipts').to.eq(201)
        const receipt = response?.body as ReceiptJson
        // ใบเสร็จลบไม่ได้ จึงรับชำระให้ครบ (ทำก่อนปิดสัญญา เพราะ cleanup ทำย้อนลำดับ)
        onCleanup(() => api('POST', `/api/receipts/${receipt.id}/pay`, { paymentMethod: 'QA cleanup' }))
        expect(receipt.items.find((line) => line.item === 'Electricity')?.usageValue, 'หน่วยไฟบนใบที่ออก').to.eq(
          Number(electric),
        )
        expect(receipt.items.find((line) => line.item === 'Water')?.usageValue, 'หน่วยน้ำบนใบที่ออก').to.eq(
          Number(water),
        )
      })
      bill().should('not.exist')
      cy.findByPlaceholderText('Search by Tenant or Unit...').clear().type(tenantName)
      cy.findAllByRole('row')
        .filter((_, row) => (row.textContent ?? '').includes(tenantName))
        .should('have.length', 1)
    })
  })
})
