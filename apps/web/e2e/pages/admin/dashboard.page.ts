import type { Locator, Page } from '@playwright/test';

/** Page Object Model for the admin dashboard home at /[locale]/admin. */
export class AdminDashboardPage {
  readonly title: Locator;
  readonly kpiGrid: Locator;
  readonly recentOrders: Locator;
  readonly recentChats: Locator;
  readonly userEmail: Locator;

  constructor(private readonly page: Page) {
    this.title = page.getByTestId('admin-dashboard-title');
    this.kpiGrid = page.getByTestId('admin-kpi-grid');
    this.recentOrders = page.getByTestId('admin-recent-orders');
    this.recentChats = page.getByTestId('admin-recent-chats');
    this.userEmail = page.getByTestId('admin-user-email');
  }

  async goto(locale: string): Promise<void> {
    await this.page.goto(`/${locale}/admin`);
  }

  kpiTile(name: string): Locator {
    return this.page.getByTestId(`admin-kpi-${name}`);
  }
}
