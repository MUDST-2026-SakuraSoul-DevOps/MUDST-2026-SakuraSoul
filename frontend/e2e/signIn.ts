import { expect, type Locator, type Page } from '@playwright/test'

/**
 * ล็อกอินผ่านหน้า Login จริง ไม่ข้ามด้วยการตั้ง cookie เอง เพราะ E2E ต้องการ
 * พิสูจน์เส้นทางที่ผู้ใช้เดินจริง backend จำลองรับรหัสผ่านอะไรก็ได้ที่ไม่ว่าง
 *
 * รหัสผ่านอ่านจาก E2E_ADMIN_PASSWORD ไม่เขียนไว้ในโค้ด (feedback อาจารย์ SSK-125)
 * บน CI สุ่มให้ตอนรัน ในเครื่องตัวเองสั่งแบบนี้
 *   E2E_ADMIN_PASSWORD=อะไรก็ได้ npm run test:e2e
 */
export async function signIn(page: Page) {
  const username = process.env.E2E_ADMIN_USERNAME || 'adminsakura01'
  const password = process.env.E2E_ADMIN_PASSWORD
  if (!password) {
    throw new Error('E2E_ADMIN_PASSWORD is not set. Run: E2E_ADMIN_PASSWORD=<any> npm run test:e2e')
  }

  await page.goto('/login')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign In' }).click()
  await expect(page.getByRole('heading', { name: 'Room Availability' })).toBeVisible()
}

/** ข้อความของตัวเลือกทั้งหมดใน select เช่นรายการห้องในฟอร์มสัญญา "105 · Floor 1" */
export async function optionLabels(select: Locator): Promise<string[]> {
  return (await select.locator('option').allTextContents()).map((label) => label.trim())
}
