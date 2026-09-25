import { expect, test } from '@playwright/test'
import { signIn } from './signIn'

/*
  ออกบิลเป็นงานหลักของหอพัก บิลออกผ่าน POST /api/receipts ผู้เช่า ค่าเช่า และอัตรามาจากสัญญาของห้อง
  ห้อง 207 ในข้อมูลตัวอย่างมีสัญญา active ล็อกค่าไฟไว้ 50 ต่อหน่วย
  เทสเช็คว่ายอดค่าไฟคำนวณจากจำนวนหน่วยที่กรอก แล้วบิลที่ออกต้องขึ้นในตารางทันที
  ตัวเลขเงินเช็คแค่ส่วนตัวเลข ไม่ผูกกับสัญลักษณ์สกุลเงิน
*/
test('E2E-PAYMENT-001: Creating a bill for room 207 calculates electricity from the entered usage and the bill appears in the table', async ({ page }) => {
  await signIn(page)
  await page.getByRole('link', { name: 'Payments' }).click()
  await expect(page.getByRole('heading', { name: 'Payment Management' })).toBeVisible()
  await expect(page.getByRole('row', { name: /Yuki Tanaka/ })).toBeVisible()
  const rowsBefore = await page.getByRole('row').count()

  await page.getByRole('button', { name: 'New Invoice' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText('Create Payment')

  await dialog.locator('#payment-room').fill('207')
  await expect(dialog.locator('#payment-tenant')).toHaveValue('Hiroshi Nakamura')
  await dialog.locator('#electric-usage').fill('100')
  await dialog.locator('#water-usage').fill('10')
  await expect(dialog).toContainText(/× 50\.00 \/ unit = \D*5,000/)

  await dialog.getByRole('button', { name: 'Create Bill' }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByRole('row')).toHaveCount(rowsBefore + 1)
  await expect(page.getByRole('row', { name: /Hiroshi Nakamura/ }).first()).toBeVisible()
})
