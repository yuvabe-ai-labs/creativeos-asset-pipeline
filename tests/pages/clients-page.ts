import { type Page, type Locator } from "@playwright/test";

export class ClientsPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly newClientButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole("heading", { name: /clients/i });
    this.newClientButton = page.getByRole("button", { name: /new client/i });
  }

  async goto() {
    await this.page.goto("/");
  }

  clientCard(name: string): Locator {
    return this.page.getByText(name).first();
  }
}
