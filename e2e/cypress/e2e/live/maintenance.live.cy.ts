import { api, onCleanup, runCleanups } from '../../support/helpers'

/*
  SSK-123 — แจ้งซ่อมจากหน้า Dashboard ต้องถูกบันทึกลงฐานข้อมูลจริง

  เคสนี้เคยแดงจริงตอนเขียน (24 ก.ย.) เพราะ DashboardPage ตรง onSave มีแต่
  dashboard.reload() พร้อมคอมเมนต์เก่าว่า "ยังไม่มี POST /api/maintenance"
  กดบันทึกแล้วไม่มีคำขอออกไปเลย ข้อมูลที่กรอกหายทั้งใบรวมถึงค่าซ่อม (SSK-139)
  เฉินต่อ API ให้แล้วใน SSK-131 เทสสองตัวนี้จึงเป็นตัวกันไม่ให้ย้อนกลับไปเป็นแบบเดิม

  ห้องที่ใช้เลือกเป็นห้องท้าย ๆ ของชั้น 1 ที่ข้อมูลตั้งต้นไม่ได้ใช้
  ทั้งสองเคสเก็บกวาดของที่ตัวเองสร้างเสมอ ลบใบแจ้งซ่อมทิ้งใน afterEach และคืนสถานะห้อง
  ไม่งั้นรันซ้ำหลายรอบใบจะกองในฐานข้อมูลและห้องจะค้างป้าย 🔧 ให้คนอื่นงง
*/

/** การ์ดห้องบนแดชบอร์ด หาใหม่ทุกครั้งที่เรียก เพราะหลังรีโหลดเป็น element คนละตัวกับเดิม */
function roomCard(roomNumber: string) {
  return cy.findByLabelText(`Unit ${roomNumber}`)
}

/** ป็อปอัป Create Maintenance ที่เปิดอยู่ */
function maintenanceDialog() {
  return cy.findByRole('dialog', { name: 'Create Maintenance' })
}

function openCreateMaintenance(roomNumber: string) {
  cy.findByRole('button', { name: 'Create Maintenance' }).click()
  maintenanceDialog().within(() => {
    cy.findByRole('button', { name: 'Floor 1' }).click()
    cy.findByRole('button', { name: roomNumber }).click()
    cy.findByLabelText('Maintenance Type').select('Plumbing')
  })
}

/*
  ลบผ่าน API ตรง ๆ ไม่ผ่านหน้าจอ เพราะขั้นตอนนี้คือการเก็บกวาด ไม่ใช่สิ่งที่เทสต้องการพิสูจน์
  cy.request ใช้ cookie ชุดเดียวกับที่หน้าเว็บเพิ่งล็อกอินไว้ จึงผ่านยามของ backend ได้
  ใบที่เพิ่งสร้างยังเป็นสถานะ OPEN จึงลบได้ (DELETE /api/maintenance/{id} จาก SSK-131)
  ไม่เช็คสถานะที่ตอบกลับ เพราะ afterEach ที่พังจะทำให้ข้ามเคสที่เหลือทั้งไฟล์
*/
function deleteTicket(id: number) {
  api('DELETE', `/api/maintenance/${id}`)
}

/**
 * กดบันทึกแล้วจดงานเก็บกวาดของใบที่ backend สร้างให้ทันทีที่รู้เลข ก่อนเช็คข้ออื่น
 * เพราะถ้าข้อถัดไปพัง ใบถูกเขียนลงฐานข้อมูลไปแล้วและยังต้องถูกลบ
 */
function saveTicket(cleanUp: (ticketId: number) => void) {
  cy.intercept({ method: 'POST', pathname: /^\/api\/maintenance$/ }).as('createTicket')
  maintenanceDialog().findByRole('button', { name: 'Save Maintenance' }).click()

  cy.wait('@createTicket').then(({ response }) => {
    expect(response?.statusCode).to.eq(201)
    const ticket = response?.body as { id: number }
    onCleanup(() => cleanUp(ticket.id))
  })
  maintenanceDialog().should('not.exist')
}

/** id ของห้องในฐานข้อมูล เอาไว้คืนสถานะห้องผ่าน API ตอนเก็บกวาด */
function roomIdOf(roomNumber: string): Cypress.Chainable<number> {
  return api<Array<{ id: number; roomNumber: string }>>('GET', '/api/rooms').then((res) => {
    expect(res.status, 'อ่านรายการห้องจาก GET /api/rooms ไม่สำเร็จ').to.eq(200)
    const room = res.body.find((r) => r.roomNumber === roomNumber)
    if (room === undefined) {
      throw new Error(`ไม่เจอห้อง ${roomNumber} ใน GET /api/rooms`)
    }
    return room.id
  })
}

describe('maintenance (live-api)', () => {
  afterEach(runCleanups)

  it('E2E-LIVE-MAINT-001: A ticket billed to the tenant is saved and marks the room card', () => {
    cy.signInLive()

    openCreateMaintenance('109')

    maintenanceDialog().within(() => {
      cy.findByRole('radio', { name: /Still Available/ }).click()
      cy.findByRole('checkbox', { name: /Bill this repair to the tenant/ }).check()
      cy.findByLabelText('Amount').clear().type('5000')
    })

    saveTicket(deleteTicket)

    /*
      ป้าย 🔧 บนการ์ดมาจาก openMaintenanceCount ที่ GET /api/rooms ส่งมา จึงพิสูจน์ได้ว่า
      ใบแจ้งซ่อมถูกเขียนลงฐานข้อมูลจริง ส่วนห้องต้องยังว่างอยู่เพราะเลือก Still Available
    */
    roomCard('109').should('contain.text', '🔧')
    roomCard('109').should('not.contain.text', 'Maintenance')
    cy.reload()
    roomCard('109').should('contain.text', '🔧')
  })

  it('E2E-LIVE-MAINT-002: Choosing Out of Service turns the room to Maintenance', () => {
    cy.signInLive()

    roomIdOf('110').then((roomId) => {
      openCreateMaintenance('110')
      maintenanceDialog().findByRole('radio', { name: /Out of Service/ }).click()

      saveTicket((ticketId) => {
        /*
          คืนห้องให้ว่างเหมือนเดิม แล้วลบใบแจ้งซ่อมทิ้ง ไม่ให้เหลือร่องรอยจากการเทส
          คืนห้องด้วย PATCH สถานะห้องก่อนแล้วค่อยลบใบ ห้ามใช้วิธีปิดใบเป็น DONE เพราะการปิดใบ
          ไม่ได้ปลดล็อกห้องให้ (สองเรื่องนี้แยกกันใน RoomService.updateStatus) และใบที่ DONE แล้ว
          ลบไม่ได้ เพราะถูกเก็บไว้เป็นประวัติงานซ่อม
        */
        api('PATCH', `/api/rooms/${roomId}/status`, { status: 'AVAILABLE' })
        deleteTicket(ticketId)
      })

      roomCard('110').should('contain.text', 'Maintenance')
      cy.reload()
      roomCard('110').should('contain.text', 'Maintenance')
    })
  })
})
