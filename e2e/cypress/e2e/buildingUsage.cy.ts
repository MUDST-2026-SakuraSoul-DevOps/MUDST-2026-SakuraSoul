// ============================== [NOTE] ==============================
// ไฟล์นี้: ภาพรวมการใช้น้ำไฟทั้งตึก 1 เคส (SSK-181)
// ชุด: mock-api (พอร์ต 4173) — คำขอ /api ถูกตอบโดย backend ปลอมในเบราว์เซอร์ (frontend/src/api/mockApi.ts) ข้อมูลอยู่ใน memory ไม่แตะ Spring/PostgreSQL
// เทส: E2E-USAGE-001 เลือก 14 เดือนคร่อมปี สลับเป็นเทียบปี และการ์ดสรุปตรงกับผลรวมในตาราง
// รัน: cd e2e → npm run open:mock แล้วคลิกไฟล์นี้ · หรือ npm run test:mock (รันทั้งชุด mock)
// ====================================================================

/*
  backend จำลองมีค่ามิเตอร์ตัวอย่าง 24 เดือนย้อนหลังของทุกห้อง (จบที่เดือนที่แล้ว)
  เลือก 14 เดือนล่าสุดที่จบเดือนที่แล้ว ช่วงนี้คร่อมปีใหม่เสมอไม่ว่าจะรันเดือนไหน และทุกเดือนมีข้อมูลตัวอย่าง
  ตัวเลขบนการ์ดต้องเท่ากับผลรวมของคอลัมน์หน่วยในตารางชุดเดียวกันเสมอ ทั้งก่อนและหลังสลับโหมด
*/

/** "12,300 kWh" หรือ "1,234.5" เป็นตัวเลข */
function amount(text: string): number {
  return Number(text.replace(/[^0-9.]/g, ''))
}

/** เดือนที่ห่างจากเดือนนี้ by เดือน เป็น { value: "2025-11", label: "Nov 2025" } */
function monthFromNow(by: number): { value: string; label: string } {
  const now = new Date()
  const date = new Date(Date.UTC(now.getFullYear(), now.getMonth() + by, 1))
  const value = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
  const label = new Intl.DateTimeFormat('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(date)
  return { value, label }
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
    const months = Array.from({ length: 14 }, (_, i) => monthFromNow(i - 14))
    const years = [...new Set(months.map((m) => m.value.slice(0, 4)))]

    cy.signIn()
    cy.findByRole('link', { name: 'Usage' }).click()
    cy.findByRole('heading', { name: 'Usage', level: 1 }).should('be.visible')
    cy.findByRole('button', { name: 'Whole building' }).should('have.attr', 'aria-pressed', 'true')

    cy.findByLabelText('From').type(months[0].value)
    cy.findByLabelText('To').type(months[13].value)
    cy.findByRole('button', { name: 'Last 12 months' }).should('have.attr', 'aria-pressed', 'false')

    // 14 เดือนเรียงต่อกันข้ามปี ไม่ข้ามหรือซ้ำเดือน
    cy.findByRole('table')
      .find('tbody tr')
      .should('have.length', 14)
      .then((rows) => {
        const shown = [...rows].map((row) => row.querySelector('td')?.textContent)
        expect(shown).to.deep.equal(months.map((m) => m.label))
      })
    cy.findByRole('img', { name: /Electricity usage for the whole building/ }).should('be.visible')
    expectCardEqualsTableSum()

    cy.findByRole('button', { name: 'Compare years' }).click()
    cy.findByRole('img', { name: /Electricity usage by year/ }).should('be.visible')
    cy.findByRole('list', { name: 'Legend' })
      .findAllByRole('listitem')
      .then((items) => {
        expect([...items].map((item) => item.textContent)).to.deep.equal(years)
      })
    expectCardEqualsTableSum()
  })
})
