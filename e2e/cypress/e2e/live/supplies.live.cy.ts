import { api, onCleanup, runCleanups, uniqueName } from '../../support/helpers'

/*
  US-17 (SSK-23) — คลังอุปกรณ์ เพิ่มของ เติมของ และเตือนเมื่อของต่ำกว่าเกณฑ์

  Core requirement ข้อ "Track maintenance tasks and **supply usage**" ของโจทย์
  ฝั่ง backend มี SupplyApiTest 17 เคสกับ SupplyServiceTest 12 เคสคุมไว้แน่นแล้ว
  แต่แท็บ Supplies & Inventory ยังไม่มีเคส E2E เลยสักตัว ช่องว่างตรงนี้สำคัญ
  เพราะบั๊กแบบที่เคยเจอใน SSK-139 (ป็อปอัปกดบันทึกแล้วไม่ยิง API) เป็นบั๊กที่
  เทสฝั่ง backend มองไม่เห็น และเทสที่วิ่งกับ mock ก็มองไม่เห็นเหมือนกัน
  เพราะ mockApi.ts รับทุก method โดยไม่ตรวจอะไร

  ทั้งสองเคสเขียนข้อมูลลงฐานข้อมูลจริง จึงใช้ชื่อที่สุ่มใหม่ทุกครั้งและลบทิ้งใน afterEach
  ของที่เพิ่งสร้างยังไม่เคยถูกใช้ในใบแจ้งซ่อม จึงลบได้ (SupplyService.delete ตอบ 409
  เฉพาะของที่มีประวัติการใช้งานแล้ว ส่วนประวัติการเติมถูกลบตามให้เอง)
*/

function openSuppliesTab() {
  cy.findByRole('link', { name: 'Maintenance' }).click()
  cy.findByRole('button', { name: 'Supplies & Inventory' }).click()
  cy.findByRole('heading', { name: 'Current Inventory' }).should('be.visible')
}

/*
  เก็บกวาดผ่าน API ตรง ๆ ไม่ผ่านหน้าจอ เพราะไม่ใช่สิ่งที่เทสต้องการพิสูจน์
  cy.request ใช้ cookie ชุดเดียวกับที่หน้าเว็บเพิ่งล็อกอินไว้ จึงผ่านยามของ backend ได้
  ไม่เช็คสถานะที่ตอบกลับ เพราะ afterEach ที่พังจะทำให้ข้ามเคสที่เหลือทั้งไฟล์
*/
function deleteSupply(id: number) {
  api('DELETE', `/api/supplies/${id}`)
}

/** กรอกฟอร์ม New Supply Item แล้วจดงานลบไว้ทันทีที่ backend ตอบเลขของที่สร้างให้ */
function addSupply(item: { name: string; stock: number; minStock: number; maxStock: number }) {
  cy.findByRole('button', { name: 'New Supply Item' }).click()
  const dialog = () => cy.findByRole('dialog', { name: 'Add Supply Item' })

  dialog().within(() => {
    cy.findByLabelText('Item Name').clear().type(item.name)
    cy.findByLabelText('Category').select('Plumbing')
    cy.findByLabelText('Quantity').clear().type(String(item.stock))
    cy.findByLabelText('Min Stock').clear().type(String(item.minStock))
    cy.findByLabelText('Max Stock').clear().type(String(item.maxStock))
  })

  cy.intercept({ method: 'POST', pathname: /^\/api\/supplies$/ }).as('createSupply')
  dialog().findByRole('button', { name: 'Add Supply' }).click()

  cy.wait('@createSupply').then(({ response }) => {
    expect(response?.statusCode, 'เพิ่มของเข้าคลังไม่สำเร็จ').to.eq(201)
    const supply = response?.body as { id: number }
    onCleanup(() => deleteSupply(supply.id))
  })
  dialog().should('not.exist')
}

/** แถวของของชิ้นนี้ในตาราง Current Inventory */
function supplyRow(name: string) {
  return cy.findAllByRole('row').filter((_, row) => (row.textContent ?? '').includes(name))
}

/*
  ช่อง CURRENT STOCK ของแถวนี้ (คอลัมน์ที่สามของตาราง)
  ตรวจจำนวนที่ช่องนี้ช่องเดียว ไม่ตรวจทั้งแถว เพราะชื่อของมีเวลาที่สร้างเป็นตัวเลข 13 หลักติดอยู่
  ตัวเลขอย่าง 20 หรือ 35 จึงอาจบังเอิญโผล่ในแถวได้ทั้งที่จำนวนในคลังผิด
*/
function stockCell(name: string) {
  return supplyRow(name).find('td').eq(2)
}

/** ป็อปอัป Restock ของของชิ้นนี้ */
function restockDialog(name: string) {
  return cy.findByRole('dialog', { name: `Restock ${name}` })
}

/*
  ตัวเลขบนการ์ด LOW STOCK ALERTS

  การ์ดเป็น role="group" ที่มีชื่อตรงกับป้าย ส่วนตัวเลขข้างในเป็นแค่ <p> ไม่มี role
  ของตัวเอง จึงเจาะตรงไม่ได้ อ่านข้อความทั้งการ์ดแล้วหยิบบรรทัดที่เป็นตัวเลขล้วนออกมา
  (อีกสองบรรทัดคือป้ายกับคำอธิบาย ไม่มีทางเป็นตัวเลขล้วน) ระหว่างโหลดรอบแรก
  หน้าเว็บขึ้นขีดแทนศูนย์ ถ้าเจอขีดแปลว่ายังโหลดไม่เสร็จ ให้รอรอบถัดไป
  อ่านจาก innerText เพราะ .text() ของ jQuery ไม่มีตัวขึ้นบรรทัด ทุกบรรทัดจะติดกันจนแยกไม่ออก
*/
function lowStockCard() {
  return cy.findByRole('group', { name: 'LOW STOCK ALERTS' })
}

/** ตัวเลขบนการ์ด หรือ NaN ถ้ายังไม่มีบรรทัดที่เป็นตัวเลขล้วน */
function readLowStockCount($card: JQuery<HTMLElement>): number {
  const line = $card[0].innerText
    .split(/\r?\n/)
    .map((part) => part.trim())
    .find((part) => /^\d+$/.test(part))
  return line === undefined ? NaN : Number(line)
}

/** รอจนการ์ดมีตัวเลขให้อ่าน แล้วส่งตัวเลขนั้นต่อ */
function lowStockCount(): Cypress.Chainable<number> {
  return lowStockCard()
    .should(($card) => {
      expect(readLowStockCount($card), 'การ์ด LOW STOCK ALERTS ไม่มีตัวเลขให้อ่าน').not.to.be.NaN
    })
    .then(readLowStockCount)
}

describe('supplies (live-api)', () => {
  afterEach(runCleanups)

  it('E2E-LIVE-SUPPLY-001: A new item and a restock are both saved to the database', () => {
    cy.signInLive()
    openSuppliesTab()

    const name = uniqueName('QA Supply')
    addSupply({ name, stock: 20, minStock: 5, maxStock: 100 })

    // US-17-S1 ของใหม่ต้องโผล่ในตารางทันที พร้อมจำนวนที่กรอกไว้
    supplyRow(name).should('be.visible')
    stockCell(name).should('have.text', '20')
    supplyRow(name).should('contain.text', 'In Stock')

    // US-17-S2 เติมของแล้วจำนวนต้องบวกเข้ากับของเดิม ไม่ใช่ทับค่าเดิม
    supplyRow(name).findByRole('button', { name: `Restock ${name}` }).click()
    restockDialog(name).findByLabelText('Amount to add').clear().type('15')

    cy.intercept({ method: 'POST', pathname: /^\/api\/supplies\/\d+\/restock$/ }).as('restock')
    restockDialog(name).findByRole('button', { name: 'Restock' }).click()
    cy.wait('@restock').then(({ response }) => {
      expect(response?.statusCode, 'เติมของไม่สำเร็จ').to.be.lessThan(300)
    })
    restockDialog(name).should('not.exist')

    /*
      รีโหลดทั้งหน้าก่อนตรวจ ถ้าดูแต่ตัวเลขที่เด้งขึ้นทันทีหลังกดบันทึก เราจะพิสูจน์ได้แค่ว่า
      หน้าเว็บคำนวณเลขใหม่ในหัวตัวเองถูก ไม่ได้พิสูจน์ว่ามันถูกเขียนลง PostgreSQL จริง
    */
    cy.reload()
    cy.findByRole('button', { name: 'Supplies & Inventory' }).click()
    stockCell(name).should('have.text', '35')
  })

  it('E2E-LIVE-SUPPLY-002: An item below its minimum is flagged as Low Stock and counted in the alert card', () => {
    cy.signInLive()
    openSuppliesTab()

    /*
      US-17-S3 เตือนเมื่อของต่ำกว่าเกณฑ์ที่ตกลงกัน กฎอยู่ที่ supplyStatus() คือ
      stock < minStock ถึงจะนับว่า Low Stock (เท่ากับพอดียังไม่นับ)
      ตั้งของให้เหลือ 2 ชิ้นจากขั้นต่ำ 10 เพื่อให้ตกเกณฑ์ชัด ๆ ไม่ใช่คาบเส้น
    */
    const name = uniqueName('QA LowStock')
    addSupply({ name, stock: 2, minStock: 10, maxStock: 50 })

    supplyRow(name).should('be.visible')
    supplyRow(name).should(($row) => {
      expect($row.text(), 'ของที่ต่ำกว่าขั้นต่ำต้องขึ้นป้าย Low Stock').to.contain('Low Stock')
    })

    /*
      การ์ด LOW STOCK ALERTS ต้องนับของชิ้นนี้ด้วย ตัวเลขมาจาก GET /api/supplies/summary
      ซึ่งเป็นคนละคำขอกับรายการในตาราง ถ้าตรวจแค่ป้ายในแถว เราจะไม่มีทางรู้เลยว่า
      backend นับยอดสรุปด้วยกฎเดียวกับที่หน้าเว็บใช้ตีป้ายหรือเปล่า
    */
    lowStockCount().then((before) => {
      // เติมของให้พ้นเกณฑ์ แล้วป้ายกับตัวเลขบนการ์ดต้องเปลี่ยนตามไปทั้งคู่
      supplyRow(name).findByRole('button', { name: `Restock ${name}` }).click()
      restockDialog(name).findByLabelText('Amount to add').clear().type('20')
      restockDialog(name).findByRole('button', { name: 'Restock' }).click()
      restockDialog(name).should('not.exist')

      supplyRow(name).should('contain.text', 'In Stock')
      lowStockCard().should(($card) => {
        expect(
          readLowStockCount($card),
          'เติมของจนพ้นเกณฑ์แล้ว ตัวเลขบนการ์ดเตือนต้องลดลงหนึ่ง',
        ).to.eq(before - 1)
      })
    })
  })
})
