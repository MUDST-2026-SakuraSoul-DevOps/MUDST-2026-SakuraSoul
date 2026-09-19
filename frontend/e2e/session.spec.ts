import { expect, test } from '@playwright/test'
import { signIn } from './signIn'

test('ออกจากระบบแล้วกลับไปหน้า Login', async ({ page }) => {
  await signIn(page)

  await page.getByRole('button', { name: 'Log out' }).click()
  await expect(page.getByText('Are you sure you want to logout?')).toBeVisible()
  await page.getByRole('button', { name: 'CONFIRM' }).click()

  await expect(page).toHaveURL('/login')
  await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible()
})
