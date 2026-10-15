import { expect, test, type Route } from '@playwright/test'

/*
  เทสกลุ่มนี้รันกับ dev server ที่ปิด backend จำลอง (โปรเจกต์ stubbed-api)
  หน้าเว็บยิง /api ผ่าน network จริง Playwright จึงปลอมคำตอบได้ตรงตามที่ backend
  จริงตอบ คำขอที่ไม่ได้ตั้งไว้ตอบ 503 ทั้งหมด จะได้ไม่หลุดไปหา backend ที่ไม่ได้เปิด
  route ที่ตั้งทีหลังถูกเช็คก่อน จึงตั้งตัวกว้างไว้ก่อนตัวเจาะจง
  ตัวกว้างต้องเทียบจาก pathname ที่ขึ้นต้นด้วย /api/ เท่านั้น ถ้าใช้ glob แบบ "ทุก path ที่มี /api/"
  มันจะดักไฟล์โค้ดของแอปเองอย่าง /src/api/client.ts ไปด้วย แล้วหน้าเว็บโหลดไม่ขึ้น
*/
const isApiCall = (url: URL) => url.pathname.startsWith('/api/')

function problem(route: Route, status: number, title: string, detail?: string) {
  return route.fulfill({
    status,
    contentType: 'application/problem+json',
    body: JSON.stringify({ title, detail }),
  })
}

test.beforeEach(async ({ page }) => {
  await page.route(isApiCall, (route) => problem(route, 503, 'Service Unavailable'))
  await page.route((url) => url.pathname === '/api/auth/me', (route) => problem(route, 401, 'Unauthorized'))
})

test('E2E-LOGIN-002: Opening a page while signed out redirects to Login', async ({ page }) => {
  await page.goto('/contracts')

  await expect(page).toHaveURL('/login')
  await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible()
})

test('E2E-LOGIN-003: Wrong password shows the backend error message and stays on Login', async ({ page }) => {
  const detail = 'The username or password is incorrect'
  await page.route((url) => url.pathname === '/api/auth/login', (route) => problem(route, 401, 'Unauthorized', detail))

  await page.goto('/login')
  await page.getByLabel('Username').fill('adminsakura01')
  await page.getByLabel('Password').fill('wrong-password')
  await page.getByRole('button', { name: 'Sign In' }).click()

  await expect(page.getByRole('alert')).toHaveText(detail)
  await expect(page).toHaveURL('/login')
})
