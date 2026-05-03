import type { Locator, Page } from '@playwright/test';

// Page Object Model for the product detail page (PDP).
// All locators MUST use data-testid per CLAUDE.md §6.
export class ProductPage {
  readonly productName: Locator;
  readonly productPrice: Locator;
  readonly addToCartButton: Locator;

  constructor(private readonly page: Page) {
    this.productName = page.getByTestId('product-name');
    this.productPrice = page.getByTestId('product-price');
    this.addToCartButton = page.getByTestId('add-to-cart-button');
  }

  async goto(locale: string, slug: string): Promise<void> {
    await this.page.goto(`/${locale}/products/${slug}`);
  }

  async addToCart(): Promise<void> {
    await this.addToCartButton.click();
  }
}

export class ProductListPage {
  readonly grid: Locator;
  readonly emptyState: Locator;
  readonly errorState: Locator;

  constructor(private readonly page: Page) {
    this.grid = page.getByTestId('product-grid');
    this.emptyState = page.getByTestId('products-empty');
    this.errorState = page.getByTestId('products-error');
  }

  async goto(locale: string): Promise<void> {
    await this.page.goto(`/${locale}/products`);
  }

  productCard(slug: string): Locator {
    return this.page.getByTestId(`product-card-${slug}`);
  }
}

export class CartPage {
  readonly empty: Locator;
  readonly items: Locator;
  readonly total: Locator;

  constructor(private readonly page: Page) {
    this.empty = page.getByTestId('cart-empty');
    this.items = page.getByTestId('cart-items');
    this.total = page.getByTestId('cart-total');
  }

  async goto(locale: string): Promise<void> {
    await this.page.goto(`/${locale}/cart`);
  }

  line(slug: string): Locator {
    return this.page.getByTestId(`cart-line-${slug}`);
  }
}
