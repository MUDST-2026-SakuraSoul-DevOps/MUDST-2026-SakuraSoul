import { expect, type Page } from '@playwright/test'

/**
 * ล็อกอินผ่านหน้า Login จริง ไม่ข้ามด้วยการตั้ง cookie เอง เพราะ E2E ต้องการ
 * พิสูจน์เส้นทางที่ผู้ใช้เดินจริง backend จำลองรับรหัสผ่านอะไรก็ได้ที่ไม่ว่าง
 */
export async function signIn(page: Page) {
  await page.goto('/login')
  await page.getByLabel('Username').fill('adminsakura01')
  await page.getByLabel('Password').fill('admin1234')
  await page.getByRole('button', { name: 'Sign In' }).click()
  await expect(page.getByRole('heading', { name: 'Room Availability' })).toBeVisible()
}
