// ============================== [NOTE] ==============================
// ไฟล์นี้: เอกสารสแกนกับฐานข้อมูลจริง 1 เคส (SSK-161, SSK-172)
// ชุด: live-api (พอร์ต 4175) — Vite proxy ส่ง /api → Spring Boot :8080 → PostgreSQL จริง ต้องเปิด docker compose ก่อน
// เทส: E2E-LIVE-DOCUMENT-001 อัปโหลดสแกนของสัญญาที่ seed ไว้ เปิดไฟล์จาก server แล้วลบผ่านหน้าจอ
// เก็บกวาด: ลบเอกสารที่สร้างผ่าน API ใน afterEach ถ้าเทสพังก่อนถึงขั้นลบ (เป็น soft delete ไบต์ยังอยู่ในฐานข้อมูล)
// ====================================================================

import { api, onCleanup, runCleanups, uniqueName } from '../../support/helpers'

/*
  ชุด mock มี E2E-DOCUMENTS-001 ถึง 003 คุมการกดอยู่แล้ว เคสนี้พิสูจน์ส่วนที่ backend จำลองพิสูจน์ไม่ได้:
  ไฟล์ส่งแบบ multipart ถึง Spring จริง ถูกเก็บใน PostgreSQL เปิดกลับมาได้หลัง reload
  และ endpoint ของตัวไฟล์ตอบ Content-Type จริงพร้อม nosniff ทั้งที่หน้าเว็บส่ง Accept: application/json
  กฎของไฟล์ (ขนาด ชนิด ลำดับการตรวจ) อยู่ใน AttachmentApiTest กับ DocumentApiTest ฝั่ง backend แล้ว

  ใช้สัญญาที่ active ฉบับแรกที่ DevDataSeeder สร้างไว้ ไม่สร้างสัญญาใหม่ เพราะสัญญาลบไม่ได้
*/

interface LeaseJson {
  id: number
  roomNumber: string
  tenantName: string
}

interface DocumentJson {
  id: number
  owner: { kind: string; id: number; roomNumber: string }
  sizeBytes: number
  sha256: string
  contentUrl: string
}

const PDF = {
  contents: Cypress.Buffer.from('%PDF-1.4\n% Sakura Soul live E2E\n'),
  fileName: 'qa-live-scan.pdf',
  mimeType: 'application/pdf',
}

/** SHA-256 ของไบต์ที่ให้ เป็นเลขฐานสิบหกตัวพิมพ์เล็ก เทียบกับ sha256 ที่ backend เก็บไว้ */
function sha256Hex(bytes: Uint8Array): Cypress.Chainable<string> {
  return cy.wrap(
    crypto.subtle.digest('SHA-256', new Uint8Array(bytes)).then((digest) =>
      [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join(''),
    ),
  )
}

function firstActiveLease(): Cypress.Chainable<LeaseJson> {
  return api<LeaseJson[]>('GET', '/api/leases?status=ACTIVE').then((response) => {
    expect(response.status).to.eq(200)
    const lease = response.body[0]
    if (!lease) {
      throw new Error('ไม่มีสัญญาที่ active ให้แนบเอกสาร ตรวจว่า backend รันโปรไฟล์ dev ที่มี DevDataSeeder')
    }
    return lease
  })
}

describe('documents (live-api)', () => {
  afterEach(() => {
    runCleanups()
  })

  it('E2E-LIVE-DOCUMENT-001: A contract scan is stored in PostgreSQL, opens from the server and is deleted', () => {
    const description = uniqueName('QA Document')
    cy.signInLive()

    firstActiveLease().then((lease) => {
      cy.intercept({ method: 'POST', pathname: '/api/documents' }).as('upload')
      cy.visit(`/documents?type=Contract&unit=${lease.roomNumber}&upload=1`)

      cy.findByRole('dialog', { name: 'Upload document' }).within(() => {
        // เลือกสัญญาเองด้วย id ไม่พึ่งตัวที่ถูกเลือกไว้ให้ ห้องเดียวกันอาจมีสัญญาอื่นในฐานข้อมูลที่ใช้มานาน
        cy.findByLabelText('Lease').find(`option[value="${lease.id}"]`).should('contain.text', lease.tenantName)
        cy.findByLabelText('Lease').select(String(lease.id), { force: true })
        cy.findByLabelText('Document file').selectFile(PDF, { force: true })
        cy.findByText(PDF.fileName).should('be.visible')
        cy.findByLabelText(/Description/).type(description)
        cy.findByRole('button', { name: 'Add to library' }).click()
      })
      cy.wait('@upload').then(({ response }) => {
        expect(response?.statusCode, 'POST /api/documents').to.eq(201)
        const created = response?.body as DocumentJson
        onCleanup(() => {
          api('DELETE', `/api/documents/${created.id}`)
        })
        expect(created.owner).to.include({ kind: 'LEASE', id: lease.id, roomNumber: lease.roomNumber })
      })

      // reload แล้วยังอยู่ แปลว่ามาจากฐานข้อมูล ไม่ใช่ state ของหน้าเว็บ
      cy.reload()
      cy.findByRole('row', { name: new RegExp(description) })
        .should('contain.text', `Unit ${lease.roomNumber}`)
        .and('contain.text', lease.tenantName)

      cy.intercept({ method: 'GET', pathname: '/api/attachments/*/content' }).as('content')
      cy.findByRole('button', { name: `View document ${description}` }).click()
      cy.wait('@content').then(({ response }) => {
        expect(response?.statusCode).to.eq(200)
        expect(response?.headers['content-type']).to.eq('application/pdf')
        expect(response?.headers['x-content-type-options']).to.eq('nosniff')
      })
      cy.findByRole('dialog', { name: description }).within(() => {
        cy.get('iframe').should('have.attr', 'src').and('match', /^blob:/)
        cy.findByRole('button', { name: 'Close' }).click()
      })

      cy.intercept({ method: 'DELETE', pathname: '/api/documents/*' }).as('delete')
      cy.findByRole('button', { name: `Delete document ${description}` }).click()
      cy.findByRole('dialog', { name: 'Confirm Delete Document' }).findByRole('button', { name: 'Delete' }).click()
      cy.wait('@delete').its('response.statusCode').should('eq', 204)
      cy.findByText(description).should('not.exist')
      api<DocumentJson[]>('GET', `/api/documents?q=${encodeURIComponent(description)}`).then((response) => {
        expect(response.status).to.eq(200)
        expect(response.body, 'เอกสารที่ลบแล้วต้องไม่อยู่ในผลค้น').to.have.length(0)
      })
    })
  })

  /*
    SSK-161 — ไฟล์ที่อัปโหลดต้องกลับมาเป็นไบต์เดิมทุกไบต์ ไม่ใช่แค่เปิดได้เป็น PDF

    E2E-LIVE-DOCUMENT-001 คุมว่าไฟล์เปิดจาก server ได้ แต่ไฟล์ของมันมีแต่ตัวอักษร ASCII ถ้าชั้นไหนอ่านไฟล์เป็นข้อความ
    (multipart, ตัวกรองคำขอ, คอลัมน์ในฐานข้อมูล) ไบต์ที่ไม่ใช่ UTF-8 จะเพี้ยนโดยที่เคสนั้นไม่เห็น
    เคสนี้จึงใช้ไฟล์ที่มีครบทั้ง 256 ค่าของไบต์ แล้วเทียบสามที่: ขนาดกับ sha256 ที่ backend คำนวณเก็บไว้
    กับไบต์ที่ดาวน์โหลดกลับมาจริง ว่าตรงกับไฟล์ที่ส่งไป

    ใช้สัญญา active ฉบับแรกของ DevDataSeeder เหมือน DOCUMENT-001 ลบเอกสารทิ้งตอนจบ (soft delete)
  */
  it('E2E-LIVE-DOC-001: A file with every byte value comes back from the server byte for byte', () => {
    const description = uniqueName('QA Bytes')
    // %PDF- นำหน้าให้ผ่านการตรวจลายเซ็น ตามด้วยไบต์ 0x00 ถึง 0xFF ครบทุกค่า รวมค่าที่ไม่ใช่ UTF-8 ที่ถูกต้อง
    const sent = Uint8Array.from([
      ...Array.from('%PDF-1.4\n', (ch) => ch.charCodeAt(0)),
      ...Array.from({ length: 256 }, (_, value) => value),
    ])
    cy.signInLive()

    firstActiveLease().then((lease) => {
      cy.intercept({ method: 'POST', pathname: '/api/documents' }).as('upload')
      cy.visit(`/documents?type=Contract&unit=${lease.roomNumber}&upload=1`)

      cy.findByRole('dialog', { name: 'Upload document' }).within(() => {
        cy.findByLabelText('Lease').select(String(lease.id), { force: true })
        cy.findByLabelText('Document file').selectFile(
          { contents: Cypress.Buffer.from(sent), fileName: 'qa-live-bytes.pdf', mimeType: 'application/pdf' },
          { force: true },
        )
        cy.findByLabelText(/Description/).type(description)
        cy.findByRole('button', { name: 'Add to library' }).click()
      })

      cy.wait('@upload').then(({ response }) => {
        expect(response?.statusCode, 'POST /api/documents').to.eq(201)
        const created = response?.body as DocumentJson
        onCleanup(() => {
          api('DELETE', `/api/documents/${created.id}`)
        })

        expect(created.sizeBytes, 'ขนาดที่ backend เก็บ').to.eq(sent.length)
        sha256Hex(sent).then((expected) => {
          expect(created.sha256, 'sha256 ที่ backend คำนวณจากไฟล์ที่รับ').to.eq(expected)
        })

        // ดาวน์โหลดกลับมาเป็นไบต์ดิบ (encoding binary = แต่ละอักขระคือหนึ่งไบต์) แล้วเทียบทีละไบต์
        cy.request({ url: created.contentUrl, encoding: 'binary' }).then((download) => {
          expect(download.status).to.eq(200)
          const received = Uint8Array.from(Cypress.Buffer.from(download.body as string, 'binary'))
          expect(received.length, 'ขนาดของไฟล์ที่ดาวน์โหลด').to.eq(sent.length)
          expect(Array.from(received), 'ไบต์ของไฟล์ที่ดาวน์โหลดต้องเหมือนที่ส่งไปทุกไบต์').to.deep.eq(Array.from(sent))
          sha256Hex(received).then((actual) => {
            expect(actual, 'sha256 ของไฟล์ที่ดาวน์โหลด').to.eq(created.sha256)
          })
        })
      })
    })
  })
})
