// โหลดก่อนไฟล์เทสทุกไฟล์ (supportFile ใน cypress.config.ts)
// findByRole / findByLabelText / findByText มาจาก Testing Library ชุดเดียวกับที่ unit test ของ frontend ใช้
import '@testing-library/cypress/add-commands'
import 'cypress-mochawesome-reporter/register'
// กดแป้นพิมพ์จริงผ่าน Chrome (realPress) ปุ่มที่โฟกัสอยู่จึงทำงานเมื่อกด Enter เหมือนผู้ใช้กดจริง
import 'cypress-real-events'
import './commands'
