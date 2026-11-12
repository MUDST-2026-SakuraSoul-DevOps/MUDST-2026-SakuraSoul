// ============================== [NOTE] ==============================
// ไฟล์นี้: ภาพรวมการใช้น้ำไฟทั้งตึก 1 เคส (SSK-181)
// ชุด: mock-api (พอร์ต 4173) — คำขอ /api ถูกตอบโดย backend ปลอมในเบราว์เซอร์ (frontend/src/api/mockApi.ts) ข้อมูลอยู่ใน memory ไม่แตะ Spring/PostgreSQL
// เทส: E2E-USAGE-001 เลือกช่วงคร่อมปี สลับเป็นเทียบปี และการ์ดสรุปตรงกับผลรวมในตาราง
// รัน: cd e2e → npm run open:mock แล้วคลิกไฟล์นี้ · หรือ npm run test:mock (รันทั้งชุด mock)
// ====================================================================

/*
  backend จำลองมีค่ามิเตอร์ตัวอย่าง 24 เดือนย้อนหลังของทุกห้อง เลือก พ.ย. ของปีที่แล้วถึง ก.พ. ของปีนี้
  ได้สี่เดือนคร่อมปีใหม่ (เดือนที่ยังไม่ถึงขึ้นเป็น No data แต่ยังเป็นแถวของตาราง)
  ตัวเลขบนการ์ดต้องเท่ากับผลรวมของคอลัมน์หน่วยในตารางชุดเดียวกันเสมอ ทั้งก่อนและหลังสลับโหมด
*/

/** "12,300 kWh" หรือ "1,234.5" เป็นตัวเลข */
function amount(text: string): number {
  return Number(text.replace(/[^0-9.]/g, ''))
}

function expectCardEqualsTableSum() {
  cy.findByRole('table')
    .find('tbody tr')
    .then((rows) => {
      const sum = [...rows]
        .map((row) => row.querySelectorAll('td')[1]?.textContent ?? '')
        .filter((text) => text !== 'No data')
        .reduce((total, text) => total + amount(text), 0)
      cy.findByText('Electricity usage', { selector: 'p' })
        .parent()
        .find('p')
        .eq(1)
        .invoke('text')
        .then((card) => {
          expect(amount(card)).to.be.closeTo(sum, 0.01)
        })
    })
}

describe('buildingUsage (mock-api)', () => {
  it('E2E-USAGE-001: The whole-building usage spans a range across years, compares years and matches its table', () => {
    const year = new Date().getFullYear()
    const from = `${year - 1}-11`
    const to = `${year}-02`

    cy.signIn()
    cy.findByRole('link', { name: 'Usage' }).click()
    cy.findByRole('heading', { name: 'Usage', level: 1 }).should('be.visible')
    cy.findByRole('button', { name: 'Whole building' }).should('have.attr', 'aria-pressed', 'true')

    cy.findByLabelText('From').type(from)
    cy.findByLabelText('To').type(to)
    cy.findByRole('button', { name: 'Last 12 months' }).should('have.attr', 'aria-pressed', 'false')

    // สี่เดือนเรียงต่อกันข้ามปี ไม่ข้ามหรือซ้ำเดือน
    cy.findByRole('table')
      .find('tbody tr')
      .should('have.length', 4)
      .then((rows) => {
        const months = [...rows].map((row) => row.querySelector('td')?.textContent)
        expect(months).to.deep.equal([`Nov ${year - 1}`, `Dec ${year - 1}`, `Jan ${year}`, `Feb ${year}`])
      })
    cy.findByRole('img', { name: /Electricity usage for the whole building/ }).should('be.visible')
    expectCardEqualsTableSum()

    cy.findByRole('button', { name: 'Compare years' }).click()
    cy.findByRole('img', { name: /Electricity usage by year/ }).should('be.visible')
    cy.findByRole('list', { name: 'Legend' })
      .findAllByRole('listitem')
      .then((items) => {
        expect([...items].map((item) => item.textContent)).to.deep.equal([String(year - 1), String(year)])
      })
    expectCardEqualsTableSum()
  })
})
