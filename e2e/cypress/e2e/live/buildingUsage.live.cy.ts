// ============================== [NOTE] ==============================
// ไฟล์นี้: ภาพรวมการใช้น้ำไฟทั้งตึกกับฐานข้อมูลจริง 1 เคส (SSK-181)
// ชุด: live-api (พอร์ต 4175) — Vite proxy ส่ง /api → Spring Boot :8080 → PostgreSQL จริง ไม่มีของปลอม ต้องเปิด docker compose ก่อน
// เทส: E2E-LIVE-USAGE-001 ทุกปีของข้อมูลตัวอย่าง 36 เดือน ผลรวมรายเดือนเท่ากับรายปี การ์ดตรงกับตาราง และเทียบปีได้
// เคสนี้อ่านอย่างเดียว ไม่แก้ข้อมูล จึงไม่ต้องเก็บกวาด
// รัน: cd e2e → ตั้ง $env:E2E_ADMIN_PASSWORD → npm run open:live แล้วคลิกไฟล์นี้ · หรือ npm run test:live
// ====================================================================

import { api } from '../../support/helpers'

/*
  SSK-181 — GET /api/usage/building (ไม่มี migration)
  โปรไฟล์ dev ใส่ประวัติการใช้น้ำไฟย้อนหลัง 36 เดือนให้ห้อง 107-109 กับ 207-209 (UsageHistorySeeder)
  เกณฑ์ของการ์ด: ข้อมูลสามปีได้จุดต่อเนื่อง และผลรวมของทุกจุดรายเดือนเท่ากับผลรวมรายปีรวมกัน
*/

/** ใช้แค่ช่องเหล่านี้จาก GET /api/usage/building */
interface Point {
  period: string
  electricUnits: number | null
  waterUnits: number | null
}
interface Report {
  points: Point[]
  summary: { electricUnits: number | null; monthsWithData: number }
}

function amount(text: string): number {
  return Number(text.replace(/[^0-9.]/g, ''))
}

function sumOf(points: Point[]): number {
  return points.reduce((total, p) => total + (p.electricUnits ?? 0), 0)
}

describe('building usage (live-api)', () => {
  it('E2E-LIVE-USAGE-001: Every year of the sample history adds up the same by month and by year, and the page shows it', () => {
    cy.signInLive()
    cy.visit('/usage')
    // dev server ของชุด live รันใน StrictMode ซึ่งยิงคำขอตอนเปิดหน้าซ้ำสองครั้ง จึงดักหลังตารางแรกขึ้นแล้ว
    // คำขอที่รอจึงเป็นของปุ่ม All years แน่นอน ไม่ใช่คำขอซ้ำของตอนเปิดหน้า
    cy.findByRole('table').should('be.visible')
    cy.intercept({ method: 'GET', pathname: '/api/usage/building' }).as('usage')

    cy.findByRole('button', { name: 'All years' }).click()
    cy.wait('@usage').then(({ request, response }) => {
      expect(response?.statusCode).to.eq(200)
      const report = response?.body as Report
      // เดือนที่มีข้อมูลคือเดือนที่มีหน่วยน้ำหรือไฟอย่างใดอย่างหนึ่ง แบบเดียวกับ summary.monthsWithData
      const withData = report.points.filter((p) => p.electricUnits !== null || p.waterUnits !== null)
      // ข้อมูลตัวอย่างสามปีเต็ม ได้อย่างน้อย 36 เดือนที่มีข้อมูล
      expect(withData.length).to.be.at.least(36)
      expect(report.summary.monthsWithData).to.eq(withData.length)
      expect(sumOf(report.points)).to.be.closeTo(report.summary.electricUnits ?? 0, 0.01)

      // ช่วงเดียวกันแบบรายปี ผลรวมทุกปีต้องเท่ากับผลรวมทุกเดือน
      const query = new URL(request.url).searchParams
      const range = `from=${query.get('from')}&to=${query.get('to')}&metric=electric`
      api<Report>('GET', `/api/usage/building?${range}&granularity=year`).then((years) => {
        expect(years.status).to.eq(200)
        expect(sumOf(years.body.points)).to.be.closeTo(sumOf(report.points), 0.01)
      })

      api<string>('GET', `/api/usage/building.csv?${range}&granularity=month`).then((csv) => {
        expect(csv.status).to.eq(200)
        const lines = String(csv.body).replace(String.fromCharCode(0xfeff), '').trim().split(/\r\n/)
        expect(lines[0]).to.eq('period,occupied_rooms,rooms_with_data,rooms_with_amount,months_with_data,electric_units,electric_amount')
        expect(lines[lines.length - 1]).to.match(/^Total,/)
      })

      // ตารางตัดหัวท้ายที่ไม่มีข้อมูลออก และการ์ดเท่ากับผลรวมของคอลัมน์หน่วย
      cy.findByRole('table')
        .find('tbody tr')
        .should('have.length.at.least', 36)
        .then((rows) => {
          const tableSum = [...rows]
            .map((row) => row.querySelectorAll('td')[1]?.textContent ?? '')
            .filter((text) => text !== 'No data')
            .reduce((total, text) => total + amount(text), 0)
          expect(tableSum).to.be.closeTo(sumOf(report.points), 0.01)
        })
      cy.findByText('Electricity usage', { selector: 'p' })
        .parent()
        .find('p')
        .eq(1)
        .invoke('text')
        .then((card) => expect(amount(card)).to.be.closeTo(sumOf(report.points), 0.01))
    })

    // สามปีขึ้นไปในโหมดเทียบปี หนึ่งเส้นต่อปี
    cy.findByRole('button', { name: 'Compare years' }).click()
    cy.findByRole('img', { name: /Electricity usage by year/ }).should('be.visible')
    cy.findByRole('list', { name: 'Legend' }).findAllByRole('listitem').should('have.length.at.least', 3)
  })
})
