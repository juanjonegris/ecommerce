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
    // from the product name — wait for any /admin/products/<slug> URL, but
    // NOT /new: we are already on /new, so a pattern that matches it resolves
    // immediately and the next goto() races the still-running Server Action.
    await page.waitForURL(/\/en\/admin\/products\/(?!new(?:\?|$))[a-z0-9-]+(?:\?|$)/);

    // Back on the list page, the new product appears.
    await products.gotoList('en');
    await expect(products.table).toContainText(uniqueName);

    // Storefront PLP shows the same product without waiting out its 60s
    // revalidate window: createProductAction expires the `products` cache tag.
    await page.goto('/en/products');
    await expect(page.getByTestId('product-grid')).toContainText(uniqueName, {
      timeout: 10_000,
    });
  });
});
