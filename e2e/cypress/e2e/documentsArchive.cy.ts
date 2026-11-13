// ============================== [NOTE] ==============================
// ไฟล์นี้: คลังเอกสารกลางกับสิทธิ์การเข้าถึง 4 เคส (SSK-161, SSK-172, SSK-175, SSK-176)
// ชุด: mock-api (พอร์ต 4173) — คำขอ /api ถูกตอบโดย backend ปลอมในเบราว์เซอร์ (frontend/src/api/mockApi.ts) ข้อมูลอยู่ใน memory
// เทส: E2E-DOC-001 อัปโหลดเอกสารแล้วขึ้นในคลัง ค้นหาเจอ และกรองตามห้องได้ (แนบกับสัญญาของห้อง 102 ตั้งแต่ #227)
//      E2E-DOC-002 แท็บหมวดเอกสารกรองเฉพาะหมวดนั้น และยกเลิกการลบแล้วเอกสารชิ้นนั้นยังอยู่
//      E2E-DOC-003 ตัวจำลอง OCR เติมช่องในแผงจากสัญญาที่เลือก ติดป้ายว่าต้องมีคนตรวจ แล้วใช้เป็นคำอธิบายได้
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

    // ไฟล์สร้างในเบราว์เซอร์ ไม่ต้องมีไฟล์จริงใน repo ขึ้นต้นด้วย %PDF- เพราะหน้าเว็บตรวจชนิดจากเนื้อไฟล์
    // ห้อง 102 มีสัญญาของ Yuki Tanaka ใน backend จำลอง เอกสารจึงแนบกับสัญญานั้นได้ (ห้อง 101 ไม่มีสัญญา)
    const fileName = `qa-upload-${Date.now()}.pdf`
    cy.findByRole('button', { name: /Upload document/ }).click()
    dialog().within(() => {
      cy.findByLabelText('Document file').selectFile(
        { contents: Cypress.Buffer.from('%PDF-1.4 qa test'), fileName, mimeType: 'application/pdf' },
        { force: true },
      )
      cy.findByLabelText('Document type').select('Contract', { force: true })
      cy.findByLabelText('Linked unit').select('Unit 102', { force: true })
      cy.findByLabelText('Lease').find('option:selected').should('contain.text', 'Yuki Tanaka')
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
    cy.findByLabelText('Filter by unit').select('102', { force: true })
    cy.contains(fileName).should('be.visible')
  })

  it('E2E-DOC-002: Category tabs filter the archive and deleting a document asks for confirmation first', () => {
    cy.signIn()
    openDocuments()

    // แท็บ Receipt ต้องเหลือแต่ใบเสร็จ ไม่มีเอกสารหมวดอื่นปน
    // เช็คทุกแถวว่ามีคำว่า Receipt จริง (ตามรีวิวของใบหยก) การนับว่ามีรายการ > 0
    // ยังผ่านได้แม้ตัวกรองพาหมวดอื่นมาปน จึงไม่พิสูจน์ว่ากรองถูก
    cy.findByLabelText('Receipt tab').click()
    cy.findAllByLabelText(/^View document /).should('have.length.greaterThan', 0)
    // ใช้ should(callback) ไม่ใช่ each() เพราะแท็บเก็บสถานะไว้ใน query param ของ URL
    // ตารางจึง re-render หลังคลิกหนึ่งจังหวะ · should() ถามซ้ำให้จนผ่าน ส่วน each() อ่านรอบเดียว
    cy.findByRole('table').should(($table) => {
      const rows = $table.find('tbody tr').toArray()
      expect(rows.length, 'แท็บ Receipt ต้องมีเอกสารให้ดู').to.be.greaterThan(0)
      rows.forEach((row) => {
        expect(row.textContent ?? '', 'ทุกแถวในแท็บ Receipt ต้องเป็นหมวด Receipt').to.contain('Receipt')
      })
    })

    // จำชื่อเอกสารที่จะกดลบไว้ เพื่อยืนยันทีหลังว่า "ชิ้นนั้น" ยังอยู่ ไม่ใช่แค่ยังมีเอกสารเหลืออยู่
    cy.findAllByLabelText(/^Delete document /)
      .first()
      .invoke('attr', 'aria-label')
      .then((label) => {
        const targetName = String(label).replace(/^Delete document /, '').trim()
        expect(targetName, 'อ่านชื่อเอกสารที่จะลบจาก aria-label ไม่ได้').to.not.be.empty

        // กดลบแล้วต้องมีด่านยืนยัน ไม่ใช่ลบทันที
        cy.findByLabelText(`Delete document ${targetName}`).click()
        cy.findByRole('dialog', { name: 'Confirm Delete Document' }).should('be.visible')

        // ยกเลิกแล้วเอกสารชิ้นที่กดต้องยังอยู่ และจำนวนแถวต้องไม่ลด
        cy.findByRole('table').find('tbody tr').its('length').then((rowsBefore) => {
          cy.findByRole('dialog', { name: 'Confirm Delete Document' })
            .findByRole('button', { name: /Cancel|Close/ })
            .click()
          cy.findByRole('dialog', { name: 'Confirm Delete Document' }).should('not.exist')

          cy.findByLabelText(`View document ${targetName}`).should('exist')
          cy.findByRole('table').find('tbody tr').should('have.length', rowsBefore)
        })
      })
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
  /*
    ชื่อเคสเขียนว่า "simulation" ตามรีวิวของใบหยก เพราะ simulateContractOcr ไม่ได้อ่านเนื้อไฟล์
    ตั้งแต่ #227 มันคืนชื่อผู้เช่ากับวันเริ่มของสัญญาที่เลือก (ห้อง 102 ได้ "Yuki Tanaka") และใช้เติมได้แค่คำอธิบาย
    เคสนี้จึงพิสูจน์ได้แค่ว่า "กดแล้วแผงถูกเติม ติดป้ายว่าต้องตรวจ และกลายเป็นคำอธิบาย"
    ไม่ใช่ว่าระบบสกัดข้อมูลจากไฟล์ที่อัปโหลดได้จริง
    การสกัดจากไฟล์จริงเป็นงานของ backend (SSK-175 ฝั่ง Spring) ยังไม่มีในตอนนี้
  */
  it('E2E-DOC-003: The local OCR simulation fills the extraction panel and marks it as needing manual review', () => {
    cy.signIn()
    openDocuments()

    cy.findByRole('button', { name: /Upload document/ }).click()
    dialog().within(() => {
      cy.findByLabelText('Document file').selectFile(
        { contents: Cypress.Buffer.from('%PDF-1.4 lease'), fileName: 'lease-ocr.pdf', mimeType: 'application/pdf' },
        { force: true },
      )
      cy.findByLabelText('Document type').select('Contract', { force: true })
      cy.findByLabelText('Linked unit').select('Unit 102', { force: true })
      cy.findByLabelText('Lease').find('option:selected').should('contain.text', 'Yuki Tanaka')

      // ก่อนกด ยังไม่มีแผงข้อมูลที่สกัดได้ และคำอธิบายยังว่าง
      cy.contains('Needs manual review').should('not.exist')
      cy.findByLabelText(/Description/).should('have.value', '')

      cy.findByRole('button', { name: 'Preview extraction' }).click()

      // หลังกด ต้องมีป้ายบอกว่าต้องตรวจ และค่าที่ถูกเติมมาจากสัญญาที่เลือก ไม่ใช่ค่าว่าง
      cy.contains('Needs manual review').should('be.visible')
      cy.contains('Local OCR').should('be.visible')
      cy.findByLabelText('Tenant name').should('have.value', 'Yuki Tanaka')
      // เลขบัตรประชาชนไม่ถูกอ่านหรือเก็บ (สัญญาเอกสาร ข้อ 6)
      cy.contains(/National ID/i).should('not.exist')

      // ค่าที่ตรวจแล้วกลายเป็นคำอธิบายของเอกสาร ซึ่งเป็นช่องเดียวที่ถูกเก็บ
      cy.findByRole('button', { name: 'Use as description' }).click()
      cy.findByLabelText(/Description/).invoke('val').should('contain', 'Yuki Tanaka')
    })
  })
})
