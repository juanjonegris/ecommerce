import { expect, test } from '@playwright/test';

import { AdminOrdersPage } from '../../pages/admin/orders.page';

import { loginAsAdmin } from './helpers';

test.describe('admin order status', () => {
  test('admin can transition a PENDING order to CONFIRMED', async ({ page }) => {
    await loginAsAdmin(page);

    const orders = new AdminOrdersPage(page);
    await orders.gotoList('en');
    await expect(orders.listPage).toBeVisible();

    // Filter to PENDING so we get an actionable row regardless of seed shape.
    await page.getByTestId('admin-orders-filter-PENDING').click();
    await page.waitForURL(/status=PENDING/);

    // Click the first order row in the list.
    const firstRow = page.locator('[data-testid^="admin-row-"]').first();
    if ((await firstRow.count()) === 0) {
      test.skip(true, 'no PENDING orders seeded — skipping transition test');
    }
    await firstRow.getByRole('link').first().click();

    await expect(orders.detailPage).toBeVisible();
    await expect(orders.statusButtons).toBeVisible();

    await orders.clickStatusButton('CONFIRMED');

    // Backend transition + revalidatePath → the badge should re-render.
    await expect(orders.statusBadge('CONFIRMED')).toBeVisible({
      timeout: 10_000,
    });
  });
});
