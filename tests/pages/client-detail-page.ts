import { type Page, type Locator } from "@playwright/test";

export class ClientDetailPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly clientsBreadcrumbLink: Locator;
  readonly brandKBButton: Locator;
  readonly newCanvasButton: Locator;
  readonly noCanvasesMessage: Locator;

  constructor(
    page: Page,
    readonly clientSlug: string
  ) {
    this.page = page;
    this.heading = page.getByRole("heading", { level: 1 });
    this.clientsBreadcrumbLink = page.getByRole("link", { name: /^clients$/i });
    // Base UI's <Button render={<Link .../>}> sets role="button" on the <a>
    this.brandKBButton = page.getByRole("button", { name: /brand kb/i });
    this.newCanvasButton = page.getByRole("button", { name: /new canvas/i });
    this.noCanvasesMessage = page.getByText("No canvases yet");
  }

  async goto() {
    await this.page.goto(`/clients/${this.clientSlug}`);
  }

  canvasCard(name: string): Locator {
    return this.page.getByRole("link").filter({ hasText: name }).first();
  }

  get anyCanvasCard(): Locator {
    return this.page.locator('a[href*="/canvases/"]').first();
  }
}
