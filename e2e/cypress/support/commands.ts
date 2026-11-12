// ============================== [NOTE] ==============================
// ไฟล์นี้: คำสั่งล็อกอินที่ทีมเพิ่มให้ Cypress เอง (Cypress.Commands.add) ไม่มีเทสในไฟล์นี้
// ทุกเคสเรียกบรรทัดเดียว cy.signIn() (ชุด mock) หรือ cy.signInLive() (ชุด live) ไม่ต้องเขียนกรอกฟอร์มซ้ำทุกไฟล์
// ล็อกอินผ่านหน้า Login จริงทุกครั้ง ไม่ลัดด้วยการยัด cookie เพราะ E2E ต้องเดินเส้นทางเดียวกับผู้ใช้
// ====================================================================

/*
  คำสั่งล็อกอินที่ทุกเคสใช้ ล็อกอินผ่านหน้า Login จริงเสมอ ไม่ลัดด้วยการยัด cookie เอง
  เพราะ E2E ต้องการพิสูจน์เส้นทางที่ผู้ใช้เดินจริง

  รหัสแอดมินไม่ฝังไว้ในโค้ด อ่านจาก E2E_ADMIN_PASSWORD ผ่าน cy.env() ซึ่งไม่พิมพ์ค่าลง log
  (ทีมย้ายรหัสทุกตัวออกจาก repo ไปไว้ใน .env ตามที่อาจารย์ทัก commit f22804e)
  ก่อนรันในเครื่อง (PowerShell)
    $env:E2E_ADMIN_PASSWORD='อะไรก็ได้'; npm test            ชุด mock/stubbed
    $env:E2E_ADMIN_PASSWORD='รหัสเดียวกับ APP_ADMIN_PASSWORD'; npm run test:live
*/

// [NOTE] บอก TypeScript ว่า cy มีคำสั่งใหม่สองตัวนี้ ไม่งั้น typecheck จะฟ้องว่าไม่รู้จัก cy.signIn
declare global {
  namespace Cypress {
    interface Chainable {
      /** ล็อกอินกับ backend จำลอง (ชุด mock-api) ซึ่งรับรหัสผ่านอะไรก็ได้ที่ไม่ว่าง แล้วรอจนแดชบอร์ดขึ้น */
      signIn(): Chainable<void>
      /** ล็อกอินกับ backend จริง (ชุด live-api) ต้องได้ 200 จาก POST /api/auth/login แล้วรอจนแดชบอร์ดขึ้น */
      signInLive(): Chainable<void>
    }
  }
}

// [NOTE] ฟังก์ชันนี้: กรอกหน้า Login (ใช้ร่วมทั้งสองคำสั่ง)
//   ชื่อผู้ใช้อ่านจาก Cypress.expose · รหัสอ่านจาก cy.env แล้วพิมพ์ด้วย log: false จึงไม่โผล่ใน Command Log
function fillCredentials() {
  cy.findByLabelText('Username').type(Cypress.expose('E2E_ADMIN_USERNAME'))
  cy.env(['E2E_ADMIN_PASSWORD']).then(({ E2E_ADMIN_PASSWORD }) => {
    // parseSpecialCharSequences ปิดไว้ รหัสที่มี { } จะได้ไม่ถูกตีความเป็นปุ่มพิเศษอย่าง {enter}
    cy.findByLabelText('Password').type(E2E_ADMIN_PASSWORD, { log: false, parseSpecialCharSequences: false })
  })
}

// [NOTE] cy.signIn() ชุด mock: เปิด /login → กรอก → กด Sign In → รอหัวข้อ Room Availability (หน้า Dashboard)
//   ไม่เช็คสถานะ API เพราะ backend ปลอมรับรหัสอะไรก็ได้
Cypress.Commands.add('signIn', () => {
  cy.visit('/login')
  fillCredentials()
  cy.findByRole('button', { name: 'Sign In' }).click()
  cy.findByRole('heading', { name: 'Room Availability' }).should('be.visible')
})

/*
  เช็คสถานะที่ backend ตอบก่อนเสมอ เพราะถ้ารหัสใน E2E_ADMIN_PASSWORD ไม่ตรงกับ
  APP_ADMIN_PASSWORD ที่ backend ใช้ตอนสตาร์ต เทสทุกตัวจะตายที่บรรทัดเดียวกันหมด
  พร้อมข้อความว่าหาหัวข้อ Room Availability ไม่เจอ ซึ่งไม่ได้บอกสาเหตุจริงเลย
*/
// [NOTE] cy.signInLive() ชุด live: เหมือน signIn แต่ดัก POST /api/auth/login ไว้ก่อน (intercept + as)
//   แล้ว cy.wait('@signInLive') ตรวจว่า backend จริงตอบ 200 ถ้าไม่ใช่จะบอกทันทีว่ารหัสไม่ตรงกับ backend
Cypress.Commands.add('signInLive', () => {
  cy.intercept({ method: 'POST', pathname: '/api/auth/login' }).as('signInLive')
  cy.visit('/login')
  fillCredentials()
  cy.findByRole('button', { name: 'Sign In' }).click()

  cy.wait('@signInLive').then(({ response }) => {
    const status = response?.statusCode
    expect(
      status,
      `ล็อกอินไม่ผ่าน (HTTP ${status}) — ตรวจว่า E2E_ADMIN_PASSWORD ตรงกับ APP_ADMIN_PASSWORD ` +
        'ที่ backend ใช้ตอนสตาร์ต และ backend ที่พอร์ต 8080 เป็นตัวเดียวกับที่ตั้งรหัสนั้นไว้',
    ).to.eq(200)
  })

  cy.findByRole('heading', { name: 'Room Availability' }).should('be.visible')
})

// [NOTE] export {} ทำให้ไฟล์นี้เป็น module ของ TypeScript จึงใช้ declare global ข้างบนได้
export {}
