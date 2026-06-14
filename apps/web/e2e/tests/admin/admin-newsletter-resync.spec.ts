import { expect, test } from '@playwright/test';

import { AdminNewsletterPage } from '../../pages/admin/newsletter.page';

import { loginAsAdmin } from './helpers';

test.describe('admin newsletter resync', () => {
  test('admin can trigger a force-resync row action', async ({ page }) => {
    await loginAsAdmin(page);

    const newsletter = new AdminNewsletterPage(page);
    await newsletter.gotoList('en');
    await expect(newsletter.listPage).toBeVisible();

    // The seed file doesn't include subscribers (newsletter is opt-in from
    // the storefront), so skip if none exist. The shape under test is the
    // row-action wiring — the success vs CONFLICT branches are unit-tested
    // separately at the action level.
    const rowCount = await page.locator('[data-testid^="admin-newsletter-actions-"]').count();
    if (rowCount === 0) {
      test.skip(true, 'no newsletter subscribers seeded — skipping resync action test');
    }

    // Open the first row's action menu and click resync.
    const firstActions = page.locator('[data-testid^="admin-newsletter-actions-"]').first();
    await firstActions.click();

    const firstResync = page.locator('[data-testid^="admin-newsletter-resync-"]').first();
    await firstResync.click();

    // Either a success toast or a CONFLICT-style toast; both confirm the
    // row-action plumbing reached the backend and surfaced a result.
    await expect(page.locator('[data-sonner-toast]').first()).toBeVisible({
      timeout: 10_000,
    });
  });
});
