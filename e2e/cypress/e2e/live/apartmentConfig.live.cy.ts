import { api, onCleanup, runCleanups } from '../../support/helpers'

/*
  SSK-123 — อัตราค่าไฟที่ตั้งในหน้า Apartment Config ต้องถูกบันทึกลงฐานข้อมูลจริง

  ชุด mock-api เช็คได้แค่ว่าค่าถูกส่งต่อภายในหน้าเว็บ เพราะข้อมูลอยู่ใน memory
  พอรีโหลดก็กลับไปเป็นค่าตั้งต้นอยู่แล้ว เทสนี้จึงกดบันทึก แล้ว "รีโหลดทั้งหน้า"
  ก่อนเปิดดูใหม่ ถ้าค่ายังอยู่แปลว่า PUT /api/apartment-config เขียนลง PostgreSQL จริง

  เทสนี้แก้ข้อมูลจริงของระบบ จบแล้วจึงตั้งค่ากลับเป็นค่าเดิมเสมอ อ่านอัตราชุดเดิมจาก
  GET /api/apartment-config ไว้ก่อนแตะอะไร แล้วให้ afterEach PUT กลับทั้งสี่ช่อง
  ทั้งตอนเทสผ่านและตอนพังกลางทาง
*/

const ELECTRIC = /Electricity Rate per Unit/

/** สี่ช่องที่ PUT /api/apartment-config รับ ไม่ส่ง updatedAt กลับไป เพราะ backend เป็นคนตั้งเอง */
interface UtilityRates {
  electricRatePerUnit: number
  waterRatePerUnit: number
  commonAreaFee: number
  internetFee: number
}

/** ป็อปอัป Apartment Config ที่เปิดอยู่ */
function configDialog() {
  return cy.findByRole('dialog')
}

function openConfig() {
  cy.findByRole('link', { name: 'Units' }).click()
  cy.findByRole('button', { name: 'Config' }).click()
  configDialog().findByLabelText(ELECTRIC).should('be.visible')
}

function saveRate(rate: string) {
  openConfig()
  configDialog().findByLabelText(ELECTRIC).clear().type(rate)
  configDialog().findByRole('button', { name: 'Save Rates' }).click()
  configDialog().should('not.exist')
}

describe('apartmentConfig (live-api)', () => {
  afterEach(runCleanups)

  it('E2E-LIVE-CONFIG-001: A saved electricity rate survives a page reload', () => {
    cy.signInLive()

    api<UtilityRates>('GET', '/api/apartment-config').then((res) => {
      expect(res.status, 'อ่านอัตราชุดเดิมจาก GET /api/apartment-config ไม่สำเร็จ').to.eq(200)
      const { electricRatePerUnit, waterRatePerUnit, commonAreaFee, internetFee } = res.body
      const rates: UtilityRates = { electricRatePerUnit, waterRatePerUnit, commonAreaFee, internetFee }
      onCleanup(() => {
        api('PUT', '/api/apartment-config', rates)
      })
    })

    openConfig()
    configDialog()
      .findByLabelText(ELECTRIC)
      .invoke('val')
      .then((value) => {
        const original = String(value)
        configDialog().findByRole('button', { name: 'Cancel' }).click()
        configDialog().should('not.exist')

        // ใช้เลขที่ไม่ตรงกับค่าตั้งต้น (50) เพื่อแยกว่าอ่านค่าจากฐานข้อมูลจริง ไม่ใช่บังเอิญตรง
        const changed = original === '73' ? '74' : '73'

        saveRate(changed)

        cy.reload()
        openConfig()
        configDialog().findByLabelText(ELECTRIC).should('have.value', changed)
        configDialog().findByRole('button', { name: 'Cancel' }).click()
        configDialog().should('not.exist')
      })
  })
})
