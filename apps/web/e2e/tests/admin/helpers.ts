import type { Page } from '@playwright/test';

import { AdminLoginPage } from '../../pages/admin/login.page';

export const ADMIN_EMAIL = 'admin@example.com';
export const ADMIN_PASSWORD = 'admin123';

/**
 * Sign in as the seeded admin and assert the dashboard renders. Reused by
 * every admin spec — the login flow itself is exercised once in
 * admin-login.spec.ts.
 */
export async function loginAsAdmin(page: Page, locale = 'en'): Promise<void> {
  const login = new AdminLoginPage(page);
  await login.goto(locale);
  await login.fillCredentials(ADMIN_EMAIL, ADMIN_PASSWORD);
  await login.submit();
  await page.waitForURL(new RegExp(`/${locale}/admin(?:$|/)`));
}
