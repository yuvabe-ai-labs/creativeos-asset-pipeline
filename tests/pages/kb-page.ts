import { type Page, type Locator } from "@playwright/test";

export class KBPage {
  readonly page: Page;
  readonly heading: Locator;

  constructor(page: Page, readonly clientSlug: string) {
    this.page = page;
    this.heading = page.getByRole("heading", { name: /brand knowledge base/i });
  }

  async goto() {
    await this.page.goto(`/clients/${this.clientSlug}/kb`);
    await this.heading.waitFor({ state: "visible" });
  }

  get uploadSection(): Locator {
    return this.page.locator("main");
  }

  get documentList(): Locator {
    return this.page.locator('[data-testid="document-list"], [class*="document"]').first();
  }

  get extractButton(): Locator {
    return this.page.getByRole("button", { name: /extract/i });
  }

  get analyzeButton(): Locator {
    return this.page.getByRole("button", { name: /analyze|re-analyze/i });
  }

  get docFileInput(): Locator {
    return this.page.locator('input[type="file"][accept=".pdf,.docx,.pptx,.md,.txt"]');
  }

  get imgFileInput(): Locator {
    return this.page.locator('input[type="file"][accept=".jpg,.jpeg,.png,.webp"]');
  }

  get saveButton(): Locator {
    return this.page.getByRole("button", { name: "Save" });
  }

  get approveAllButton(): Locator {
    return this.page.getByRole("button", { name: /approve all/i });
  }

  get markReadyButton(): Locator {
    return this.page.getByRole("button", { name: /mark kb ready|review all fields first/i });
  }

  get unsavedBadge(): Locator {
    return this.page.getByText("Unsaved changes");
  }

  tab(name: string | RegExp): Locator {
    return this.page.getByRole("tab", { name });
  }

  kbField(label: string): Locator {
    return this.page.getByText(label, { exact: false }).first();
  }
}
