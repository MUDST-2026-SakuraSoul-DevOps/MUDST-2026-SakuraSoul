// ============================== [NOTE] ==============================
// ไฟล์นี้: ผังตึกกับฐานข้อมูลจริง 1 เคส (SSK-160)
// ชุด: live-api (พอร์ต 4175) — Vite proxy ส่ง /api → Spring Boot :8080 → PostgreSQL จริง ไม่มีของปลอม ต้องเปิด docker compose ก่อน
// เทส: E2E-LIVE-UNITS-001 ขยายผังเพิ่มชั้นแล้วห้องใหม่ถูกสร้างในฐานข้อมูลจริง ห้องเดิมไม่ถูกแตะ
// แบบของทุกเคส live: ล็อกอินจริง (cy.signInLive) → ทำผ่านหน้าจอ → ดักคำขอด้วย cy.intercept + cy.wait → cy.reload() พิสูจน์ว่ามาจากฐานข้อมูล → afterEach(runCleanups) คืนข้อมูล
// รัน: cd e2e → ตั้ง $env:E2E_ADMIN_PASSWORD → npm run open:live แล้วคลิกไฟล์นี้ · หรือ npm run test:live
// ====================================================================

import { api, onCleanup, runCleanups } from '../../support/helpers'

/*
  SSK-160 — ผังตึกตั้งค่าได้ (PUT /api/building-config) เข้ามาพร้อม #198 (V16)

  ชุด mock-api มีเคสผังตึกอยู่แล้ว (E2E-UNITS-001/006/007) แต่ทั้งหมดคุยกับ backend จำลอง
  ในเบราว์เซอร์ ซึ่งเก็บห้องไว้ใน memory รีโหลดแล้วกลับเป็นค่าตั้งต้น จึงพิสูจน์ไม่ได้ว่า
  ห้องถูก "สร้างจริง" ใน PostgreSQL เคสนี้จึงกดผ่านหน้าจอ แล้วถามฐานข้อมูลซ้ำสองทาง
  คือรีโหลดทั้งหน้า และอ่าน GET /api/rooms ตรง ๆ

  ทิศทางที่ปลอดภัย: **ขยายผัง** (เพิ่มชั้น) เท่านั้น ห้องที่เพิ่มมาใหม่ไม่มีประวัติสัญญาหรืองานซ่อม
  จึงลบคืนได้ตอนเก็บกวาด ถ้าทำกลับทาง (ย่อผังก่อน) backend จะตอบ 409 เพราะห้องชั้น 2
  ของข้อมูลตัวอย่างมีสัญญาอยู่ (กฎใน BuildingConfigService) เทสจะพังเพราะข้อมูล ไม่ใช่เพราะโปรแกรมผิด

  เทสนี้แก้ข้อมูลจริงของระบบ จบแล้วจึง PUT ผังเดิมกลับทุกครั้ง ทั้งตอนผ่านและตอนพังกลางทาง
*/

/** รูปร่างของ GET /api/building-config */
interface BuildingConfig {
  floors: number
  roomsPerFloor: number
  totalRooms: number
}

/** ใช้แค่สามช่องนี้จาก GET /api/rooms */
interface Room {
  id: number
  roomNumber: string
  floor: number
}

/** ป็อปอัป Apartment Settings ที่เปิดอยู่ */
function layoutDialog() {
  return cy.findByRole('dialog')
}

// [NOTE] openLayout: Units → ปุ่ม Apartment settings → รอช่องจำนวนชั้นขึ้น
function openLayout() {
  cy.findByRole('link', { name: 'Units' }).click()
  cy.findByRole('button', { name: 'Apartment settings' }).click()
  layoutDialog().findByText('Apartment Settings').should('be.visible')
  layoutDialog().findByLabelText(/Number of floors/).should('be.visible')
}

describe('buildingLayout (live-api)', () => {
  afterEach(runCleanups)

// [NOTE] E2E-LIVE-UNITS-001 (SSK-160)
//   เตรียม: GET /api/building-config อ่านผังเดิม → onCleanup จด PUT คืนผังเดิม → GET /api/rooms เก็บรายการห้องก่อนแก้
//   กด: Units → Apartment settings → ตั้งจำนวนชั้น +1 → ป็อปอัปต้องขึ้น "Adds N units" → Save Layout → รอ PUT 200
//   ตรวจ: การ์ดสรุปขึ้นชั้นใหม่กับจำนวนห้องใหม่ → cy.reload() → ปุ่มของห้องชั้นใหม่ยังอยู่ (มาจากฐานข้อมูล ไม่ใช่ state ในหน้า)
//         → GET /api/rooms: จำนวนห้องเพิ่มเท่ากับห้องต่อชั้นพอดี · ห้องเดิมทุกห้องยังอยู่ด้วย id เดิมและเลขห้องเดิม
//   เก็บกวาด: afterEach(runCleanups) PUT ผังเดิมกลับ ห้องที่เพิ่งเพิ่มไม่มีประวัติจึงถูกลบคืนได้
  it('E2E-LIVE-UNITS-001: Adding a floor creates the new units in the database and leaves existing units untouched', () => {
    cy.signInLive()

    api<BuildingConfig>('GET', '/api/building-config').then((configRes) => {
      expect(configRes.status, 'อ่านผังเดิมจาก GET /api/building-config ไม่สำเร็จ').to.eq(200)
      const { floors, roomsPerFloor } = configRes.body

      // คืนผังเดิมเสมอ ส่ง newRoomType ไปด้วยเพราะ BuildingConfigRequest รับสามช่อง
      // (ย่อผังกลับไม่ได้สร้างห้องใหม่ ค่านี้จึงไม่มีผล ขอแค่เป็นค่าที่ถูกต้อง)
      onCleanup(() => {
        api('PUT', '/api/building-config', { floors, roomsPerFloor, newRoomType: 'SINGLE' })
      })

      const newFloor = floors + 1
      const firstNewUnit = `${newFloor}01`

      api<Room[]>('GET', '/api/rooms').then((roomsRes) => {
        expect(roomsRes.status, 'อ่านรายการห้องก่อนแก้ผังไม่สำเร็จ').to.eq(200)
        const before = roomsRes.body
        expect(
          before.map((room) => room.roomNumber),
          `ห้อง ${firstNewUnit} ต้องยังไม่มีก่อนเริ่มเทส ไม่งั้นเคสนี้พิสูจน์การสร้างห้องไม่ได้`,
        ).not.to.include(firstNewUnit)

        cy.intercept('PUT', '/api/building-config').as('saveLayout')

        openLayout()
        layoutDialog().findByLabelText(/Number of floors/).clear().type(String(newFloor))
        // สรุปในฟอร์มต้องบอกว่าจะเพิ่มกี่ห้องก่อนกดบันทึก ไม่ใช่เพิ่มเงียบ ๆ
        layoutDialog().should('contain.text', `Adds ${roomsPerFloor} unit`)
        layoutDialog().findByRole('button', { name: 'Save Layout' }).click()
        cy.wait('@saveLayout').its('response.statusCode').should('eq', 200)
        layoutDialog().should('not.exist')

        // การ์ดสรุปบนหน้า Units อ่านจาก API ไม่ใช่เลขตายตัว
        cy.findByText('Floors').parent().should('contain.text', String(newFloor))
        cy.findByText('Total Units').parent().should('contain.text', String(before.length + roomsPerFloor))

        // รีโหลดทั้งหน้าแล้วห้องใหม่ยังอยู่ = มาจาก PostgreSQL ไม่ใช่ state ที่ค้างในหน้า
        cy.reload()
        cy.findByRole('link', { name: 'Units' }).click()
        cy.findByRole('button', { name: `Set status for unit ${firstNewUnit}` }).should('exist')

        // และถามฐานข้อมูลตรง ๆ อีกชั้น
        api<Room[]>('GET', '/api/rooms').then((afterRes) => {
          expect(afterRes.status, 'อ่านรายการห้องหลังแก้ผังไม่สำเร็จ').to.eq(200)
          const after = afterRes.body

          expect(after.length, 'จำนวนห้องต้องเพิ่มเท่ากับห้องต่อชั้นพอดี ไม่มากไม่น้อย')
            .to.eq(before.length + roomsPerFloor)

          const numbers = after.map((room) => room.roomNumber)
          for (let index = 1; index <= roomsPerFloor; index += 1) {
            expect(numbers, `ห้องของชั้นใหม่ต้องถูกสร้างครบ`)
              .to.include(`${newFloor}${String(index).padStart(2, '0')}`)
          }
          expect(
            after.filter((room) => room.floor === newFloor).length,
            'ชั้นใหม่ต้องมีห้องเท่ากับห้องต่อชั้น',
          ).to.eq(roomsPerFloor)

          // ห้องเดิมทุกห้องยังอยู่ด้วย id เดิมและเลขห้องเดิม (SSK-160 ห้ามแตะห้องเดิม)
          before.forEach((old) => {
            const kept = after.find((room) => room.id === old.id)
            expect(kept, `ห้อง ${old.roomNumber} (id ${old.id}) ต้องยังอยู่หลังขยายผัง`).to.not.be.undefined
            expect(kept?.roomNumber, `เลขห้องของ id ${old.id} ต้องไม่เปลี่ยน`).to.eq(old.roomNumber)
            expect(kept?.floor, `ชั้นของห้อง ${old.roomNumber} ต้องไม่เปลี่ยน`).to.eq(old.floor)
          })
        })
      })
    })
  })
})
