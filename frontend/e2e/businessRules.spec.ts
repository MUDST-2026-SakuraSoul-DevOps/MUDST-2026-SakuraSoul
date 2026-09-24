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
  เทสนี้เจอบั๊กตอนเขียนครั้งแรก: ฟอร์มออกบิลเขียนค่าไฟตายตัวไว้ที่ 50 ไม่อ่านจาก
  Apartment Config ไม่มีใครเห็นเพราะค่าตั้งต้นของ Config ก็เป็น 50 พอดี
  ใช้อัตรา 77 ที่ไม่ตรงกับค่าตั้งต้น เทสจะได้แยกออกว่าอ่านจาก Config จริงหรือแค่บังเอิญตรง
*/
test('เปลี่ยนค่าไฟใน Apartment Config แล้วฟอร์มออกบิลใช้อัตราใหม่', async ({ page }) => {
  await signIn(page)
  await setElectricityRate(page, '77')

  await page.getByRole('link', { name: 'Payments' }).click()
  await page.getByRole('button', { name: 'New Invoice' }).click()
  await expect(page.getByRole('dialog')).toContainText('× 77.00 / unit')
})

/*
  ต่อจากสองเทสข้างบน คือพิสูจน์ว่าอัตราที่ล็อกไว้ตอนเซ็นสัญญาไม่ขยับตาม Config
  ทีหลัง (ประเด็นที่ QA ทักหลัง SSK-26: อ่านจาก Config อย่างเดียวยังไม่พอ เพราะ
  Config เปลี่ยนแล้วบิลของสัญญาเก่าจะเปลี่ยนอัตราตามไปด้วย)
*/
test('สร้างสัญญาใหม่ล็อกอัตราค่าไฟไว้ แล้ว Config เปลี่ยนทีหลัง บิลของห้องนั้นยังใช้อัตราเดิม', async ({ page }) => {
  await signIn(page)
  await setElectricityRate(page, '77')

  await page.getByRole('link', { name: 'Contracts' }).click()
  const dialog = await openCreateContract(page)
  const units = await optionLabels(dialog.locator('#unit-select'))
  const unit105 = units.find((label) => label.startsWith('105 '))
  expect(unit105).toBeDefined()
  await dialog.locator('#unit-select').selectOption({ label: unit105! })
  await dialog.getByRole('button', { name: 'Create Contract' }).click()
  await expect(dialog).toBeHidden()

  await setElectricityRate(page, '99')

  await page.getByRole('link', { name: 'Payments' }).click()
  await page.getByRole('button', { name: 'New Invoice' }).click()
  const paymentDialog = page.getByRole('dialog')
  await paymentDialog.locator('#payment-room').fill('105')
  await expect(paymentDialog).toContainText('× 77.00 / unit')
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
