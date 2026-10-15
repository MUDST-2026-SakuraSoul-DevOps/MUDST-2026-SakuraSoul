// โหลดก่อนไฟล์เทสทุกไฟล์ (supportFile ใน cypress.config.ts)
// findByRole / findByLabelText / findByText มาจาก Testing Library ชุดเดียวกับที่ unit test ของ frontend ใช้
import '@testing-library/cypress/add-commands'
import 'cypress-mochawesome-reporter/register'
import './commands'
