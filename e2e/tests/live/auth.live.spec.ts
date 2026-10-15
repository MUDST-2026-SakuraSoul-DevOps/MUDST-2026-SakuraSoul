import { expect, test } from '@playwright/test'
import { ADMIN_USERNAME, signInLive } from './signInLive'

/*
  SSK-123 — ล็อกอินกับ backend จริง

  ชุด mock-api พิสูจน์เรื่องนี้ไม่ได้ เพราะ backend จำลองรับรหัสอะไรก็ผ่าน
  ส่วนชุด stubbed-api ปลอมคำตอบ 401 เอง จึงพิสูจน์ได้แค่ว่าหน้าเว็บแสดงข้อความที่ได้รับมา
  ไม่ได้พิสูจน์ว่า Spring ตอบแบบนั้นจริง เทสนี้คุยกับ backend ตรง ๆ ทั้งเส้นทาง
*/

test('E2E-LIVE-LOGIN-001: Wrong password is rejected by the real backend', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('Username').fill(ADMIN_USERNAME)
  await page.getByLabel('Password').fill('definitely-not-the-password')

  const response = page.waitForResponse(
    (res) => res.url().includes('/api/auth/login') && res.request().method() === 'POST',
  )
  await page.getByRole('button', { name: 'Sign In' }).click()

  expect((await response).status()).toBe(401)
  await expect(page.getByRole('alert')).toHaveText('The username or password is incorrect')
  await expect(page).toHaveURL('/login')
})

test('E2E-LIVE-LOGIN-002: Signing in loads the 24 units from the database', async ({ page }) => {
  await signInLive(page)

  await expect(page.getByRole('heading', { name: 'Floor 1' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Floor 2' })).toBeVisible()
  // ห้องมาจากตาราง room ที่ Flyway seed ไว้ (V2) ไม่ใช่ข้อมูลที่ฝังในหน้าเว็บ
  await expect(page.getByLabel('Unit 101', { exact: true })).toBeVisible()
  await expect(page.getByLabel('Unit 212', { exact: true })).toBeVisible()
})

/*
  session เก็บที่ cookie ฝั่ง backend การรีโหลดหน้าจึงต้องยัง "ล็อกอินอยู่" ได้เอง
  เทสนี้จับเคสที่หน้าเว็บเก็บสถานะล็อกอินไว้ใน memory อย่างเดียวแล้วรีเฟรชทีเด้งออก
*/
test('E2E-LIVE-SESSION-001: The session survives a full page reload', async ({ page }) => {
  await signInLive(page)

  await page.reload()

  await expect(page.getByRole('heading', { name: 'Room Availability' })).toBeVisible()
  await expect(page).toHaveURL('/')
})

test('E2E-LIVE-SESSION-002: Signing out clears the session on the backend', async ({ page }) => {
  await signInLive(page)

  await page.getByRole('button', { name: 'Log out' }).click()
  await page.getByRole('button', { name: 'CONFIRM' }).click()
  await expect(page).toHaveURL('/login')

  // เปิดหน้าในอีกครั้งต้องโดนเด้งกลับ แปลว่า cookie ถูกล้างที่ backend จริง ไม่ใช่แค่เปลี่ยนหน้า
  await page.goto('/tenants')
  await expect(page).toHaveURL('/login')
})
