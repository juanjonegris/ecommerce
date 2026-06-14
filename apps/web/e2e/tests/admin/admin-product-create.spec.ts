import { expect, test } from '@playwright/test';

import { AdminProductsPage } from '../../pages/admin/products.page';

import { loginAsAdmin } from './helpers';

test.describe('admin product create', () => {
  test('admin can create a product and see it in the list + on the storefront', async ({
    page,
  }) => {
    await loginAsAdmin(page);

    const products = new AdminProductsPage(page);
    await products.gotoList('en');
    await products.clickNew();
    await page.waitForURL(/\/en\/admin\/products\/new/);

    const uniqueName = `E2E Headphones ${String(Date.now())}`;
    await products.fillProductForm({
      name: uniqueName,
      description: 'Created by the admin-product-create Playwright spec.',
      price: 49.99,
    });
    await products.submit();

    // createProductAction returns a sentinel that the form turns into a
    // client-side router.push() to /admin/products/[slug]. The slug derives
    // from the product name — wait for any /admin/products/<slug> URL.
    await page.waitForURL(/\/en\/admin\/products\/[a-z0-9-]+(?:\?|$)/);

    // Back on the list page, the new product appears.
    await products.gotoList('en');
    await expect(products.table).toContainText(uniqueName);

    // Storefront PLP shows the same product (the home page revalidates on
    // a 60s timer, but the catalog query uses revalidate:60 — for the
    // freshly-created row to appear we may need to bypass the cache by
    // hitting the page with a unique query string. The simpler check: visit
    // the public list and assert the name is somewhere in the response.
    await page.goto('/en/products');
    await expect(page.getByTestId('product-grid')).toContainText(uniqueName, {
      timeout: 10_000,
    });
  });
});
