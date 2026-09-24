import { expect, test, type Page } from '@playwright/test'
import { newThaiNationalId, signInLive, uniqueName } from './signInLive'

/*
  SSK-123 — CRUD ผู้เช่ากับ backend จริง

  ทำไมต้องมีชุดนี้: backend ตรวจรูปแบบเลขบัตร กันเลขซ้ำ และมี endpoint แค่บางตัว
  ส่วน mockApi.ts ไม่ตรวจอะไรเลยและรองรับทุก method เทสที่วิ่งกับ mock จึงเขียวหมด
  ทั้งที่ของจริงพัง ซึ่งเป็นสิ่งที่อาจารย์ทักไว้ตรง ๆ ว่า "ใส่เลขผิดแล้ว test run ผ่าน"

  เทสในไฟล์นี้เขียนข้อมูลลงฐานข้อมูลจริง จึงใช้ชื่อกับเลขบัตรที่ไม่ซ้ำทุกครั้ง
  และเช็คเฉพาะแถวของตัวเอง ไม่ยุ่งกับข้อมูลของคนอื่น
*/

async function openAddTenant(page: Page) {
  await page.getByRole('link', { name: 'Tenants' }).click()
  await page.getByRole('button', { name: 'Add New Tenant' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByLabel('Full name')).toBeVisible()
  return dialog
}

/*
  ⚠️ ตอนนี้เทสนี้ต้องแดง จึงทำเครื่องหมาย test.fail() ไว้ (บั๊ก SSK-113)
  หน้าเว็บจัดรูปแบบเลขบัตรให้อ่านง่ายเป็น "1 1014 02329 55 2" แล้วส่งไปทั้งช่องว่าง
  แต่ backend รับแค่ 13 หลักติดกัน (TenantDtos.java) จึงตอบ 400

  พอ PR #80 (SSK-113) เมิชเข้า frontend เทสนี้จะกลายเป็น "ผ่านทั้งที่สั่งให้แดง"
  ซึ่ง Playwright จะรายงานว่าพัง = สัญญาณให้มาลบบรรทัด test.fail() ออก
*/
test('E2E-LIVE-TENANT-001: A new tenant is saved to the database and survives a reload', async ({ page }) => {
  test.fail()
  await signInLive(page)

  const fullName = uniqueName()
  const dialog = await openAddTenant(page)
  await dialog.getByLabel('Full name').fill(fullName)
  await dialog.getByLabel('Phone number').fill('0891234567')
  await dialog.getByLabel('National ID').fill(newThaiNationalId())
  await dialog.getByRole('button', { name: 'Confirm' }).click()

  await expect(dialog).toBeHidden()
  await expect(page.getByRole('row', { name: new RegExp(fullName) })).toBeVisible()

  // จุดสำคัญของชุด live: รีโหลดทั้งหน้าแล้วข้อมูลต้องมาจากฐานข้อมูล ไม่ใช่ state ในหน้าเว็บ
  await page.reload()
  await expect(page.getByRole('row', { name: new RegExp(fullName) })).toBeVisible()
})

/*
  ⚠️ แดงอยู่เช่นกัน (บั๊ก "backend ไม่มี PUT/DELETE /api/tenants/{id}")
  หน้าเว็บเรียก PUT แต่ TenantController มีแค่ GET/POST จึงได้ 405
  พอเฉินเพิ่ม endpoint แล้วให้ลบ test.fail() ออก แล้วเปลี่ยนไปแก้ผู้เช่าที่เทสสร้างเอง
  แทนการแก้ข้อมูลตั้งต้น
*/
test('E2E-LIVE-TENANT-002: Editing a tenant saves through the real API', async ({ page }) => {
  test.fail()
  await signInLive(page)
  await page.getByRole('link', { name: 'Tenants' }).click()

  const firstEdit = page.getByRole('button', { name: /^Edit / }).first()
  await firstEdit.click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Phone number').fill('0899999999')
  await dialog.getByRole('button', { name: 'Confirm' }).click()

  await expect(dialog).toBeHidden()
})
