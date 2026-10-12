import { expect, test, type Page } from '@playwright/test'
import { newThaiNationalId, signInLive, uniqueName } from './signInLive'

/*
  SSK-123 — CRUD ผู้เช่ากับ backend จริง

  ทำไมต้องมีชุดนี้: backend ตรวจรูปแบบเลขบัตร กันเลขซ้ำ และมี endpoint แค่บางตัว
  ส่วน mockApi.ts ไม่ตรวจอะไรเลยและรองรับทุก method เทสที่วิ่งกับ mock จึงเขียวหมด
  ทั้งที่ของจริงพัง ซึ่งเป็นสิ่งที่อาจารย์ทักไว้ตรง ๆ ว่า "ใส่เลขผิดแล้ว test run ผ่าน"

  เคสในไฟล์นี้เคยแดงจริงทั้งคู่ตอนเขียน (24 ก.ย.) แล้วเขียวหลังของสองงานเข้า frontend
  - SSK-113 หน้าเว็บเคยส่งเลขบัตรพร้อมช่องว่าง backend ตอบ 400
  - SSK-108 backend เคยไม่มี PUT/DELETE /api/tenants/{id} หน้าเว็บจึงได้ 405
  ตอนนี้จึงทำหน้าที่เป็นตัวกันไม่ให้สองเรื่องนี้ย้อนกลับมา

  เทสเขียนข้อมูลลงฐานข้อมูลจริง จึงใช้ชื่อกับเลขบัตรที่ไม่ซ้ำทุกครั้ง แตะเฉพาะแถว
  ของตัวเอง และเคสลบทำความสะอาดข้อมูลที่ตัวเองสร้างไปในตัว
*/

async function addTenant(page: Page, fullName: string) {
  await page.getByRole('link', { name: 'Tenants' }).click()
  await page.getByRole('button', { name: 'Add New Tenant' }).click()

  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Full name').fill(fullName)
  await dialog.getByLabel('Phone number').fill('0891234567')
  await dialog.getByLabel('National ID').fill(newThaiNationalId())
  await dialog.getByRole('button', { name: 'Confirm' }).click()

  await expect(dialog).toBeHidden()
  await expect(page.getByRole('row', { name: new RegExp(fullName) })).toBeVisible()
}

test('E2E-LIVE-TENANT-001: A new tenant is saved to the database and survives a reload', async ({ page }) => {
  await signInLive(page)

  const fullName = uniqueName()
  await addTenant(page, fullName)

  // จุดสำคัญของชุด live: รีโหลดทั้งหน้าแล้วข้อมูลต้องมาจากฐานข้อมูล ไม่ใช่ state ในหน้าเว็บ
  await page.reload()
  await expect(page.getByRole('row', { name: new RegExp(fullName) })).toBeVisible()
})

test('E2E-LIVE-TENANT-002: Editing a tenant saves through the real API', async ({ page }) => {
  await signInLive(page)

  // แก้ผู้เช่าที่เทสสร้างเอง ไม่ไปยุ่งกับข้อมูลตั้งต้นที่คนอื่นใช้อยู่
  const fullName = uniqueName('QA Edit')
  await addTenant(page, fullName)

  await page.getByRole('button', { name: `Edit ${fullName}` }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Phone number').fill('0899999999')

  const saved = page.waitForResponse(
    (res) => res.url().includes('/api/tenants/') && res.request().method() === 'PUT',
  )
  await dialog.getByRole('button', { name: 'Confirm' }).click()

  expect((await saved).status()).toBe(200)
  await expect(dialog).toBeHidden()

  await page.reload()
  await expect(page.getByRole('row', { name: new RegExp(fullName) })).toContainText('089-999-9999')
})

test('E2E-LIVE-TENANT-003: Deleting a tenant removes it from the database', async ({ page }) => {
  await signInLive(page)

  const fullName = uniqueName('QA Delete')
  await addTenant(page, fullName)

  await page.getByRole('button', { name: `Delete ${fullName}` }).click()
  const dialog = page.getByRole('dialog', { name: 'Confirm Delete Tenant Information' })

  const deleted = page.waitForResponse(
    (res) => res.url().includes('/api/tenants/') && res.request().method() === 'DELETE',
  )
  await dialog.getByRole('button', { name: 'Confirm Delete' }).click()

  expect((await deleted).status()).toBeLessThan(300)
  await expect(dialog).toBeHidden()

  await page.reload()
  await expect(page.getByRole('row', { name: new RegExp(fullName) })).toHaveCount(0)
})
