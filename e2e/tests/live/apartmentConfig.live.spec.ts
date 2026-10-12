import { expect, test } from '@playwright/test'
import { signInLive } from './signInLive'

/*
  SSK-123 — อัตราค่าไฟที่ตั้งในหน้า Apartment Config ต้องถูกบันทึกลงฐานข้อมูลจริง

  ชุด mock-api เช็คได้แค่ว่าค่าถูกส่งต่อภายในหน้าเว็บ เพราะข้อมูลอยู่ใน memory
  พอรีโหลดก็กลับไปเป็นค่าตั้งต้นอยู่แล้ว เทสนี้จึงกดบันทึก แล้ว "รีโหลดทั้งหน้า"
  ก่อนเปิดดูใหม่ ถ้าค่ายังอยู่แปลว่า PUT /api/apartment-config เขียนลง PostgreSQL จริง

  เทสนี้แก้ข้อมูลจริงของระบบ จบแล้วจึงตั้งค่ากลับเป็นค่าเดิมเสมอ
*/

const ELECTRIC = /Electricity Rate per Unit/

async function openConfig(page: import('@playwright/test').Page) {
  await page.getByRole('link', { name: 'Units' }).click()
  await page.getByRole('button', { name: 'Config' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByLabel(ELECTRIC)).toBeVisible()
  return dialog
}

async function saveRate(page: import('@playwright/test').Page, rate: string) {
  const dialog = await openConfig(page)
  await dialog.getByLabel(ELECTRIC).fill(rate)
  await dialog.getByRole('button', { name: 'Save Rates' }).click()
  await expect(dialog).toBeHidden()
}

test('E2E-LIVE-CONFIG-001: A saved electricity rate survives a page reload', async ({ page }) => {
  await signInLive(page)

  const dialog = await openConfig(page)
  const original = await dialog.getByLabel(ELECTRIC).inputValue()
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(dialog).toBeHidden()

  // ใช้เลขที่ไม่ตรงกับค่าตั้งต้น (50) เพื่อแยกว่าอ่านค่าจากฐานข้อมูลจริง ไม่ใช่บังเอิญตรง
  const changed = original === '73' ? '74' : '73'

  try {
    await saveRate(page, changed)

    await page.reload()
    const afterReload = await openConfig(page)
    await expect(afterReload.getByLabel(ELECTRIC)).toHaveValue(changed)
    await afterReload.getByRole('button', { name: 'Cancel' }).click()
    await expect(afterReload).toBeHidden()
  } finally {
    await saveRate(page, original)
  }
})
