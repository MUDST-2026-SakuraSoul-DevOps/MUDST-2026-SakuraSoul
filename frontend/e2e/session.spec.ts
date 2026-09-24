import { expect, test } from '@playwright/test'
import { signIn } from './signIn'

test('E2E-LOGOUT-001: Logging out returns to the Login page', async ({ page }) => {
  await signIn(page)

  await page.getByRole('button', { name: 'Log out' }).click()
  await expect(page.getByText('Are you sure you want to logout?')).toBeVisible()
  await page.getByRole('button', { name: 'CONFIRM' }).click()

  await expect(page).toHaveURL('/login')
  await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible()
})

test('E2E-LOGOUT-002: Clicking CANCEL on the logout popup stays on the current page', async ({ page }) => {
  await signIn(page)

  await page.getByRole('button', { name: 'Log out' }).click()
  await page.getByRole('button', { name: 'CANCEL', exact: true }).click()

  await expect(page.getByText('Are you sure you want to logout?')).toBeHidden()
  await expect(page).toHaveURL('/')
})
