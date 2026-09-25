import { expect, test, type Page } from '@playwright/test'
import { signInLive } from './signInLive'

/*
  SSK-123 — แจ้งซ่อมจากหน้า Dashboard ต้องถูกบันทึกลงฐานข้อมูลจริง

  เคสนี้เคยแดงจริงตอนเขียน (24 ก.ย.) เพราะ DashboardPage ตรง onSave มีแต่
  dashboard.reload() พร้อมคอมเมนต์เก่าว่า "ยังไม่มี POST /api/maintenance"
  กดบันทึกแล้วไม่มีคำขอออกไปเลย ข้อมูลที่กรอกหายทั้งใบรวมถึงค่าซ่อม (SSK-139)
  เฉินต่อ API ให้แล้วใน SSK-131 เทสสองตัวนี้จึงเป็นตัวกันไม่ให้ย้อนกลับไปเป็นแบบเดิม

  ห้องที่ใช้เลือกเป็นห้องท้าย ๆ ของชั้น 1 ที่ข้อมูลตั้งต้นไม่ได้ใช้ และเคส
  Out of Service คืนสถานะห้องกลับเป็นว่างให้เรียบร้อยก่อนจบเทส
*/

async function openCreateMaintenance(page: Page, roomNumber: string) {
  await page.getByRole('button', { name: 'Create Maintenance' }).click()
  const dialog = page.getByRole('dialog', { name: 'Create Maintenance' })
  await dialog.getByRole('button', { name: 'Floor 1' }).click()
  await dialog.getByRole('button', { name: roomNumber, exact: true }).click()
  await dialog.getByLabel('Maintenance Type').selectOption('Plumbing')
  return dialog
}

test('E2E-LIVE-MAINT-001: A ticket billed to the tenant is saved and marks the room card', async ({
  page,
}) => {
  await signInLive(page)

  const room = page.getByLabel('Unit 109', { exact: true })
  const dialog = await openCreateMaintenance(page, '109')

  await dialog.getByRole('radio', { name: /Still Available/ }).click()
  await dialog.getByRole('checkbox', { name: /Bill this repair to the tenant/ }).check()
  await dialog.getByLabel('Amount').fill('5000')

  const created = page.waitForResponse(
    (res) => res.url().includes('/api/maintenance') && res.request().method() === 'POST',
  )
  await dialog.getByRole('button', { name: 'Save Maintenance' }).click()

  expect((await created).status()).toBe(201)
  await expect(dialog).toBeHidden()

  /*
    ป้าย 🔧 บนการ์ดมาจาก openMaintenanceCount ที่ GET /api/rooms ส่งมา จึงพิสูจน์ได้ว่า
    ใบแจ้งซ่อมถูกเขียนลงฐานข้อมูลจริง ส่วนห้องต้องยังว่างอยู่เพราะเลือก Still Available
  */
  await expect(room).toContainText('🔧')
  await expect(room).not.toContainText('Maintenance')
  await page.reload()
  await expect(room).toContainText('🔧')
})

test('E2E-LIVE-MAINT-002: Choosing Out of Service turns the room to Maintenance', async ({ page }) => {
  await signInLive(page)

  const room = page.getByLabel('Unit 110', { exact: true })
  const dialog = await openCreateMaintenance(page, '110')
  await dialog.getByRole('radio', { name: /Out of Service/ }).click()
  await dialog.getByRole('button', { name: 'Save Maintenance' }).click()
  await expect(dialog).toBeHidden()

  try {
    await expect(room).toContainText('Maintenance')
    await page.reload()
    await expect(room).toContainText('Maintenance')
  } finally {
    // คืนห้องให้ว่างเหมือนเดิม ไม่ทิ้งห้องที่ปิดใช้งานไว้ให้คนอื่นงงตอนเทสต่อ
    await room.click()
    await page.getByRole('button', { name: 'Release Room' }).click()
    await expect(room).not.toContainText('Maintenance')
  }
})
