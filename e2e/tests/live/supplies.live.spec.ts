import { expect, test, type Page } from '@playwright/test'
import { signInLive, uniqueName } from './signInLive'

/*
  US-17 (SSK-23) — คลังอุปกรณ์ เพิ่มของ เติมของ และเตือนเมื่อของต่ำกว่าเกณฑ์

  Core requirement ข้อ "Track maintenance tasks and **supply usage**" ของโจทย์
  ฝั่ง backend มี SupplyApiTest 17 เคสกับ SupplyServiceTest 12 เคสคุมไว้แน่นแล้ว
  แต่แท็บ Supplies & Inventory ยังไม่มีเคส E2E เลยสักตัว ช่องว่างตรงนี้สำคัญ
  เพราะบั๊กแบบที่เคยเจอใน SSK-139 (ป็อปอัปกดบันทึกแล้วไม่ยิง API) เป็นบั๊กที่
  เทสฝั่ง backend มองไม่เห็น และเทสที่วิ่งกับ mock ก็มองไม่เห็นเหมือนกัน
  เพราะ mockApi.ts รับทุก method โดยไม่ตรวจอะไร

  ทั้งสองเคสเขียนข้อมูลลงฐานข้อมูลจริง จึงใช้ชื่อที่สุ่มใหม่ทุกครั้งและลบทิ้งใน finally
  ของที่เพิ่งสร้างยังไม่เคยถูกใช้ในใบแจ้งซ่อม จึงลบได้ (SupplyService.delete ตอบ 409
  เฉพาะของที่มีประวัติการใช้งานแล้ว ส่วนประวัติการเติมถูกลบตามให้เอง)
*/

async function openSuppliesTab(page: Page) {
  await page.getByRole('link', { name: 'Maintenance' }).click()
  await page.getByRole('button', { name: 'Supplies & Inventory' }).click()
  await expect(page.getByRole('heading', { name: 'Current Inventory' })).toBeVisible()
}

/** กรอกฟอร์ม New Supply Item แล้วคืนเลขของที่ backend สร้างให้ เอาไว้ลบทิ้งตอนจบ */
async function addSupply(
  page: Page,
  item: { name: string; stock: number; minStock: number; maxStock: number },
): Promise<number> {
  await page.getByRole('button', { name: 'New Supply Item' }).click()
  const dialog = page.getByRole('dialog', { name: 'Add Supply Item' })

  await dialog.getByLabel('Item Name').fill(item.name)
  await dialog.getByLabel('Category').selectOption('Plumbing')
  await dialog.getByLabel('Quantity').fill(String(item.stock))
  await dialog.getByLabel('Min Stock').fill(String(item.minStock))
  await dialog.getByLabel('Max Stock').fill(String(item.maxStock))

  const created = page.waitForResponse(
    (res) =>
      new URL(res.url()).pathname === '/api/supplies' && res.request().method() === 'POST',
  )
  await dialog.getByRole('button', { name: 'Add Supply' }).click()

  const response = await created
  expect(response.status(), 'เพิ่มของเข้าคลังไม่สำเร็จ').toBe(201)
  await expect(dialog).toBeHidden()

  const supply = (await response.json()) as { id: number }
  return supply.id
}

/*
  เก็บกวาดผ่าน API ตรง ๆ ไม่ผ่านหน้าจอ เพราะไม่ใช่สิ่งที่เทสต้องการพิสูจน์
  page.request ใช้ cookie ชุดเดียวกับที่เพิ่งล็อกอินไว้ จึงผ่านยามของ backend ได้
*/
async function deleteSupply(page: Page, id: number) {
  const removed = await page.request.delete(`/api/supplies/${id}`)
  expect(removed.status(), 'ลบของที่เทสสร้างไม่สำเร็จ').toBeLessThan(300)
}

/** แถวของของชิ้นนี้ในตาราง Current Inventory */
function supplyRow(page: Page, name: string) {
  return page.getByRole('row').filter({ hasText: name })
}

/*
  ตัวเลขบนการ์ด LOW STOCK ALERTS

  การ์ดเป็น role="group" ที่มีชื่อตรงกับป้าย ส่วนตัวเลขข้างในเป็นแค่ <p> ไม่มี role
  ของตัวเอง จึงเจาะตรงไม่ได้ อ่านข้อความทั้งการ์ดแล้วหยิบบรรทัดที่เป็นตัวเลขล้วนออกมา
  (อีกสองบรรทัดคือป้ายกับคำอธิบาย ไม่มีทางเป็นตัวเลขล้วน) ระหว่างโหลดรอบแรก
  หน้าเว็บขึ้นขีดแทนศูนย์ ถ้าเจอขีดแปลว่ายังโหลดไม่เสร็จ ให้รอรอบถัดไป
*/
async function lowStockCount(page: Page): Promise<number> {
  const card = page.getByRole('group', { name: 'LOW STOCK ALERTS' })
  let count = NaN
  await expect
    .poll(async () => {
      const line = (await card.innerText())
        .split(/\r?\n/)
        .map((part) => part.trim())
        .find((part) => /^\d+$/.test(part))
      count = line === undefined ? NaN : Number(line)
      return line
    }, { message: 'การ์ด LOW STOCK ALERTS ไม่มีตัวเลขให้อ่าน' })
    .not.toBeUndefined()
  return count
}

test('E2E-LIVE-SUPPLY-001: A new item and a restock are both saved to the database', async ({
  page,
}) => {
  await signInLive(page)
  await openSuppliesTab(page)

  const name = uniqueName('QA Supply')
  const supplyId = await addSupply(page, { name, stock: 20, minStock: 5, maxStock: 100 })

  try {
    // US-17-S1 ของใหม่ต้องโผล่ในตารางทันที พร้อมจำนวนที่กรอกไว้
    const row = supplyRow(page, name)
    await expect(row).toBeVisible()
    await expect(row).toContainText('20')
    await expect(row).toContainText('In Stock')

    // US-17-S2 เติมของแล้วจำนวนต้องบวกเข้ากับของเดิม ไม่ใช่ทับค่าเดิม
    await row.getByRole('button', { name: `Restock ${name}` }).click()
    const restockDialog = page.getByRole('dialog', { name: `Restock ${name}` })
    await restockDialog.getByLabel('Amount to add').fill('15')

    const restocked = page.waitForResponse(
      (res) => res.url().includes(`/api/supplies/${supplyId}/restock`) && res.request().method() === 'POST',
    )
    await restockDialog.getByRole('button', { name: 'Restock' }).click()
    expect((await restocked).status(), 'เติมของไม่สำเร็จ').toBeLessThan(300)
    await expect(restockDialog).toBeHidden()

    /*
      รีโหลดทั้งหน้าก่อนตรวจ ถ้าดูแต่ตัวเลขที่เด้งขึ้นทันทีหลังกดบันทึก เราจะพิสูจน์ได้แค่ว่า
      หน้าเว็บคำนวณเลขใหม่ในหัวตัวเองถูก ไม่ได้พิสูจน์ว่ามันถูกเขียนลง PostgreSQL จริง
    */
    await page.reload()
    await page.getByRole('button', { name: 'Supplies & Inventory' }).click()
    await expect(supplyRow(page, name)).toContainText('35')
  } finally {
    await deleteSupply(page, supplyId)
  }
})

test('E2E-LIVE-SUPPLY-002: An item below its minimum is flagged as Low Stock and counted in the alert card', async ({
  page,
}) => {
  await signInLive(page)
  await openSuppliesTab(page)

  /*
    US-17-S3 เตือนเมื่อของต่ำกว่าเกณฑ์ที่ตกลงกัน กฎอยู่ที่ supplyStatus() คือ
    stock < minStock ถึงจะนับว่า Low Stock (เท่ากับพอดียังไม่นับ)
    ตั้งของให้เหลือ 2 ชิ้นจากขั้นต่ำ 10 เพื่อให้ตกเกณฑ์ชัด ๆ ไม่ใช่คาบเส้น
  */
  const name = uniqueName('QA LowStock')
  const supplyId = await addSupply(page, { name, stock: 2, minStock: 10, maxStock: 50 })

  try {
    const row = supplyRow(page, name)
    await expect(row).toBeVisible()
    await expect(row, 'ของที่ต่ำกว่าขั้นต่ำต้องขึ้นป้าย Low Stock').toContainText('Low Stock')

    /*
      การ์ด LOW STOCK ALERTS ต้องนับของชิ้นนี้ด้วย ตัวเลขมาจาก GET /api/supplies/summary
      ซึ่งเป็นคนละคำขอกับรายการในตาราง ถ้าตรวจแค่ป้ายในแถว เราจะไม่มีทางรู้เลยว่า
      backend นับยอดสรุปด้วยกฎเดียวกับที่หน้าเว็บใช้ตีป้ายหรือเปล่า
    */
    const before = await lowStockCount(page)

    // เติมของให้พ้นเกณฑ์ แล้วป้ายกับตัวเลขบนการ์ดต้องเปลี่ยนตามไปทั้งคู่
    await row.getByRole('button', { name: `Restock ${name}` }).click()
    const restockDialog = page.getByRole('dialog', { name: `Restock ${name}` })
    await restockDialog.getByLabel('Amount to add').fill('20')
    await restockDialog.getByRole('button', { name: 'Restock' }).click()
    await expect(restockDialog).toBeHidden()

    await expect(supplyRow(page, name)).toContainText('In Stock')
    await expect.poll(() => lowStockCount(page), {
      message: 'เติมของจนพ้นเกณฑ์แล้ว ตัวเลขบนการ์ดเตือนต้องลดลงหนึ่ง',
    }).toBe(before - 1)
  } finally {
    await deleteSupply(page, supplyId)
  }
})
