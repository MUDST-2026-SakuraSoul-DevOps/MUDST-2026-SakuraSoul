import { api, newThaiNationalId, onCleanup, runCleanups, todayInBangkok, uniqueName } from '../../support/helpers'

/*
  SSK-123 — วงจรสัญญาเช่ากับ backend จริง (US-04, US-06)

  ชุด mock มี E2E-CONTRACT-001 อยู่แล้ว แต่ข้อมูลอยู่ใน memory ของหน้าเว็บ จึงพิสูจน์ไม่ได้ว่า
  ปุ่มบนหน้าจอส่งสัญญาไปถึง PostgreSQL จริง ใบหยกรีวิว E2E coverage แล้วชี้ว่าเป็นช่องว่าง
  ใหญ่สุดที่เหลืออยู่ (14 ต.ค.) สองเคสนี้จึงเช็คแค่ว่าหน้าจอกับ API ต่อกันจริง ส่วนกฎธุรกิจ
  เช่นสัญญาซ้อนหรือการคำนวณค่าเช่าอยู่ใน LeaseApiTest ฝั่ง backend แล้ว ไม่เช็คซ้ำที่นี่

  ห้อง 211 กับ 212 เลือกเพราะข้อมูลตั้งต้น (DevDataSeeder) และเทส live ตัวอื่นไม่ได้ใช้

  ข้อจำกัดเรื่องเก็บกวาด: ระบบตั้งใจไม่ให้ลบสัญญา และผู้เช่าที่เคยมีสัญญาก็ลบไม่ได้
  (TenantService.delete ตอบ 409) ทุกรอบที่รันจึงเหลือผู้เช่าหนึ่งคนกับสัญญาที่ปิดแล้วหนึ่งฉบับ
  ต่อเคสค้างอยู่ในฐานข้อมูล ทำได้แค่ปิดสัญญาเพื่อคืนห้องให้ว่างเหมือนเดิม
  ชื่อผู้เช่าขึ้นต้นด้วย "QA Contract" จะได้แยกออกจากข้อมูลจริงได้ง่าย
*/

interface LeaseJson {
  id: number
  roomNumber: string
  tenantName: string
  billingCycle: 'MONTHLY' | 'YEARLY'
  status: 'ACTIVE' | 'ENDED'
}

interface RoomJson {
  id: number
  roomNumber: string
  status: 'AVAILABLE' | 'OCCUPIED' | 'MAINTENANCE'
}

function roomByNumber(roomNumber: string): Cypress.Chainable<RoomJson> {
  return api<RoomJson[]>('GET', '/api/rooms').then((response) => {
    expect(response.status).to.eq(200)
    const room = response.body.find((r) => r.roomNumber === roomNumber)
    if (!room) throw new Error(`ไม่พบห้อง ${roomNumber} ในฐานข้อมูล`)
    return room
  })
}

/*
  backend ไม่มี GET /api/leases/{id} มีแต่รายการที่กรองได้ จึงกรองด้วย tenantId
  ผู้เช่าของเทสสร้างใหม่ทุกรอบ จึงมีสัญญาอยู่ฉบับเดียวเสมอ
*/
function leaseById(id: number, tenantId: number): Cypress.Chainable<LeaseJson> {
  return api<LeaseJson[]>('GET', `/api/leases?tenantId=${tenantId}`).then((response) => {
    expect(response.status).to.eq(200)
    const lease = response.body.find((l) => l.id === id)
    if (!lease) throw new Error(`ไม่พบสัญญา ${id} ของผู้เช่า ${tenantId} ในฐานข้อมูล`)
    return lease
  })
}

/*
  ห้องต้องว่างก่อนเริ่ม ถ้าไม่ว่างแปลว่ารอบก่อนพังกลางทางแล้วปิดสัญญาไม่ทัน
  บอกสาเหตุตรง ๆ ดีกว่าปล่อยให้ไปพังที่ dropdown หาห้องไม่เจอ
*/
function expectRoomAvailable(roomNumber: string): Cypress.Chainable<RoomJson> {
  return roomByNumber(roomNumber).then((room) => {
    expect(
      room.status,
      `ห้อง ${roomNumber} ต้องว่างก่อนเริ่มเทส ถ้ามีสัญญาของ "QA Contract ..." ค้างอยู่ ให้ Check Out จากหน้า Dashboard ก่อน`,
    ).to.eq('AVAILABLE')
    return room
  })
}

/** สร้างผู้เช่าผ่าน API เพราะการเพิ่มผู้เช่าผ่านหน้าจอมี E2E-LIVE-TENANT-001 คุมอยู่แล้ว */
function createTenant(fullName: string): Cypress.Chainable<number> {
  return api<{ id: number }>('POST', '/api/tenants', {
    fullName,
    nationalId: newThaiNationalId(),
    phone: '089-123-4567',
  }).then((response) => {
    expect(response.status, 'สร้างผู้เช่าสำหรับเทสไม่สำเร็จ').to.eq(201)
    return response.body.id
  })
}

/*
  ปิดสัญญาผ่าน API เป็นการเก็บกวาด คืนห้องให้ว่าง ปิดซ้ำไม่ได้จึงเช็คสถานะก่อน

  ฟังก์ชันนี้รันใน afterEach จึงห้าม assert เพราะ afterEach ที่พังทำให้ Cypress ข้ามเคสที่เหลือทั้งไฟล์
  ปิดไม่สำเร็จจึงแค่บันทึกลง log ของ Cypress ให้รู้ว่าห้องค้าง ส่วนสัญญาที่หาไม่เจอก็ยังลองปิด
  อย่างแย่ backend ตอบ 4xx ซึ่งไม่ทำให้อะไรพัง จะเรียกซ้ำกี่รอบก็ได้
*/
function endLeaseIfActive(leaseId: number, tenantId: number): void {
  api<LeaseJson[]>('GET', `/api/leases?tenantId=${tenantId}`).then((response) => {
    const lease = response.status === 200 ? response.body.find((l) => l.id === leaseId) : undefined
    if (lease?.status === 'ENDED') return
    api('POST', `/api/leases/${leaseId}/terminate`, { endDate: todayInBangkok() }).then((ended) => {
      if (ended.status !== 200) {
        Cypress.log({
          name: 'cleanup',
          message: `ปิดสัญญาที่เทสสร้างไม่สำเร็จ ห้องจะค้างเป็น Occupied (HTTP ${ended.status})`,
        })
      }
    })
  })
}

/*
  ตาราง Contracts แบ่งหน้าละ 5 แถว เรียงวันเริ่มสัญญาใหม่สุดก่อน แต่สัญญาที่ปิดแล้วจากรอบก่อน ๆ
  ก็เริ่มวันนี้เหมือนกัน ถ้ารันหลายรอบในวันเดียว แถวของเราอาจตกไปหน้าถัดไป
  หน้านี้ไม่มีช่องค้นหา จึงไล่กด Next page จนเจอหรือหมดหน้า

  helper นี้ไม่คืนค่า แค่ต่อคำสั่งลงคิว พอคิวเดินถึงคำสั่งถัดไปของเทส ตารางจะอยู่หน้าที่มีแถวนั้นแล้ว
  เทสจึงหาแถวต่อเองด้วย findByRole
*/
function findContractRow(tenantName: string): void {
  cy.findByRole('link', { name: 'Contracts' }).click()
  cy.findByRole('heading', { name: 'Contract Management' }).should('be.visible')
  // แถวที่ 0 คือหัวตาราง รอแถวข้อมูลแถวแรกก่อน ไม่อย่างนั้นจะนับแถวตอนตารางยังโหลดไม่เสร็จ
  cy.findAllByRole('row').eq(1).should('be.visible')
  // เพดาน 20 หน้ากันวนไม่จบ ถ้าวันหนึ่งปุ่ม Next ไม่ถูกปิดที่หน้าสุดท้าย
  turnPagesUntilRow(tenantName, 20)
}

function turnPagesUntilRow(tenantName: string, pagesLeft: number): void {
  cy.findAllByRole('row').then(($rows) => {
    const found = [...$rows].some((row) => (row.textContent ?? '').includes(tenantName))
    if (found || pagesLeft === 0) return

    cy.findByRole('button', { name: 'Next page' }).then(($next) => {
      if ($next.is(':disabled')) return

      const firstRowBefore = $rows.eq(1).text()
      cy.findByRole('button', { name: 'Next page' }).click()
      // รอให้หน้าถัดไปขึ้นก่อนค่อยนับใหม่ ถ้านับทันทีจะได้แถวของหน้าเดิมที่ยังค้างอยู่
      cy.findAllByRole('row').eq(1).should('not.have.text', firstRowBefore)
      turnPagesUntilRow(tenantName, pagesLeft - 1)
    })
  })
}

describe('contracts (live-api)', () => {
  afterEach(runCleanups)

  it('E2E-LIVE-CONTRACT-001: A contract created from the form is saved and turns the room Occupied', () => {
    cy.signInLive()

    const unit = '211'
    expectRoomAvailable(unit)
    const tenantName = uniqueName('QA Contract')
    createTenant(tenantName).then((tenantId) => {
      cy.findByRole('link', { name: 'Contracts' }).click()
      cy.findByRole('button', { name: 'Create Contract' }).click()

      cy.intercept({ method: 'POST', pathname: /^\/api\/leases$/ }).as('createLease')
      cy.findByRole('dialog', { name: 'Create Contract' }).within(() => {
        // dropdown ของฟอร์มมี <select> ซ่อนอยู่ข้างใต้ (CustomSelect) เลือกผ่านตัวนั้นแบบเดียวกับชุด mock
        // ตัวนั้นซ่อนด้วย sr-only Cypress จึงมองว่าไม่เห็นบนจอ ต้องใส่ force
        cy.get('#unit-select').select(`${unit} · Floor 2`, { force: true })
        cy.get('#tenant-select').select(tenantName, { force: true })
        // YEARLY เพื่อพิสูจน์ว่าค่าที่เลือกบนหน้าจอเดินทางถึงฐานข้อมูลจริง ไม่ใช่ค่าตั้งต้น MONTHLY
        cy.get('#billing-cycle').select('YEARLY', { force: true })

        cy.findByRole('button', { name: 'Create Contract' }).click()
      })

      cy.wait('@createLease').then(({ response }) => {
        expect(response?.statusCode, 'สร้างสัญญาไม่สำเร็จ').to.eq(201)
        const leaseId = (response?.body as { id: number }).id
        onCleanup(() => endLeaseIfActive(leaseId, tenantId))
        cy.findByRole('dialog', { name: 'Create Contract' }).should('not.exist')

        // รีโหลดทั้งหน้า ข้อมูลที่เห็นหลังจากนี้ต้องมาจากฐานข้อมูล ไม่ใช่ state ในหน้าเว็บ
        cy.reload()
        findContractRow(tenantName)
        cy.findByRole('row', { name: new RegExp(tenantName) }).should('contain.text', 'Active')

        leaseById(leaseId, tenantId).then((saved) => {
          expect(saved.roomNumber).to.eq(unit)
          expect(saved.billingCycle).to.eq('YEARLY')
          expect(saved.status).to.eq('ACTIVE')
        })

        cy.findByRole('link', { name: 'Dashboard' }).click()
        cy.findByLabelText(`Unit ${unit}`).should('contain.text', tenantName)
        roomByNumber(unit).then((room) => {
          expect(room.status).to.eq('OCCUPIED')
        })
      })
    })
  })

  it('E2E-LIVE-CONTRACT-002: Checking out from the Dashboard ends the contract and frees the room', () => {
    cy.signInLive()

    const unit = '212'
    const card = () => cy.findByLabelText(`Unit ${unit}`)
    const tenantName = uniqueName('QA Contract')
    expectRoomAvailable(unit).then((room) => {
      createTenant(tenantName).then((tenantId) => {
        // สัญญาตั้งต้นสร้างผ่าน API เพราะเคสนี้พิสูจน์การปิดสัญญา การสร้างผ่านหน้าจอคือเคส 001
        api<{ id: number }>('POST', '/api/leases', {
          roomId: room.id,
          tenantId,
          startDate: todayInBangkok(),
          billingCycle: 'MONTHLY',
        }).then((created) => {
          expect(created.status, 'สร้างสัญญาสำหรับเทสไม่สำเร็จ').to.eq(201)
          const leaseId = created.body.id
          onCleanup(() => endLeaseIfActive(leaseId, tenantId))

          // สัญญาที่เพิ่งสร้างผ่าน API ยังไม่อยู่ในหน้าที่โหลดไว้ ต้องโหลดใหม่ก่อน
          cy.reload()
          card().should('contain.text', tenantName)

          card().click()
          cy.findByRole('button', { name: 'Check Out' }).click()

          cy.intercept({ method: 'POST', pathname: new RegExp(`^/api/leases/${leaseId}/terminate$`) }).as(
            'endLease',
          )
          cy.findByRole('dialog', { name: 'Confirm Check Out' })
            .findByRole('button', { name: 'Confirm Check Out' })
            .click()
          cy.wait('@endLease').then(({ response }) => {
            expect(response?.statusCode, 'ปิดสัญญาไม่สำเร็จ').to.eq(200)
          })
          cy.findByRole('dialog', { name: 'Confirm Check Out' }).should('not.exist')

          cy.reload()
          card().should('not.contain.text', tenantName)
          roomByNumber(unit).then((freed) => {
            expect(freed.status).to.eq('AVAILABLE')
          })
          leaseById(leaseId, tenantId).then((lease) => {
            expect(lease.status).to.eq('ENDED')
          })

          findContractRow(tenantName)
          cy.findByRole('row', { name: new RegExp(tenantName) }).should('contain.text', 'Ended')
        })
      })
    })
  })
})
