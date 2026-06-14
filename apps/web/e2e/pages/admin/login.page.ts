import type { Locator, Page } from '@playwright/test';

/** Page Object Model for the admin login route at /[locale]/login. */
export class AdminLoginPage {
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly submitButton: Locator;
  readonly errorMessage: Locator;
  readonly title: Locator;

  constructor(private readonly page: Page) {
    this.emailInput = page.getByTestId('login-email');
    this.passwordInput = page.getByTestId('login-password');
    this.submitButton = page.getByTestId('login-submit');
    this.errorMessage = page.getByTestId('login-error');
    this.title = page.getByTestId('login-title');
  }

  async goto(locale: string, next?: string): Promise<void> {
    const path = next ? `/${locale}/login?next=${encodeURIComponent(next)}` : `/${locale}/login`;
    await this.page.goto(path);
  }

  async fillCredentials(email: string, password: string): Promise<void> {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
  }

  async submit(): Promise<void> {
    await this.submitButton.click();
  }
}
