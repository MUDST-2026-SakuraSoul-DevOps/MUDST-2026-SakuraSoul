// ============================== [NOTE] ==============================
// ไฟล์นี้: คลังเอกสารกลางกับสิทธิ์การเข้าถึง 3 เคส (SSK-161, SSK-172, SSK-176)
// ชุด: mock-api (พอร์ต 4173) — คำขอ /api ถูกตอบโดย backend ปลอมในเบราว์เซอร์ (frontend/src/api/mockApi.ts) ข้อมูลอยู่ใน memory
// เทส: E2E-DOC-001 อัปโหลดเอกสารแล้วขึ้นในคลัง ค้นหาเจอ และกรองตามห้องได้
//      E2E-DOC-002 แท็บหมวดเอกสารกรองเฉพาะหมวดนั้น และลบเอกสารต้องยืนยันก่อน
//      E2E-TEAM-001 เปลี่ยน role ของสมาชิกและติ๊กสิทธิ์ในตาราง แล้วค่ายังอยู่หลังออกจากหน้าไปกลับ
// รัน: cd e2e → $env:E2E_ADMIN_PASSWORD='x'; npm test
// ====================================================================

/*
  SSK-161 คลังไฟล์กลาง · SSK-172 คลังเอกสารสแกน · SSK-176 Team & Access (RBAC)

  สามการ์ดนี้ไม่มี E2E คุมเลยตอนไล่ coverage วันที่ 9 พ.ย. (เป็น 3 ใน 6 ใบที่ขาด)

  E2E-DOC-001 กับ E2E-DOC-002 คุมคลังเอกสาร ซึ่งเป็นที่เดียวที่รวมไฟล์จากทุกที่ในระบบ
  (ใบเสร็จที่ระบบออกให้ สัญญา รายงานซ่อม และไฟล์ที่แอดมินอัปโหลดเอง) ถ้าหมวดหรือการค้นหาเพี้ยน
  แอดมินจะหาเอกสารไม่เจอทั้งที่ไฟล์ยังอยู่ จึงเทสทั้งทางเข้า (อัปโหลด) และทางหา (ค้นหา/กรอง/แท็บ)

  เรื่องลบเอกสารรวมไว้ในเคสเดียวกัน เพราะเป็นปุ่มที่กดผิดแล้วข้อมูลหาย ต้องพิสูจน์ว่ามีด่านยืนยัน

  E2E-TEAM-001 คุม RBAC เฉพาะส่วนที่พิสูจน์ได้จริงในชุด mock คือค่าที่ตั้งไว้ต้องคงอยู่
  ส่วนการบังคับใช้สิทธิ์จริง (กดเมนูที่ไม่มีสิทธิ์แล้วถูกปฏิเสธ) ยังไม่มีใน Phase 2 จึงไม่เทส

  เดินด้วยเมนูด้านข้างตลอด ไม่ cy.visit เพราะข้อมูลอยู่ใน memory รีโหลดแล้วกลับเป็นค่าตั้งต้น
*/
describe('documentsArchive (mock-api)', () => {
  const dialog = () => cy.findByRole('dialog')

  function openDocuments() {
    cy.findByRole('link', { name: 'Documents' }).click()
  }

  it('E2E-DOC-001: An uploaded document appears in the archive and can be found by search and unit filter', () => {
    cy.signIn()
    openDocuments()

    // ไฟล์ปลอมสร้างในเบราว์เซอร์ ไม่ต้องมีไฟล์จริงใน repo
    const fileName = `qa-upload-${Date.now()}.pdf`
    cy.findByRole('button', { name: /Upload document/ }).click()
    dialog().within(() => {
      cy.findByLabelText('Document file').selectFile(
        { contents: Cypress.Buffer.from('%PDF-1.4 qa test'), fileName, mimeType: 'application/pdf' },
        { force: true },
      )
      cy.findByLabelText('Document type').select('Contract', { force: true })
      cy.findByLabelText('Linked unit').select('101', { force: true })
      cy.findByRole('button', { name: 'Add to library' }).click()
    })
    dialog().should('not.exist')

    // ขึ้นในคลังทันทีโดยไม่ต้องรีโหลด
    cy.contains(fileName).should('be.visible')

    // ค้นหาด้วยชื่อไฟล์ต้องเจอ และของอื่นต้องหายไปจากรายการ
    cy.findByLabelText('Search documents').clear().type(fileName)
    cy.contains(fileName).should('be.visible')
    cy.findByLabelText('Search documents').clear()

    // กรองตามห้องที่ผูกไว้ต้องยังเห็นเอกสารนี้
    cy.findByLabelText('Filter by unit').select('101', { force: true })
    cy.contains(fileName).should('be.visible')
  })

  it('E2E-DOC-002: Category tabs filter the archive and deleting a document asks for confirmation first', () => {
    cy.signIn()
    openDocuments()

    // แท็บ Receipt ต้องเหลือแต่ใบเสร็จ ไม่มีเอกสารหมวดอื่นปน
    cy.findByLabelText('Receipt tab').click()
    cy.findAllByLabelText(/^View document /).should('have.length.greaterThan', 0)

    // กดลบแล้วต้องมีด่านยืนยัน ไม่ใช่ลบทันที
    cy.findAllByLabelText(/^Delete document /)
      .first()
      .click()
    cy.findByRole('dialog', { name: 'Confirm Delete Document' }).should('be.visible')

    // ยกเลิกแล้วเอกสารต้องยังอยู่
    cy.findByRole('dialog', { name: 'Confirm Delete Document' })
      .findByRole('button', { name: /Cancel|Close/ })
      .click()
    cy.findByRole('dialog', { name: 'Confirm Delete Document' }).should('not.exist')
    cy.findAllByLabelText(/^View document /).should('have.length.greaterThan', 0)
  })

  it('E2E-TEAM-001: A member role and a permission tick survive leaving the page and coming back', () => {
    cy.signIn()
    cy.findByRole('link', { name: 'Account Settings' }).click()
    cy.findByRole('button', { name: 'Team & Access' }).click()

    cy.findByRole('heading', { name: 'Team members' }).should('be.visible')
    cy.findByRole('heading', { name: 'Permission matrix' }).should('be.visible')

    // เปลี่ยน role ของสมาชิกคนแรก แล้วจำค่าที่ตั้งไว้
    cy.findAllByLabelText(/^Role for /)
      .first()
      .then(($select) => {
        const label = $select.attr('aria-label') as string
        cy.wrap($select).select('Accountant', { force: true })

        // ติ๊กสิทธิ์ช่องแรกของตาราง แล้วจำสถานะที่ตั้งไว้
        /*
          คอลัมน์ Manager ถูก disabled ไว้เสมอ (roleIdx === 0 ใน TeamAccessTab) ติ๊กไม่ได้
          จึงต้องเลือกคอลัมน์อื่น และต้องกด "Save permissions" ก่อน ค่าจะถูกเก็บลง localStorage
        */
        cy.findAllByLabelText(/^Accountant: /)
          .first()
          .then(($box) => {
            const boxLabel = $box.attr('aria-label') as string
            const wasChecked = ($box[0] as HTMLInputElement).checked
            cy.wrap($box).click({ force: true })
            cy.findByRole('button', { name: 'Save permissions' }).click()

            // ออกจากหน้าไปแล้วกลับมา ค่าที่ตั้งต้องยังอยู่
            cy.findByRole('link', { name: 'Dashboard' }).click()
            cy.findByRole('link', { name: 'Account Settings' }).click()
            cy.findByRole('button', { name: 'Team & Access' }).click()

            cy.findByLabelText(label).should('have.value', 'Accountant')
            cy.findByLabelText(boxLabel).should(wasChecked ? 'not.be.checked' : 'be.checked')
          })
      })
  })

  /*
    SSK-175 OCR ในเครื่อง ไม่ได้ทำงานอัตโนมัติตอนอัปโหลด แต่ผูกกับปุ่ม "Preview extraction"
    ในป็อปอัปอัปโหลด กดแล้วจะเติมข้อมูลที่สกัดได้ลงฟอร์มพร้อมป้ายว่าต้องมีคนตรวจ
    ที่ต้องคุมคือป้ายนั้น เพราะข้อมูลจาก OCR เอาไปใช้ตรง ๆ ไม่ได้ ต้องให้คนยืนยันก่อน
  */
  it('E2E-DOC-003: Local OCR fills the form from the file and marks it as needing manual review', () => {
    cy.signIn()
    openDocuments()

    cy.findByRole('button', { name: /Upload document/ }).click()
    dialog().within(() => {
      cy.findByLabelText('Document file').selectFile(
        { contents: Cypress.Buffer.from('%PDF-1.4 lease'), fileName: 'lease-ocr.pdf', mimeType: 'application/pdf' },
        { force: true },
      )
      cy.findByLabelText('Document type').select('Contract', { force: true })
      cy.findByLabelText('Linked unit').select('101', { force: true })

      // ก่อนกด ยังไม่มีแผงข้อมูลที่สกัดได้
      cy.contains('Needs manual review').should('not.exist')

      cy.findByRole('button', { name: 'Preview extraction' }).click()

      // หลังกด ต้องมีป้ายบอกว่าต้องตรวจ และช่องผู้เช่าต้องถูกเติมให้ ไม่ใช่ว่างเปล่า
      cy.contains('Needs manual review').should('be.visible')
      cy.contains('Local OCR').should('be.visible')
    })
  })
})
