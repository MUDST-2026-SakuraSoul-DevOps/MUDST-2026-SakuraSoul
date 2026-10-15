import { expect, test, type Page } from '@playwright/test'
import { signIn } from './signIn'

/*
  feedback อาจารย์ 13 ก.ย. ข้อ 8: Maintenance Log ต้องกดเข้าไปดูรายละเอียดแต่ละรายการได้ (E2E)

  ใบแจ้งซ่อมห้อง 206 มาจากข้อมูลตั้งต้นของ backend จำลอง (mockApi.ts) มีช่างรับงานแล้ว
  จึงเช็คได้ครบทั้งผู้รับงาน ผู้แจ้ง และรายละเอียด
*/
const TICKET = {
  title: 'Bathroom drain pipe leaking',
  detail: 'Water seeping into the ceiling below. Waiting on the plumber to lift the tiles.',
  unit: '206',
  assignedTo: 'Mei Lin',
  reportedBy: 'David W.',
}

async function openMaintenanceLog(page: Page) {
  await signIn(page)
  await page.getByRole('link', { name: 'Maintenance' }).click()
  await page.getByRole('button', { name: 'Maintenance Log', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Maintenance Log History' })).toBeVisible()
}

test('E2E-MAINT-001: Clicking a row in Maintenance Log opens that ticket\'s details', async ({ page }) => {
  await openMaintenanceLog(page)

  // กดที่ช่องเลขห้องของแถว ไม่ใช่ที่ชื่องาน เพื่อพิสูจน์ว่ากดตรงไหนของแถวก็เปิดได้
  const row = page.getByRole('row', { name: new RegExp(TICKET.title) })
  await row.getByRole('cell', { name: TICKET.unit, exact: true }).click()

  const dialog = page.getByRole('dialog', { name: TICKET.title })
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText('Maintenance log details')
  await expect(dialog).toContainText(TICKET.detail)
  await expect(dialog).toContainText(TICKET.unit)
  await expect(dialog).toContainText(TICKET.assignedTo)
  await expect(dialog).toContainText(TICKET.reportedBy)

  await dialog.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(dialog).toBeHidden()
})

test('E2E-MAINT-002: Keyboard users open the details from the ticket title and close with Escape', async ({ page }) => {
  await openMaintenanceLog(page)

  await page.getByRole('button', { name: `View log ${TICKET.title}` }).focus()
  await page.keyboard.press('Enter')

  const dialog = page.getByRole('dialog', { name: TICKET.title })
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText(TICKET.detail)

  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
})
