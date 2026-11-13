// ============================== [NOTE] ==============================
// ไฟล์นี้: คลังเอกสารสแกน (SSK-161, SSK-172) กับ backend จำลอง 3 เคส
// ชุด: mock-api (พอร์ต 4173) ข้อมูลอยู่ใน memory ของหน้า มีเอกสารตัวอย่างสี่ฉบับที่ไฟล์เป็น PDF/PNG จริง
// เทส: E2E-DOCUMENTS-001 กรองตามชนิด ค้นหา แล้วเปิดดูไฟล์จริง (blob ใน iframe)
//      E2E-DOCUMENTS-002 อัปโหลดสแกนของสัญญา ไฟล์โปรแกรมที่เปลี่ยนชื่อถูกปฏิเสธ แล้วลบสแกนนั้น
//      E2E-DOCUMENTS-003 อัปโหลดสัญญาที่เซ็นแล้วจากหน้า Contracts แล้วไปโผล่ในคลังใต้สัญญานั้น
// ====================================================================

/*
  ไฟล์เทสต้องขึ้นต้นด้วยลายเซ็นจริง เพราะหน้าเว็บตรวจชนิดจากเนื้อไฟล์เหมือน backend
  ไฟล์ที่เขียนว่า "fake" แล้วตั้งชื่อ .pdf จะถูกปฏิเสธเหมือนไฟล์เสีย
*/
const pdf = (fileName: string) => ({
  contents: Cypress.Buffer.from('%PDF-1.4\n% Sakura Soul E2E\n'),
  fileName,
  mimeType: 'application/pdf',
})

/** โปรแกรม Windows (MZ) ที่ถูกเปลี่ยนชื่อเป็นรูป เบราว์เซอร์บอกชนิดเป็น image/png ตามนามสกุล */
const RENAMED_PROGRAM = {
  contents: Cypress.Buffer.from([0x4d, 0x5a, 0x90, 0x00]),
  fileName: 'photo.png',
  mimeType: 'image/png',
}

describe('documents (mock-api)', () => {
  it('E2E-DOCUMENTS-001: Finds a scan by type and search, then opens the stored file', () => {
    cy.signIn()
    cy.findByRole('link', { name: 'Documents' }).click()
    cy.findByRole('heading', { name: 'Document Library' }).should('be.visible')
    cy.findByText('Technician report for the AC compressor').should('be.visible')

    cy.findByRole('button', { name: 'Contract tab' }).click()
    cy.location('search').should('eq', '?type=Contract')
    cy.findByText('Technician report for the AC compressor').should('not.exist')
    cy.findByRole('textbox', { name: 'Search documents' }).type('arisa')
    cy.findByText('Signed lease agreement').should('not.exist')
    cy.findByRole('row', { name: /Lease that ended last year/ }).should('contain.text', 'Unit 103')

    cy.findByRole('button', { name: 'View document Lease that ended last year' }).click()
    cy.findByRole('dialog', { name: 'Lease that ended last year' }).within(() => {
      cy.get('iframe').should('have.attr', 'src').and('match', /^blob:/)
      cy.findByText('Lease #5').should('be.visible')
      cy.findByRole('button', { name: 'Download file' }).should('be.enabled')
    })
  })

  it('E2E-DOCUMENTS-002: Uploads a scan for a lease, refuses a renamed program, and deletes the scan', () => {
    cy.signIn()
    cy.findByRole('link', { name: 'Documents' }).click()
    cy.findByRole('button', { name: /Upload document/ }).click()

    cy.findByRole('dialog', { name: 'Upload document' }).within(() => {
      cy.findByLabelText('Document file').selectFile(RENAMED_PROGRAM, { force: true })
      cy.findByRole('alert').should('have.text', 'Only PDF, PNG and JPEG files are allowed')

      cy.findByLabelText('Document file').selectFile(pdf('renewal-201.pdf'), { force: true })
      cy.findByText('renewal-201.pdf').should('be.visible')
      cy.findByLabelText('Linked unit').select('Unit 201', { force: true })
      cy.findByLabelText('Lease').find('option:selected').should('contain.text', 'Kenji Sato')
      cy.findByLabelText(/Description/).type('Lease renewal 201')
      cy.findByRole('button', { name: 'Add to library' }).click()
    })
    cy.findByRole('dialog', { name: 'Upload document' }).should('not.exist')
    cy.findByRole('row', { name: /Lease renewal 201/ })
      .should('contain.text', 'Unit 201')
      .and('contain.text', 'Kenji Sato')

    cy.findByRole('button', { name: 'Delete document Lease renewal 201' }).click()
    cy.findByRole('dialog', { name: 'Confirm Delete Document' }).findByRole('button', { name: 'Delete' }).click()
    cy.findByText('Lease renewal 201').should('not.exist')
  })

  it('E2E-DOCUMENTS-003: A signed contract uploaded from Contracts is filed under that lease', () => {
    cy.signIn()
    cy.findByRole('link', { name: 'Contracts' }).click()
    cy.findByRole('button', { name: 'Edit' }).click()
    cy.findByLabelText('Upload signed contract for Unit 201').click()

    cy.findByRole('dialog', { name: 'Upload Signed Contract' }).within(() => {
      cy.findByRole('button', { name: 'Upload' }).should('be.disabled')
      cy.findByLabelText('Signed contract file').selectFile(pdf('CT-002-signed.pdf'), { force: true })
      cy.findByText('CT-002-signed.pdf').should('be.visible')
      cy.findByRole('button', { name: 'Upload' }).click()
    })
    cy.findByRole('dialog', { name: 'Upload Signed Contract' }).should('not.exist')

    cy.findByRole('link', { name: 'Documents' }).click()
    cy.findByRole('button', { name: 'Contract tab' }).click()
    cy.findByRole('row', { name: /CT-002-signed\.pdf/ })
      .should('contain.text', 'Signed lease agreement')
      .and('contain.text', 'Unit 201')
      .and('contain.text', 'Kenji Sato')
  })
})
