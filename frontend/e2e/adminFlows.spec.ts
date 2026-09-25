import { expect, test } from '@playwright/test'
import { signIn } from './signIn'

test('E2E-LOGIN-001: Sign in redirects to Dashboard with rooms on both floors visible', async ({ page }) => {
  await signIn(page)

  await expect(page).toHaveURL('/')
  await expect(page.getByRole('heading', { name: 'Floor 1' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Floor 2' })).toBeVisible()
  await expect(page.getByLabel('Unit 101', { exact: true })).toBeVisible()
  await expect(page.getByLabel('Unit 212', { exact: true })).toBeVisible()
})

test('E2E-TENANT-001: Adding a new tenant shows it in the tenant table immediately', async ({ page }) => {
  await signIn(page)
  await page.getByRole('link', { name: 'Tenants' }).click()

  await page.getByRole('button', { name: 'Add New Tenant' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Full name').fill('Mana Sukjai')
  await dialog.getByLabel('Phone number').fill('0891234567')
  // เลขบัตรบังคับตามคำตัดสินอาจารย์ 11 ก.ย. (checksum ถูกต้อง) และต้องไม่ซ้ำกับผู้เช่าที่มีอยู่
  // backend จำลองตอบ 409 เลขซ้ำแล้วเหมือนของจริง (SSK-136) เลขของ Yuki จึงใช้ไม่ได้
  await dialog.getByLabel('National ID').fill('3500100123457')
  await dialog.getByRole('button', { name: 'Confirm' }).click()

  await expect(dialog).toBeHidden()
  await expect(page.getByRole('row', { name: /Mana Sukjai/ })).toBeVisible()
})

/*
  เส้นทางหลักของแอดมินตั้งแต่ต้นจนจบ ต่อกันในเทสเดียวเพราะแต่ละขั้นใช้ผลของขั้นก่อน
  ผู้เช่าที่เพิ่งเพิ่มต้องเลือกได้ในฟอร์มสัญญา และสัญญาที่เพิ่งสร้างต้องทำให้ห้อง
  บน Dashboard เปลี่ยนเป็น Occupied (US-08 ข้อมูลทุกหน้าต้องตรงกัน)
  เดินด้วยเมนูด้านข้างตลอด ไม่ใช้ page.goto เพราะ backend จำลองเก็บข้อมูลใน memory
  โหลดหน้าใหม่เมื่อไหร่ข้อมูลที่เพิ่งสร้างจะหายไปด้วย
*/
test('E2E-CONTRACT-001: Adding a tenant and creating a contract for them turns the room Occupied on the Dashboard', async ({ page }) => {
  await signIn(page)

  // การ์ดห้องบอกสถานะด้วยจุดสี ไม่มีข้อความ จึงเช็คจากตัวเลขในการ์ดสรุป
  // กับชื่อผู้เช่าที่การ์ดห้องจะขึ้นเมื่อมีสัญญาแทน
  const room = page.getByLabel('Unit 105', { exact: true })
  await expect(room).not.toContainText('Mana Sukjai')
  const occupiedBefore = await unitCount(page, 'Occupied')
  const availableBefore = await unitCount(page, 'Available')

  await page.getByRole('link', { name: 'Tenants' }).click()
  await page.getByRole('button', { name: 'Add New Tenant' }).click()
  const tenantDialog = page.getByRole('dialog')
  await tenantDialog.getByLabel('Full name').fill('Mana Sukjai')
  await tenantDialog.getByLabel('Phone number').fill('0891234567')
  await tenantDialog.getByLabel('National ID').fill('3500100123457')
  await tenantDialog.getByRole('button', { name: 'Confirm' }).click()
  await expect(tenantDialog).toBeHidden()

  await page.getByRole('link', { name: 'Contracts' }).click()
  await page.getByRole('button', { name: 'Create Contract' }).click()
  const contractDialog = page.getByRole('dialog', { name: 'Create Contract' })
  const unitSelect = contractDialog.locator('#unit-select')
  await unitSelect.selectOption({ label: await optionLabel(unitSelect, /^105 /) })
  const tenantSelect = contractDialog.locator('#tenant-select')
  await tenantSelect.selectOption({ label: await optionLabel(tenantSelect, /Mana Sukjai/) })
  await contractDialog.getByRole('button', { name: 'Create Contract' }).click()
  await expect(contractDialog).toBeHidden()
  await expect(page.getByRole('row', { name: /Mana Sukjai/ })).toBeVisible()

  await page.getByRole('link', { name: 'Dashboard' }).click()
  await expect(room).toContainText('Mana Sukjai')
  expect(await unitCount(page, 'Occupied')).toBe(occupiedBefore + 1)
  expect(await unitCount(page, 'Available')).toBe(availableBefore - 1)
})

/** ตัวเลขในการ์ดสรุปบน Dashboard เช่น การ์ด "Occupied units" */
async function unitCount(page: import('@playwright/test').Page, label: 'Available' | 'Occupied'): Promise<number> {
  const card = page.getByRole('group', { name: `${label} units` })
  await expect(card).toBeVisible()
  const digits = (await card.innerText()).match(/\d+/)
  if (!digits) throw new Error(`No number in the ${label} units card`)
  return Number(digits[0])
}

/** หาข้อความของตัวเลือกที่ตรงกับ pattern เพราะป้ายใน dropdown มีส่วนต่อท้ายเช่น "· Floor 1" */
async function optionLabel(select: import('@playwright/test').Locator, pattern: RegExp): Promise<string> {
  const labels = await select.locator('option').allTextContents()
  const match = labels.find((label) => pattern.test(label.trim()))
  if (!match) throw new Error(`No option matching ${pattern} in: ${labels.join(' | ')}`)
  return match.trim()
}
