import { expect, test, type Locator, type Page } from '@playwright/test'
import { optionLabels, signIn } from './signIn'

/*
  US-05 ห้องเดียวกันห้ามมีสัญญาซ้อนช่วงเวลากัน ในหน้าเว็บกันไว้ด้วยการให้ฟอร์ม
  สร้างสัญญาเลือกได้แค่ห้องว่าง ห้องที่มีผู้เช่าอยู่จึงต้องไม่อยู่ในรายการเลย
  และห้องที่เพิ่งทำสัญญาไปต้องหายไปจากรายการทันที ไม่ใช่รอรีโหลด
  (ส่วนฐานข้อมูลกันซ้อนเองได้หรือไม่ พิสูจน์ที่ LeaseOverlapIntegrationTest ฝั่ง backend)
  ห้อง 102 มีสัญญาของ Yuki Tanaka อยู่แล้วในข้อมูลตั้งต้นของ backend จำลอง
*/
test('E2E-CONTRACT-002: Create Contract form excludes occupied rooms, and a just-leased room disappears from the list immediately', async ({ page }) => {
  await signIn(page)
  await page.getByRole('link', { name: 'Contracts' }).click()

  let dialog = await openCreateContract(page)
  let units = await optionLabels(dialog.locator('#unit-select'))
  expect(units.some((label) => label.startsWith('102 '))).toBe(false)
  const unit105 = units.find((label) => label.startsWith('105 '))
  expect(unit105).toBeDefined()

  await dialog.locator('#unit-select').selectOption({ label: unit105! })
  await dialog.getByRole('button', { name: 'Create Contract' }).click()
  await expect(dialog).toBeHidden()

  dialog = await openCreateContract(page)
  units = await optionLabels(dialog.locator('#unit-select'))
  expect(units.some((label) => label.startsWith('105 '))).toBe(false)
})

/*
  อัตราค่าไฟที่ตั้งในหน้า Apartment Config ต้องไปถึงทุกที่ที่ใช้คิดเงิน บั๊ก SSK-116
  คือเอกสารสัญญาไม่อ่านค่าจาก Config เทสนี้กันไม่ให้เรื่องแบบเดียวกันกลับมาที่ฟอร์มสัญญา
*/
test('E2E-CONFIG-001: Changing the electricity rate in Apartment Config updates the Create Contract form', async ({ page }) => {
  await signIn(page)
  await setElectricityRate(page, '77')

  await page.getByRole('link', { name: 'Contracts' }).click()
  const dialog = await openCreateContract(page)
  const rates = await optionLabels(dialog.locator('#electric-billing'))
  expect(rates.some((label) => label.includes('77.00'))).toBe(true)
})

/*
  บิลของสัญญาที่เซ็นไปแล้วต้องใช้อัตราที่ล็อกไว้ตอนเซ็น ไม่ใช่อัตราใน Config ที่แก้ทีหลัง
  ห้อง 207 ล็อกค่าไฟไว้ 50 เปลี่ยน Config เป็น 77 แล้วฟอร์มออกบิลของห้องนี้ต้องยังเป็น 50
  เดิมเทสนี้เช็คว่าฟอร์มออกบิลตาม Config ใหม่ ซึ่งตรงข้ามกับกฎล็อกอัตราที่ QA ย้ำไว้
*/
test('E2E-CONFIG-002: Changing the electricity rate in Apartment Config does not change the rate on an existing contract bill', async ({ page }) => {
  await signIn(page)
  await setElectricityRate(page, '77')

  await page.getByRole('link', { name: 'Payments' }).click()
  await page.getByRole('button', { name: 'New Invoice' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.locator('#payment-room').fill('207')
  await expect(dialog).toContainText('× 50.00 / unit')
  await expect(dialog).not.toContainText('× 77.00 / unit')
})

async function openCreateContract(page: Page): Promise<Locator> {
  await page.getByRole('button', { name: 'Create Contract' }).click()
  const dialog = page.getByRole('dialog', { name: 'Create Contract' })
  await expect(dialog).toBeVisible()
  return dialog
}

async function setElectricityRate(page: Page, rate: string) {
  await page.getByRole('link', { name: 'Units' }).click()
  await page.getByRole('button', { name: 'Config' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel(/Electricity Rate per Unit/).fill(rate)
  await dialog.getByRole('button', { name: 'Save Rates' }).click()
  await expect(dialog).toBeHidden()
}
