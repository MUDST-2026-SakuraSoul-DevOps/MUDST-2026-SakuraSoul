import { expect, test } from '@playwright/test'
import { signInLive } from './signInLive'

/*
  SSK-123 — แจ้งซ่อมจากหน้า Dashboard ต้องถูกบันทึกลงฐานข้อมูลจริง

  ⚠️ ตอนนี้เทสนี้ต้องแดง จึงทำเครื่องหมาย test.fail() ไว้
  DashboardPage.tsx ตรง onSave ของ CreateMaintenanceDialog มีแต่ dashboard.reload()
  พร้อมคอมเมนต์เก่าว่า "ยังไม่มี POST /api/maintenance" ซึ่งไม่จริงแล้ว
  (backend มี endpoint นี้ตั้งแต่ PR #64 เมิชเข้า frontend 18 ก.ย.)
  และ client.ts ก็ยังไม่มีฟังก์ชัน createMaintenance() กดบันทึกจึงไม่มีคำขอออกไปเลย
  ข้อมูลที่กรอกหายทั้งใบ รวมถึงค่าซ่อม

  พอนานาต่อ API แล้ว เทสนี้จะกลายเป็น "ผ่านทั้งที่สั่งให้แดง" ซึ่ง Playwright รายงานว่าพัง
  = สัญญาณให้มาลบบรรทัด test.fail() ออก

  เลือกห้อง 109 เพราะข้อมูลตั้งต้นไม่ได้ใช้ห้องนี้ และเลือก Still Available
  เพื่อไม่ให้สถานะห้องเปลี่ยน ผลที่ต้องเห็นคือป้าย 🔧 บนการ์ดห้องเท่านั้น
*/
test('E2E-LIVE-MAINT-001: A maintenance ticket created from the Dashboard shows on the room card', async ({
  page,
}) => {
  test.fail()
  await signInLive(page)

  const room = page.getByLabel('Unit 109', { exact: true })
  await expect(room).not.toContainText('🔧')

  await page.getByRole('button', { name: 'Create Maintenance' }).click()
  const dialog = page.getByRole('dialog', { name: 'Create Maintenance' })

  await dialog.getByRole('button', { name: 'Floor 1' }).click()
  await dialog.getByRole('button', { name: '109' }).click()
  await dialog.getByLabel('Maintenance Type').selectOption('Plumbing')
  await dialog.getByRole('radio', { name: /Still Available/ }).click()

  const created = page.waitForResponse(
    (res) => res.url().includes('/api/maintenance') && res.request().method() === 'POST',
    { timeout: 10_000 },
  )
  await dialog.getByRole('button', { name: 'Save Maintenance' }).click()

  expect((await created).status()).toBe(201)
  await expect(dialog).toBeHidden()

  // ป้าย 🔧 บนการ์ดห้องมาจาก openMaintenanceCount ที่ GET /api/rooms ส่งมา
  // จึงพิสูจน์ได้ว่าใบแจ้งซ่อมถูกเขียนลงฐานข้อมูลจริง ไม่ใช่แค่ state ในหน้าเว็บ
  await expect(room).toContainText('🔧')
  await page.reload()
  await expect(room).toContainText('🔧')
})
