import { expect, test } from '@playwright/test';

import { CartPage, ProductListPage, ProductPage } from '../pages/product.page';

// Happy path: PLP → click first product → PDP → add to cart → cart shows item.
// Uses only data-testid selectors (CLAUDE.md §6).
test.describe('checkout happy path', () => {
  test('add a seeded product to the cart', async ({ page }) => {
    const list = new ProductListPage(page);
    await list.goto('en');

    // Either the grid renders, or we get the empty/error state. Both are
    // valid scaffold outcomes; only proceed if products are present.
    await expect(list.grid.or(list.emptyState).or(list.errorState)).toBeVisible();

    if (await list.emptyState.isVisible()) {
      test.skip(true, 'API not seeded — skipping add-to-cart flow');
    }
    if (await list.errorState.isVisible()) {
      test.skip(true, 'API not reachable — skipping add-to-cart flow');
    }

    // Click the first product card.
    const firstCard = list.grid.getByTestId(/^product-card-/).first();
    const testId = await firstCard.getAttribute('data-testid');
    if (!testId?.startsWith('product-card-')) {
      throw new Error(`Unexpected data-testid: ${String(testId)}`);
    }
    const productSlug = testId.replace(/^product-card-/, '');
    await firstCard.click();

    // PDP renders.
    const pdp = new ProductPage(page);
    await expect(pdp.productName).toBeVisible();
    await expect(pdp.productPrice).toBeVisible();

    // Add to cart.
    await pdp.addToCart();

    // Navigate to the cart and confirm the line is there.
    const cart = new CartPage(page);
    await cart.goto('en');
    await expect(cart.items).toBeVisible();
    await expect(cart.line(productSlug)).toBeVisible();
  });
});
