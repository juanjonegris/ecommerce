import type { Locator, Page } from '@playwright/test';

/** Page Object Model for the admin newsletter list + row actions. */
export class AdminNewsletterPage {
  readonly listPage: Locator;
  readonly table: Locator;

  constructor(private readonly page: Page) {
    this.listPage = page.getByTestId('admin-newsletter-page');
    this.table = page.getByTestId('admin-newsletter-table');
  }

  async gotoList(locale: string): Promise<void> {
    await this.page.goto(`/${locale}/admin/newsletter`);
  }

  /** emailKey is the email with non-alphanumeric chars replaced by '-'. */
  emailKey(email: string): string {
    return email.replace(/[^a-zA-Z0-9]/g, '-');
  }

  emailCell(email: string): Locator {
    return this.page.getByTestId(`admin-newsletter-email-${this.emailKey(email)}`);
  }

  async openActions(email: string): Promise<void> {
    await this.page.getByTestId(`admin-newsletter-actions-${this.emailKey(email)}`).click();
  }

  async clickResync(email: string): Promise<void> {
    await this.openActions(email);
    await this.page.getByTestId(`admin-newsletter-resync-${this.emailKey(email)}`).click();
  }
}
