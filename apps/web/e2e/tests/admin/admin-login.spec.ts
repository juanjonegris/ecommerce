import { expect, test } from '@playwright/test';

import { AdminDashboardPage } from '../../pages/admin/dashboard.page';
import { AdminLoginPage } from '../../pages/admin/login.page';

import { ADMIN_EMAIL, ADMIN_PASSWORD } from './helpers';

test.describe('admin login', () => {
  test('valid credentials redirect to /en/admin and render the dashboard', async ({ page }) => {
    const login = new AdminLoginPage(page);
    await login.goto('en');
    await expect(login.title).toBeVisible();

    await login.fillCredentials(ADMIN_EMAIL, ADMIN_PASSWORD);
    await login.submit();

    await page.waitForURL(/\/en\/admin(?:$|\/)/);
    const dashboard = new AdminDashboardPage(page);
    await expect(dashboard.title).toBeVisible();
    await expect(dashboard.userEmail).toHaveText(ADMIN_EMAIL);
  });

  test('invalid credentials surface the error message and stay on /login', async ({ page }) => {
    const login = new AdminLoginPage(page);
    await login.goto('en');
    await login.fillCredentials(ADMIN_EMAIL, 'wrong-password');
    await login.submit();

    await expect(login.errorMessage).toBeVisible();
    await expect(page).toHaveURL(/\/en\/login/);
  });
});
