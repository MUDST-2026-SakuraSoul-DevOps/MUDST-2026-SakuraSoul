import { optionLabels } from '../support/helpers'

describe('adminFlows (mock-api)', () => {
  it('E2E-LOGIN-001: Sign in redirects to Dashboard with rooms on both floors visible', () => {
    cy.signIn()

    cy.location('pathname').should('eq', '/')
    cy.findByRole('heading', { name: 'Floor 1' }).should('be.visible')
    cy.findByRole('heading', { name: 'Floor 2' }).should('be.visible')
    cy.findByLabelText('Unit 101').should('be.visible')
    cy.findByLabelText('Unit 212').should('be.visible')
  })

  it('E2E-TENANT-001: Adding a new tenant shows it in the tenant table immediately', () => {
    cy.signIn()
    cy.findByRole('link', { name: 'Tenants' }).click()

    cy.findByRole('button', { name: 'Add New Tenant' }).click()
    const dialog = () => cy.findByRole('dialog')
    dialog().findByLabelText('Full name').clear().type('Mana Sukjai')
    dialog().findByLabelText('Phone number').clear().type('0891234567')
    // เลขบัตรบังคับตามคำตัดสินอาจารย์ 11 ก.ย. (checksum ถูกต้อง) และต้องไม่ซ้ำกับผู้เช่าที่มีอยู่
    // backend จำลองตอบ 409 เลขซ้ำแล้วเหมือนของจริง (SSK-136) เลขของ Yuki จึงใช้ไม่ได้
    dialog().findByLabelText('National ID').clear().type('3500100123457')
    dialog().findByRole('button', { name: 'Confirm' }).click()

    dialog().should('not.exist')
    cy.findByRole('row', { name: /Mana Sukjai/ }).should('be.visible')
  })

  /*
    เส้นทางหลักของแอดมินตั้งแต่ต้นจนจบ ต่อกันในเทสเดียวเพราะแต่ละขั้นใช้ผลของขั้นก่อน
    ผู้เช่าที่เพิ่งเพิ่มต้องเลือกได้ในฟอร์มสัญญา และสัญญาที่เพิ่งสร้างต้องทำให้ห้อง
    บน Dashboard เปลี่ยนเป็น Occupied (US-08 ข้อมูลทุกหน้าต้องตรงกัน)
    เดินด้วยเมนูด้านข้างตลอด ไม่ใช้ cy.visit เพราะ backend จำลองเก็บข้อมูลใน memory
    โหลดหน้าใหม่เมื่อไหร่ข้อมูลที่เพิ่งสร้างจะหายไปด้วย
  */
  it('E2E-CONTRACT-001: Adding a tenant and creating a contract for them turns the room Occupied on the Dashboard', () => {
    cy.signIn()

    // การ์ดห้องบอกสถานะด้วยจุดสี ไม่มีข้อความ จึงเช็คจากตัวเลขในการ์ดสรุป
    // กับชื่อผู้เช่าที่การ์ดห้องจะขึ้นเมื่อมีสัญญาแทน
    const room = () => cy.findByLabelText('Unit 105')
    room().should('not.contain.text', 'Mana Sukjai')
    unitCount('Occupied').then((occupiedBefore) => {
      unitCount('Available').then((availableBefore) => {
        cy.findByRole('link', { name: 'Tenants' }).click()
        cy.findByRole('button', { name: 'Add New Tenant' }).click()
        const tenantDialog = () => cy.findByRole('dialog')
        tenantDialog().findByLabelText('Full name').clear().type('Mana Sukjai')
        tenantDialog().findByLabelText('Phone number').clear().type('0891234567')
        tenantDialog().findByLabelText('National ID').clear().type('3500100123457')
        tenantDialog().findByRole('button', { name: 'Confirm' }).click()
        tenantDialog().should('not.exist')

        cy.findByRole('link', { name: 'Contracts' }).click()
        cy.findByRole('button', { name: 'Create Contract' }).click()
        const contractDialog = () => cy.findByRole('dialog', { name: 'Create Contract' })
        // สอง select นี้เป็น select จริงที่ซ่อนไว้ใต้ dropdown ที่ทีมทำเอง (CustomSelect) จึงต้อง force
        const unitSelect = () => contractDialog().find('#unit-select')
        optionLabel(unitSelect(), /^105 /).then((label) => {
          unitSelect().select(label, { force: true })
        })
        const tenantSelect = () => contractDialog().find('#tenant-select')
        optionLabel(tenantSelect(), /Mana Sukjai/).then((label) => {
          tenantSelect().select(label, { force: true })
        })
        contractDialog().findByRole('button', { name: 'Create Contract' }).click()
        contractDialog().should('not.exist')
        cy.findByRole('row', { name: /Mana Sukjai/ }).should('be.visible')

        cy.findByRole('link', { name: 'Dashboard' }).click()
        room().should('contain.text', 'Mana Sukjai')
        unitCard('Occupied').should(($card) => expect(cardNumber($card, 'Occupied')).to.eq(occupiedBefore + 1))
        unitCard('Available').should(($card) => expect(cardNumber($card, 'Available')).to.eq(availableBefore - 1))
      })
    })
  })
})

type UnitLabel = 'Available' | 'Occupied'

/** การ์ดสรุปบน Dashboard เช่น การ์ด "Occupied units" */
function unitCard(label: UnitLabel): Cypress.Chainable<JQuery<HTMLElement>> {
  return cy.findByRole('group', { name: `${label} units` })
}

/** ตัวเลขในการ์ดสรุปบน Dashboard เช่น การ์ด "Occupied units" */
function unitCount(label: UnitLabel): Cypress.Chainable<number> {
  return unitCard(label)
    .should('be.visible')
    .then(($card) => cardNumber($card, label))
}

/** อ่านจาก innerText เพราะ .text() ของ jQuery ไม่มีขึ้นบรรทัด ใช้ได้ทั้งตอนจำค่าเดิมและใน .should ที่ถามซ้ำ */
function cardNumber($card: JQuery<HTMLElement>, label: UnitLabel): number {
  const digits = $card[0].innerText.match(/\d+/)
  if (!digits) throw new Error(`No number in the ${label} units card`)
  return Number(digits[0])
}

/** หาข้อความของตัวเลือกที่ตรงกับ pattern เพราะป้ายใน dropdown มีส่วนต่อท้ายเช่น "· Floor 1" */
function optionLabel(select: Cypress.Chainable<JQuery<HTMLElement>>, pattern: RegExp): Cypress.Chainable<string> {
  return select.then(optionLabels).then((labels) => {
    const match = labels.find((label) => pattern.test(label))
    if (!match) throw new Error(`No option matching ${pattern} in: ${labels.join(' | ')}`)
    return match
  })
}
