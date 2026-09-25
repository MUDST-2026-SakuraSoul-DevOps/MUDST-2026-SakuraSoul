import { expect, type Page } from '@playwright/test'

/*
  ตัวช่วยของชุด live (SSK-123) — ล็อกอินกับ backend จริง

  รหัสแอดมินไม่ฝังไว้ในโค้ด อ่านจาก environment เพราะทีมเพิ่งย้ายรหัสทุกตัวออกจาก repo
  ไปไว้ใน .env ตามที่อาจารย์ทัก (commit f22804e) ค่าที่ใช้คือตัวเดียวกับที่ส่งให้ backend
  ตอนสตาร์ต คือ APP_ADMIN_USERNAME / APP_ADMIN_PASSWORD

  ก่อนรัน (PowerShell)
    $env:E2E_ADMIN_PASSWORD='รหัสเดียวกับ APP_ADMIN_PASSWORD'
    npm run test:e2e:live
*/
export const ADMIN_USERNAME = process.env.E2E_ADMIN_USERNAME ?? 'admin'

export function adminPassword(): string {
  const password = process.env.E2E_ADMIN_PASSWORD
  if (!password) {
    throw new Error(
      'ยังไม่ได้ตั้ง E2E_ADMIN_PASSWORD — ตั้งให้ตรงกับ APP_ADMIN_PASSWORD ที่ backend ใช้ตอนสตาร์ต ' +
        'เช่น $env:E2E_ADMIN_PASSWORD=\'...\' แล้วค่อยรัน npm run test:e2e:live',
    )
  }
  return password
}

/**
 * ล็อกอินผ่านหน้าจริง แล้วรอจนแดชบอร์ดขึ้น ไม่ลัดด้วยการยัด cookie เอง
 *
 * เช็คสถานะที่ backend ตอบก่อนเสมอ เพราะถ้ารหัสใน E2E_ADMIN_PASSWORD ไม่ตรงกับ
 * APP_ADMIN_PASSWORD ที่ backend ใช้ตอนสตาร์ต เทสทุกตัวจะตายที่บรรทัดเดียวกันหมด
 * พร้อมข้อความว่าหาหัวข้อ Room Availability ไม่เจอ ซึ่งไม่ได้บอกสาเหตุจริงเลย
 */
export async function signInLive(page: Page) {
  await page.goto('/login')
  await page.getByLabel('Username').fill(ADMIN_USERNAME)
  await page.getByLabel('Password').fill(adminPassword())

  const loggedIn = page.waitForResponse(
    (res) => res.url().includes('/api/auth/login') && res.request().method() === 'POST',
  )
  await page.getByRole('button', { name: 'Sign In' }).click()

  const status = (await loggedIn).status()
  expect(
    status,
    `ล็อกอินไม่ผ่าน (HTTP ${status}) — ตรวจว่า E2E_ADMIN_PASSWORD ตรงกับ APP_ADMIN_PASSWORD ` +
      'ที่ backend ใช้ตอนสตาร์ต และ backend ที่พอร์ต 8080 เป็นตัวเดียวกับที่ตั้งรหัสนั้นไว้',
  ).toBe(200)

  /*
    รอนานกว่าค่าเริ่มต้น 5 วินาที เพราะชุดนี้รันขนานกันหลายเบราว์เซอร์ใส่ backend ตัวเดียว
    การตรวจรหัสผ่านใช้ BCrypt ซึ่งกิน CPU หนักโดยตั้งใจ พอล็อกอินผ่านแล้วแดชบอร์ดยังต้อง
    โหลดห้อง ผู้เช่า และสัญญาอีกสามคำขอ รวมกันเกินห้าวินาทีได้เป็นบางรอบ
    ไม่ใช่อาการของระบบช้าตอนใช้งานจริงที่มีผู้ใช้ทีละคน
  */
  await expect(page.getByRole('heading', { name: 'Room Availability' })).toBeVisible({
    timeout: 20_000,
  })
}

/**
 * เลขบัตรประชาชนไทย 13 หลักที่ผ่าน checksum และไม่ซ้ำของเดิมในฐานข้อมูล
 *
 * ฐานข้อมูลจริงไม่ได้รีเซ็ตทุกครั้งที่รันเทส และ backend กันเลขบัตรซ้ำไว้
 * (existsByNationalId) ถ้าใช้เลขตายตัว รันรอบที่สองจะพังเพราะเลขซ้ำ ไม่ใช่เพราะโปรแกรมผิด
 * 12 หลักแรกสุ่ม หลักที่ 13 คำนวณตามสูตร Modulo 11 เหมือนที่หน้าเว็บตรวจ
 */
export function newThaiNationalId(): string {
  const digits = Array.from({ length: 12 }, () => Math.floor(Math.random() * 10))
  const sum = digits.reduce((total, digit, index) => total + digit * (13 - index), 0)
  const check = (11 - (sum % 11)) % 10
  return [...digits, check].join('')
}

/** ชื่อที่ไม่ซ้ำของเดิม ใช้ค้นหาแถวของตัวเองในตารางที่มีข้อมูลจริงปนอยู่ */
export function uniqueName(prefix = 'QA Live'): string {
  return `${prefix} ${Date.now()}`
}
