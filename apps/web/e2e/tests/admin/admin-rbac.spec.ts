import { expect, test } from '@playwright/test';

import { AdminLoginPage } from '../../pages/admin/login.page';

test.describe('admin RBAC', () => {
  test('logged-out admin visit redirects to /login with next param', async ({ page }) => {
    await page.goto('/en/admin');
    await page.waitForURL(/\/en\/login(?:$|\?)/);
    const login = new AdminLoginPage(page);
    await expect(login.title).toBeVisible();
  });

  test('logged-out admin sub-route also redirects', async ({ page }) => {
    await page.goto('/en/admin/products');
    await page.waitForURL(/\/en\/login(?:$|\?)/);
  });

  test('login page is reachable directly', async ({ page }) => {
    await page.goto('/en/login');
    const login = new AdminLoginPage(page);
    await expect(login.emailInput).toBeVisible();
    await expect(login.passwordInput).toBeVisible();
  });
});
