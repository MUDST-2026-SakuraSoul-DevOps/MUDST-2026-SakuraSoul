import { expect, test } from '@playwright/test'
import { signIn } from './signIn'

/*
  SSK-131 งานซ่อมเดินครบวงจากหน้าจอจริง เดิมปุ่ม Save Maintenance บน Dashboard ปิดป็อปอัป
  โดยไม่บันทึกอะไร และแท็บ Maintenance Tasks เป็นข้อมูลตัวอย่างในโค้ด สองที่นี้จึงไม่เคยเห็นกัน

  เดินด้วยเมนูด้านข้างตลอด ไม่ใช้ page.goto เพราะ backend จำลองเก็บข้อมูลใน memory
  โหลดหน้าใหม่เมื่อไหร่ใบที่เพิ่งสร้างจะหายไปด้วย
*/
test('E2E-MAINT-003: A ticket created on the Dashboard closes the room and can be finished from Maintenance Tasks', async ({ page }) => {
  await signIn(page)

  await page.getByRole('button', { name: 'Create Maintenance' }).click()
  const createDialog = page.getByRole('dialog', { name: 'Create Maintenance' })
  await createDialog.getByRole('button', { name: '105', exact: true }).click()
  await createDialog.getByLabel('Maintenance Type').selectOption('Electrical')
  await createDialog.getByRole('radio', { name: /Out of Service/ }).click()
  await createDialog.getByLabel('Additional Notes').fill('Socket sparks when a plug goes in')
  await createDialog.getByRole('button', { name: /Save Maintenance/ }).click()
  await expect(createDialog).toBeHidden()

  // การ์ดห้องขึ้นทั้งสถานะปิดซ่อมและชื่องาน (ประเภทงานเป็นชื่องานของใบที่สร้างจาก Dashboard)
  const room = page.getByLabel('Unit 105', { exact: true })
  await expect(room).toContainText('Maintenance')
  await expect(room).toContainText('Electrical')

  await page.getByRole('link', { name: 'Maintenance' }).click()
  const taskRow = page.getByRole('row', { name: /Socket sparks/ })
  await expect(taskRow).toContainText('105')
  await expect(taskRow).toContainText('Wait for Assign')

  await page.getByRole('button', { name: 'Edit task Electrical' }).click()
  const editDialog = page.getByRole('dialog', { name: 'Edit Maintenance Task' })
  await editDialog.getByLabel('Status').selectOption('DONE')
  await editDialog.getByRole('button', { name: 'Confirm' }).click()
  await expect(editDialog).toBeHidden()
  await expect(taskRow).toContainText('Done')

  await page.getByRole('button', { name: 'Maintenance Log', exact: true }).click()
  await expect(page.getByRole('row', { name: /Socket sparks/ })).toContainText('Completed')
})

/*
  ลบได้เฉพาะใบ Open ที่แอดมินเปิดเอง ใบที่เริ่มทำแล้วเป็นประวัติงานซ่อม ต้องเห็นเหตุผลจาก
  backend ในป็อปอัป ไม่ใช่ปิดเงียบ ๆ จนเข้าใจว่าลบไปแล้ว
*/
test('E2E-MAINT-004: Only an open task can be deleted and an in-progress task explains why it stays', async ({ page }) => {
  await signIn(page)
  await page.getByRole('link', { name: 'Maintenance' }).click()

  await page.getByRole('button', { name: 'Delete task AC compressor replacement' }).click()
  const blocked = page.getByRole('dialog', { name: 'Delete Maintenance Task' })
  await blocked.getByRole('button', { name: 'Delete task' }).click()
  await expect(blocked.getByRole('alert')).toContainText('in progress and cannot be deleted')
  await blocked.getByRole('button', { name: 'Cancel' }).click()
  await expect(blocked).toBeHidden()
  await expect(page.getByRole('row', { name: /AC compressor replacement/ })).toBeVisible()

  await page.getByRole('button', { name: 'Delete task Bathroom tap dripping' }).click()
  const allowed = page.getByRole('dialog', { name: 'Delete Maintenance Task' })
  await allowed.getByRole('button', { name: 'Delete task' }).click()
  await expect(allowed).toBeHidden()
  await expect(page.getByRole('row', { name: /Bathroom tap dripping/ })).toHaveCount(0)
})
