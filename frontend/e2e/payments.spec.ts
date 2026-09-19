import { expect, test } from '@playwright/test'
import { signIn } from './signIn'

/*
  ออกบิลเป็นงานหลักของหอพัก ฟอร์มตั้งต้นที่ห้อง 101 พร้อมข้อมูลผู้เช่าของห้องนั้น
  เทสเช็คว่ายอดค่าไฟคำนวณจากจำนวนหน่วยที่กรอก แล้วบิลที่ออกต้องขึ้นในตารางทันที
  ตัวเลขเงินเช็คแค่ส่วนตัวเลข ไม่ผูกกับสัญลักษณ์สกุลเงิน เพราะ SSK-126 กำลังเปลี่ยน
  เยนกลับเป็นบาท เทสนี้จะได้ไม่ต้องแก้ตาม
*/
test('ออกบิลห้อง 101 แล้วยอดค่าไฟคิดตามหน่วยที่กรอก และบิลขึ้นในตาราง', async ({ page }) => {
  await signIn(page)
  await page.getByRole('link', { name: 'Payments' }).click()
  await expect(page.getByRole('heading', { name: 'Payment Management' })).toBeVisible()
  const rowsBefore = await page.getByRole('row').count()

  await page.getByRole('button', { name: 'New Invoice' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText('Create Payment')
  await expect(dialog.locator('#payment-room')).toHaveValue('101')

  await dialog.locator('#electric-usage').fill('100')
  await expect(dialog).toContainText(/× 50\.00 \/ unit = \D*5,000/)

  await dialog.getByRole('button', { name: 'Create Bill' }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByRole('row')).toHaveCount(rowsBefore + 1)
  await expect(page.getByRole('row', { name: /Somchai P\./ }).first()).toBeVisible()
})
