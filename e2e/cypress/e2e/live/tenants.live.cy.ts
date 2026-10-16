import { api, newThaiNationalId, onCleanup, runCleanups, uniqueName } from '../../support/helpers'

/*
  SSK-123 — CRUD ผู้เช่ากับ backend จริง

  ทำไมต้องมีชุดนี้: backend ตรวจรูปแบบเลขบัตร กันเลขซ้ำ และมี endpoint แค่บางตัว
  ส่วน mockApi.ts ไม่ตรวจอะไรเลยและรองรับทุก method เทสที่วิ่งกับ mock จึงเขียวหมด
  ทั้งที่ของจริงพัง ซึ่งเป็นสิ่งที่อาจารย์ทักไว้ตรง ๆ ว่า "ใส่เลขผิดแล้ว test run ผ่าน"

  เคสในไฟล์นี้เคยแดงจริงทั้งคู่ตอนเขียน (24 ก.ย.) แล้วเขียวหลังของสองงานเข้า frontend
  - SSK-113 หน้าเว็บเคยส่งเลขบัตรพร้อมช่องว่าง backend ตอบ 400
  - SSK-108 backend เคยไม่มี PUT/DELETE /api/tenants/{id} หน้าเว็บจึงได้ 405
  ตอนนี้จึงทำหน้าที่เป็นตัวกันไม่ให้สองเรื่องนี้ย้อนกลับมา

  เทสเขียนข้อมูลลงฐานข้อมูลจริง จึงใช้ชื่อกับเลขบัตรที่ไม่ซ้ำทุกครั้ง แตะเฉพาะแถว
  ของตัวเอง และทุกเคสลบผู้เช่าที่ตัวเองสร้างทิ้งเมื่อจบ งานลบถูกจดไว้ทันทีที่ backend
  ตอบเลขผู้เช่ากลับมา แล้ว afterEach ลบให้ทั้งตอนเทสผ่านและตอนพังกลางทาง

  สองเรื่องที่เคยทำให้ชุดนี้พังเองเมื่อรันสะสมหลายรอบ และแก้ไปแล้ว
  1. ตาราง Tenants แบ่งหน้าละ 10 แถว (PAGE_SIZE ใน TenantsPage.tsx) ผู้เช่าที่เพิ่ง
     เพิ่มจึงไปโผล่หน้าหลัง ๆ แล้ว findByRole('row') หาไม่เจอทั้งที่บันทึกสำเร็จ
     ตอนนี้พิมพ์ชื่อลงช่องค้นหาก่อนทุกครั้ง เหลือแถวเดียวจึงไม่ขึ้นกับจำนวนข้อมูลในระบบ
  2. เคส 001 กับ 002 เดิมไม่ลบผู้เช่าที่สร้าง ฐานข้อมูล dev จึงบวมขึ้นทุกรอบที่รัน
     จนไปกระตุ้นปัญหาข้อ 1 ให้เกิดเร็วขึ้น
*/

/** ค้นหาด้วยชื่อก่อนเสมอ ตารางแบ่งหน้า แถวของเราอาจไม่ได้อยู่หน้าแรก */
function findRow(fullName: string) {
  // เช็คว่าพิมพ์ครบก่อนหาแถว ถ้าตัวอักษรหาย เทสจะพังตรงนี้พร้อมบอกค่าที่ได้จริง
  cy.findByLabelText('Search tenants by name or unit').clear().type(fullName).should('have.value', fullName)
  return cy.findByRole('row', { name: new RegExp(fullName) })
}

/*
  ลบผ่าน API ตรง ๆ เพราะเป็นการเก็บกวาด ไม่ใช่สิ่งที่เทสต้องการพิสูจน์
  ไม่เช็คสถานะที่ตอบกลับ เพราะ afterEach ที่พังจะทำให้ข้ามเคสที่เหลือทั้งไฟล์
  และเคส 003 ลบผู้เช่าไปเองแล้วผ่านหน้าจอ รอบนี้จึงได้ 404 ซึ่งถูกต้องอยู่แล้ว
*/
function deleteTenant(id: number) {
  api('DELETE', `/api/tenants/${id}`)
}

/** เพิ่มผู้เช่าผ่านหน้าจอ แล้วจดงานลบไว้ทันทีที่ backend ตอบเลขผู้เช่ากลับมา */
function addTenant(fullName: string) {
  cy.findByRole('link', { name: 'Tenants' }).click()
  cy.findByRole('button', { name: 'Add New Tenant' }).click()

  /*
    เช็คชื่อที่พิมพ์ให้ครบทุกตัวก่อนกดบันทึก เคยมีรอบที่หน้า Tenants โหลดข้อมูลเสร็จระหว่างพิมพ์
    แล้วป็อปอัปดึง focus กลับไปกลางคำ ตัวอักษรที่เหลือหาย ชื่อที่บันทึกขาดท้ายแต่ยังได้ 201
    เทสไปพังไกลออกไปที่ "No tenants match your search" (แก้ที่ Modal.tsx แล้ว)
  */
  cy.findByRole('dialog').within(() => {
    cy.findByLabelText('Full name').clear().type(fullName).should('have.value', fullName)
    cy.findByLabelText('Phone number').clear().type('0891234567')
    cy.findByLabelText('National ID').clear().type(newThaiNationalId())
  })

  cy.intercept({ method: 'POST', pathname: /^\/api\/tenants$/ }).as('createTenant')
  cy.findByRole('dialog').findByRole('button', { name: 'Confirm' }).click()

  cy.wait('@createTenant').then(({ response }) => {
    expect(response?.statusCode, 'เพิ่มผู้เช่าไม่สำเร็จ').to.eq(201)
    const tenant = response?.body as { id: number; fullName: string }
    onCleanup(() => deleteTenant(tenant.id))
    expect(tenant.fullName, 'ชื่อที่ backend บันทึกต้องครบเท่าที่พิมพ์').to.eq(fullName)
  })
  cy.findByRole('dialog').should('not.exist')
  findRow(fullName).should('be.visible')
}

describe('tenants (live-api)', () => {
  afterEach(runCleanups)

  it('E2E-LIVE-TENANT-001: A new tenant is saved to the database and survives a reload', () => {
    cy.signInLive()

    const fullName = uniqueName()
    addTenant(fullName)

    // จุดสำคัญของชุด live: รีโหลดทั้งหน้าแล้วข้อมูลต้องมาจากฐานข้อมูล ไม่ใช่ state ในหน้าเว็บ
    cy.reload()
    findRow(fullName).should('be.visible')
  })

  it('E2E-LIVE-TENANT-002: Editing a tenant saves through the real API', () => {
    cy.signInLive()

    // แก้ผู้เช่าที่เทสสร้างเอง ไม่ไปยุ่งกับข้อมูลตั้งต้นที่คนอื่นใช้อยู่
    const fullName = uniqueName('QA Edit')
    addTenant(fullName)

    cy.findByRole('button', { name: `Edit ${fullName}` }).click()
    cy.findByRole('dialog').findByLabelText('Phone number').clear().type('0899999999')

    cy.intercept({ method: 'PUT', pathname: /^\/api\/tenants\/\d+$/ }).as('updateTenant')
    cy.findByRole('dialog').findByRole('button', { name: 'Confirm' }).click()

    cy.wait('@updateTenant').its('response.statusCode').should('eq', 200)
    cy.findByRole('dialog').should('not.exist')

    cy.reload()
    findRow(fullName).should('contain.text', '089-999-9999')
  })

  it('E2E-LIVE-TENANT-003: Deleting a tenant removes it from the database', () => {
    cy.signInLive()

    /*
      addTenant จดงานลบผ่าน API ไว้ให้ด้วย ถ้าเทสพังก่อนลบผ่านหน้าจอสำเร็จ afterEach จะลบให้
      ถ้าลบสำเร็จแล้ว รอบนั้นได้ 404 ซึ่งไม่เป็นไร
    */
    const fullName = uniqueName('QA Delete')
    addTenant(fullName)

    // เคสนี้ลบผ่านหน้าจอ เพราะการลบคือสิ่งที่กำลังพิสูจน์ ไม่ใช่การเก็บกวาด
    cy.findByRole('button', { name: `Delete ${fullName}` }).click()
    const dialog = () => cy.findByRole('dialog', { name: 'Confirm Delete Tenant Information' })

    cy.intercept({ method: 'DELETE', pathname: /^\/api\/tenants\/\d+$/ }).as('deleteTenant')
    dialog().findByRole('button', { name: 'Confirm Delete' }).click()

    cy.wait('@deleteTenant').its('response.statusCode').should('be.lessThan', 300)
    dialog().should('not.exist')

    cy.reload()
    findRow(fullName).should('not.exist')
    /*
      ระหว่างที่ตารางยังโหลดไม่เสร็จก็ไม่มีแถวให้เจอเหมือนกัน ข้อบนจึงผ่านได้ทั้งที่ยังไม่ได้ดูข้อมูลจริง
      รอให้หน้าเว็บบอกว่าค้นหาแล้วไม่เจอใคร ซึ่งขึ้นหลังโหลดรายชื่อจากฐานข้อมูลเสร็จแล้วเท่านั้น
    */
    cy.findByText('No tenants match your search').should('be.visible')
  })
})
