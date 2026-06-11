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

  // ── Upload step ──────────────────────────────────────────────────────────────

  get brandDocumentsCard(): Locator {
    return this.page.getByText("Brand Documents").first();
  }

  get brandImagesCard(): Locator {
    return this.page.getByText("Brand Images").first();
  }

  get extractButton(): Locator {
    return this.page.getByRole("button", { name: /extract & build kb/i });
  }

  get addDocumentsZone(): Locator {
    return this.page.getByText("Add documents");
  }

  get addImagesZone(): Locator {
    return this.page.getByText("Add images");
  }

  get noDocumentsMessage(): Locator {
    return this.page.getByText("No documents uploaded yet");
  }

  get noImagesMessage(): Locator {
    return this.page.getByText("No images uploaded yet");
  }

  get uploadHintMessage(): Locator {
    return this.page.getByText("Upload at least one document to continue");
  }

  // ── Review step ──────────────────────────────────────────────────────────────

  moduleTab(label: string): Locator {
    return this.page.getByRole("tab", { name: new RegExp(label, "i") });
  }

  get saveButton(): Locator {
    return this.page.getByRole("button", { name: /^save$/i });
  }

  get markReadyButton(): Locator {
    return this.page.getByRole("button", {
      name: /mark kb ready|review all fields first|kb is ready/i,
    });
  }

  get sourceFilesButton(): Locator {
    return this.page.getByRole("button", { name: /source files/i }).or(
      this.page.getByTitle("Edit source documents & images")
    );
  }

  get sourceDrawer(): Locator {
    return this.page.getByText("Source Documents & Images");
  }

  get approveAllButton(): Locator {
    return this.page.getByRole("button", { name: /approve all/i }).first();
  }

  get firstRejectButton(): Locator {
    // exact: true avoids matching the Mark KB Ready button whose tooltip contains "reject"
    return this.page.getByTitle("Reject", { exact: true }).first();
  }

  get firstAIRefineButton(): Locator {
    return this.page.getByTitle("Refine with AI").first();
  }

  get aiRefinePopover(): Locator {
    return this.page.getByText("Refine with AI").last();
  }

  get aiRefineTextarea(): Locator {
    return this.page.getByPlaceholder(/make this slower/i);
  }

  get aiRefineSubmitButton(): Locator {
    return this.page.getByRole("button", { name: /^re-analyze$/i });
  }

  get reanalyzingIndicator(): Locator {
    return this.page.getByText("Re-analyzing…");
  }

  get reviewedCounter(): Locator {
    return this.page.getByText(/\d+ \/ \d+ reviewed/);
  }

  get unsavedBadge(): Locator {
    return this.page.getByText("Unsaved changes");
  }

  get restoreLink(): Locator {
    return this.page.getByText("Restore").first();
  }

  fieldLabel(label: string): Locator {
    return this.page.getByText(label, { exact: true }).first();
  }

  /** The <section> field row containing the given exact field label. */
  fieldRow(label: string): Locator {
    return this.page
      .locator("section")
      .filter({ has: this.page.getByText(label, { exact: true }) });
  }

  /** Colour swatch chips (rendered for colour-palette fields) within a field row. */
  colorSwatches(label: string): Locator {
    return this.fieldRow(label).locator('span[style*="background-color"]');
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  async isInUploadStep(): Promise<boolean> {
    return this.page
      .getByRole("button", { name: /extract & build kb/i })
      .isVisible()
      .catch(() => false);
  }

  async isInReviewStep(): Promise<boolean> {
    return this.page
      .getByRole("tab", { name: /brand voice/i })
      .isVisible()
      .catch(() => false);
  }
}
