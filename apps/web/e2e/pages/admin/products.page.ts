import type { Locator, Page } from '@playwright/test';

/** Page Object Model for the admin products list + form pages. */
export class AdminProductsPage {
  readonly newButton: Locator;
  readonly table: Locator;
  readonly nameInput: Locator;
  readonly descriptionInput: Locator;
  readonly priceInput: Locator;
  readonly categoryInput: Locator;
  readonly submitButton: Locator;

  constructor(private readonly page: Page) {
    this.newButton = page.getByTestId('admin-products-new-button');
    this.table = page.getByTestId('admin-products-table');
    this.nameInput = page.getByTestId('admin-products-name-input');
    this.descriptionInput = page.getByTestId('admin-products-description-input');
    this.priceInput = page.getByTestId('admin-products-price-input');
    this.categoryInput = page.getByTestId('admin-products-category-input');
    this.submitButton = page.getByTestId('admin-products-submit');
  }

  async gotoList(locale: string): Promise<void> {
    await this.page.goto(`/${locale}/admin/products`);
  }

  async clickNew(): Promise<void> {
    await this.newButton.click();
  }

  async fillProductForm(input: {
    name: string;
    description?: string;
    price: number;
  }): Promise<void> {
    await this.nameInput.fill(input.name);
    if (input.description !== undefined) {
      await this.descriptionInput.fill(input.description);
    }
    await this.priceInput.fill(String(input.price));
    // Select the first option of the category dropdown — seeded categories
    // always include at least one entry.
    const value = await this.categoryInput.locator('option').nth(1).getAttribute('value');
    if (value) await this.categoryInput.selectOption(value);
  }

  async submit(): Promise<void> {
    await this.submitButton.click();
  }

  rowLink(slug: string): Locator {
    return this.page.getByTestId(`admin-products-row-${slug}-link`);
  }
}
