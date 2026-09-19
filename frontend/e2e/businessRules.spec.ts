import { expect, test, type Locator, type Page } from '@playwright/test'
import { optionLabels, signIn } from './signIn'

/*
  US-05 ห้องเดียวกันห้ามมีสัญญาซ้อนช่วงเวลากัน ในหน้าเว็บกันไว้ด้วยการให้ฟอร์ม
  สร้างสัญญาเลือกได้แค่ห้องว่าง ห้องที่มีผู้เช่าอยู่จึงต้องไม่อยู่ในรายการเลย
  และห้องที่เพิ่งทำสัญญาไปต้องหายไปจากรายการทันที ไม่ใช่รอรีโหลด
  (ส่วนฐานข้อมูลกันซ้อนเองได้หรือไม่ พิสูจน์ที่ LeaseOverlapIntegrationTest ฝั่ง backend)
  ห้อง 102 มีสัญญาของ Yuki Tanaka อยู่แล้วในข้อมูลตั้งต้นของ backend จำลอง
*/
test('ฟอร์มสร้างสัญญาเลือกห้องที่มีผู้เช่าไม่ได้ และห้องที่เพิ่งทำสัญญาหายจากรายการทันที', async ({ page }) => {
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
test('เปลี่ยนค่าไฟใน Apartment Config แล้วฟอร์มสร้างสัญญาใช้อัตราใหม่', async ({ page }) => {
  await signIn(page)
  await setElectricityRate(page, '77')

  await page.getByRole('link', { name: 'Contracts' }).click()
  const dialog = await openCreateContract(page)
  const rates = await optionLabels(dialog.locator('#electric-billing'))
  expect(rates.some((label) => label.includes('77.00'))).toBe(true)
})

/*
  บั๊กที่ E2E ชุดนี้เจอ: ฟอร์มออกบิล (CreatePaymentDialog) เขียนค่าไฟตายตัวไว้ที่ 50
  ไม่อ่านจาก Apartment Config ค่าน้ำก็ตายตัวที่ 100 ที่ไม่เคยมีใครเห็นเพราะข้อมูลตั้งต้น
  ของ Config ก็เป็น 50 กับ 100 พอดี
  test.fail() ให้เทสนี้รันทุกรอบและคาดว่าจะพัง เมื่อไหร่ที่แก้บั๊กแล้วเทสจะผ่าน
  Playwright จะแจ้งว่าผ่านแบบไม่คาดคิด เป็นสัญญาณให้ลบ test.fail() ออก
*/
test('เปลี่ยนค่าไฟใน Apartment Config แล้วฟอร์มออกบิลใช้อัตราใหม่', async ({ page }) => {
  test.fail(true, 'ฟอร์มออกบิลยังเขียนค่าไฟตายตัวที่ 50 ไม่อ่านจาก Apartment Config')
  await signIn(page)
  await setElectricityRate(page, '77')

  await page.getByRole('link', { name: 'Payments' }).click()
  await page.getByRole('button', { name: 'New Invoice' }).click()
  await expect(page.getByRole('dialog')).toContainText('× 77.00 / unit', { timeout: 2_000 })
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
