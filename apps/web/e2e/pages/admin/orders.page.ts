import type { Locator, Page } from '@playwright/test';

import type { OrderStatus } from '@repo/types';

/** Page Object Model for the admin orders list + detail pages. */
export class AdminOrdersPage {
  readonly listPage: Locator;
  readonly detailPage: Locator;
  readonly statusButtons: Locator;

  constructor(private readonly page: Page) {
    this.listPage = page.getByTestId('admin-orders-page');
    this.detailPage = page.getByTestId('admin-orders-detail');
    this.statusButtons = page.getByTestId('admin-orders-status-buttons');
  }

  async gotoList(locale: string): Promise<void> {
    await this.page.goto(`/${locale}/admin/orders`);
  }

  async gotoDetail(locale: string, id: string): Promise<void> {
    await this.page.goto(`/${locale}/admin/orders/${id}`);
  }

  statusBadge(status: OrderStatus): Locator {
    return this.page.getByTestId(`admin-status-${status}`).first();
  }

  clickStatusButton(status: OrderStatus): Promise<void> {
    return this.page.getByTestId(`admin-orders-status-${status}`).click();
  }
}
