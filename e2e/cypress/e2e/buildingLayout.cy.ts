/*
  SSK-160 ตั้งจำนวนชั้นและจำนวนห้อง (PH2-01)

  E2E-UNITS-001 พิสูจน์ไปแล้วว่าตั้งผังใหม่แล้วแดชบอร์ดขึ้นตามค่าที่ตั้ง (S1)
  ที่ยังไม่มีใครคุมคือสองข้อที่อันตรายกว่า

  S2 ขยายผังแล้วห้องเดิมกับข้อมูลที่ผูกอยู่ต้องไม่ถูกแตะ
  S3 ย่อผังจนทับห้องที่มีสัญญาต้องถูกปฏิเสธพร้อมบอกว่าห้องไหนติด และต้องไม่เปลี่ยนอะไรเลย

  ข้อหลังสำคัญที่สุดในชุดนี้ เพราะถ้าพลาดคือลบห้องที่มีคนอยู่ทิ้งพร้อมสัญญา
  จึงเช็กทั้งสองชั้น คือคำเตือนบนฟอร์มก่อนกดบันทึก และคำตอบจาก API เมื่อกดบันทึกจริง

  เดินด้วยเมนูด้านข้างตลอด ไม่ cy.visit เพราะ backend จำลองเก็บข้อมูลใน memory
*/
describe('buildingLayout (mock-api)', () => {
  const dialog = () => cy.findByRole('dialog')

  function openLayoutDialog() {
    cy.findByRole('link', { name: 'Units' }).click()
    cy.findByRole('button', { name: 'Apartment settings' }).click()
  }

  it('E2E-UNITS-006: Adding a floor leaves every existing unit and its tenant untouched', () => {
    cy.signIn()

    // จำข้อความบนการ์ดของทั้ง 24 ห้องเดิมไว้ทั้งก้อน (เลขห้อง สถานะ และชื่อผู้เช่า)
    // เทียบทีหลังทีละห้อง โดยไม่ต้องฝังชื่อใครไว้ในเทส
    const cardTexts = ($cards: JQuery<HTMLElement>) =>
      Object.fromEntries($cards.toArray().map((card) => [card.getAttribute('aria-label'), card.textContent]))

    cy.findAllByLabelText(/^Unit \d+$/)
      .should('have.length', 24)
      .then(($cards) => cardTexts($cards))
      .then((before) => {
        openLayoutDialog()
        dialog().findByLabelText(/Number of floors/).clear().type('3')
        dialog().findByTestId('layout-total').should('have.text', '36 units')
        // ผังบอกล่วงหน้าว่าจะเพิ่มอะไร และต้องไม่มีบรรทัดว่าจะลบอะไร
        dialog().should('contain.text', 'Adds 12 units')
        dialog().should('not.contain.text', 'Removes')
        dialog().findByRole('button', { name: 'Save Layout' }).click()
        dialog().should('not.exist')

        cy.findByRole('link', { name: 'Dashboard' }).click()
        cy.findByRole('heading', { name: 'Floor 3' }).should('be.visible')
        cy.findAllByLabelText(/^Unit \d+$/).should('have.length', 36)

        // S2 การ์ดของห้องเดิมทั้ง 24 ห้องต้องเหมือนเดิมทุกตัวอักษร ห้องที่เพิ่มมาคือชั้น 3 เท่านั้น
        cy.findAllByLabelText(/^Unit \d+$/).then(($cards) => {
          const after = cardTexts($cards)
          const original = Object.fromEntries(Object.keys(before).map((label) => [label, after[label]]))
          expect(original).to.deep.equal(before)
          expect(Object.keys(after).filter((label) => !(label in before))).to.have.length(12)
        })
        cy.findByLabelText('Unit 312').should('be.visible')
      })
  })

  it('E2E-UNITS-007: Shrinking onto an occupied unit is refused and changes nothing', () => {
    cy.signIn()
    openLayoutDialog()

    // ย่อเหลือชั้นเดียวแปลว่าห้อง 2xx ทั้งแถวต้องหาย ซึ่งมีห้องที่ยังมีสัญญาอยู่
    dialog().findByLabelText(/Number of floors/).clear().type('1')
    dialog().findByTestId('layout-total').should('have.text', '12 units')
    dialog().should('contain.text', 'Removes 12 units')

    // ชั้นแรก ฟอร์มเตือนตั้งแต่ยังไม่กดบันทึก
    dialog().should('contain.text', 'an active lease, so this layout will be rejected')

    // ชั้นที่สอง กดบันทึกจริงแล้ว API ต้องปฏิเสธพร้อมบอกว่าห้องไหนติด
    dialog().findByRole('button', { name: 'Save Layout' }).click()
    dialog()
      .findByRole('alert')
      .should('contain.text', 'cannot be removed')
      .and('contain.text', 'Nothing was changed')
    // ต้องบอกเลขห้องที่ติดด้วย ไม่ใช่แค่บอกว่าทำไม่ได้ · อ่าน text ออกมาเทียบ
    // เพราะ match ใช้กับ element ตรง ๆ ไม่ได้
    dialog()
      .findByRole('alert')
      .invoke('text')
      .should('match', /Units? 2\d\d/)

    // ไดอะล็อกต้องยังเปิดอยู่ ไม่ใช่ปิดไปเหมือนบันทึกสำเร็จ
    dialog().findByRole('button', { name: 'Save Layout' }).should('be.visible')
    dialog().findByRole('button', { name: 'Cancel' }).click()
    dialog().should('not.exist')

    // S3 ของจริงต้องไม่ขยับเลยสักห้อง
    cy.findByRole('link', { name: 'Dashboard' }).click()
    cy.findAllByLabelText(/^Unit \d+$/).should('have.length', 24)
    cy.findByRole('heading', { name: 'Floor 2' }).should('be.visible')
    cy.findByLabelText('Unit 212').should('be.visible')
  })
})
