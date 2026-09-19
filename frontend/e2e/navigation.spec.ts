import { expect, test } from '@playwright/test'
import { signIn } from './signIn'

const PAGES = [
  { link: 'Units', heading: 'Unit Management' },
  { link: 'Tenants', heading: 'Tenant Directory' },
  { link: 'Payments', heading: 'Payment Management' },
  { link: 'Maintenance', heading: 'Maintenance Management' },
  { link: 'Contracts', heading: 'Contract Management' },
  { link: 'Appliances', heading: 'Appliance Rental' },
  { link: 'Dashboard', heading: 'Room Availability' },
]

test('เมนูด้านข้างพาไปทุกหน้าได้ และแต่ละหน้าขึ้นหัวข้อของตัวเอง', async ({ page }) => {
  await signIn(page)

  for (const { link, heading } of PAGES) {
    await page.getByRole('link', { name: link }).click()
    await expect(page.getByRole('heading', { name: heading, level: 1 })).toBeVisible()
  }
})
